import { fingerprint, matchScore, evaluate, leadArticle } from './verify.js';
import { hash } from './util.js';

const MATCH_WINDOW_MS = 24 * 3600 * 1000;
const MAX_STORIES = 400;
const MAX_ARTICLES_PER_STORY = 60;
const MAX_FINGERPRINTS = 12;
// A term found in more than this share of live stories is treated as generic for the feed.
const COMMON_SHARE = 0.15;
const COMMON_MIN_STORIES = 12;
const ARTICLE_FIELDS = ['id', 'title', 'url', 'source', 'host', 'rootDomain', 'group', 'tier', 'lang', 'publishedAt', 'via', 'image'];

const pick = (a) => Object.fromEntries(ARTICLE_FIELDS.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));
const keysOf = (fp) => [...fp.tokens, ...[...fp.skel].map((k) => `~${k}`)];

// Holds the clustered stories for one feed.
export class StoryBook {
  constructor(feedId, rules, stories = [], semantic = null) {
    this.feedId = feedId;
    this.rules = rules;
    this.semantic = semantic; // cosine thresholds, used when articles carry vectors
    this.stories = new Map();
    this.seen = new Set();
    this.df = new Map(); // term -> number of stories containing it
    this.ignore = new Set();
    this.isCommon = (k) =>
      this.ignore.has(k) ||
      (this.stories.size >= COMMON_MIN_STORIES && (this.df.get(k) || 0) / this.stories.size > COMMON_SHARE);
    for (const s of stories) this.#hydrate(s);
  }

  // Terms that never count as evidence of "same story" in this feed (its own place names).
  setIgnore(phrases) {
    this.ignore = new Set(phrases.flatMap((p) => keysOf(fingerprint(p))));
  }

  #hydrate(s) {
    s._fps = [];
    s._keys = new Set();
    this.stories.set(s.id, s);
    for (const a of s.articles) {
      this.seen.add(a.id);
      this.#index(s, { ...fingerprint(a.title), title: a.title });
    }
  }

  // Fingerprints of restored stories that still need an embedding.
  missingVectors() {
    return [...this.stories.values()].flatMap((s) => s._fps.filter((fp) => !fp.vec));
  }

  #index(story, fp) {
    if (story._fps.length < MAX_FINGERPRINTS) story._fps.push(fp);
    for (const k of keysOf(fp)) {
      if (story._keys.has(k)) continue;
      story._keys.add(k);
      this.df.set(k, (this.df.get(k) || 0) + 1);
    }
  }

  get size() {
    return this.stories.size;
  }

  #bestMatch(fp, now) {
    let best = null;
    let bestScore = 0;
    for (const s of this.stories.values()) {
      if (now - s.updatedAt > MATCH_WINDOW_MS) continue;
      for (const other of s._fps) {
        const score = matchScore(fp, other, this.isCommon, this.semantic);
        if (score > bestScore) {
          best = s;
          bestScore = score;
        }
      }
    }
    return best;
  }

  // Adds articles, returns the stories that changed and any status transitions.
  ingest(articles, now = Date.now()) {
    const changed = new Map();
    const before = new Map();
    for (const a of articles) {
      if (this.seen.has(a.id)) continue;
      this.seen.add(a.id);
      const fp = { ...fingerprint(a.title), title: a.title, vec: a._vec };
      if (!fp.tokens.size) continue;
      let story = this.#bestMatch(fp, now);
      if (!story) {
        story = {
          id: hash(`${this.feedId}:${a.id}`),
          feedId: this.feedId,
          firstSeen: now,
          publishedAt: a.publishedAt,
          latestAt: a.publishedAt,
          updatedAt: now,
          status: null,
          notified: {},
          articles: [],
          _fps: [],
          _keys: new Set(),
        };
        this.stories.set(story.id, story);
      }
      if (!before.has(story.id)) before.set(story.id, story.status);
      if (story.articles.length >= MAX_ARTICLES_PER_STORY) continue;
      story.articles.push(pick(a));
      this.#index(story, fp);
      story.updatedAt = now;
      story.publishedAt = Math.min(story.publishedAt, a.publishedAt);
      story.latestAt = Math.max(story.latestAt, a.publishedAt);
      changed.set(story.id, story);
    }

    const transitions = [];
    for (const s of changed.values()) {
      Object.assign(s, evaluate(s.articles, this.rules));
      const pool = s.articles.filter((a) => a.tier !== 'social');
      const lead = leadArticle(pool.length ? pool : s.articles);
      s.title = lead.title;
      s.url = lead.url;
      // Best headline per language, so readers see Hindi or English as they prefer.
      s.titles = {};
      for (const lang of s.langs) {
        const l = leadArticle(pool.filter((a) => a.lang === lang));
        if (l) s.titles[lang] = { title: l.title, url: l.url };
      }
      s.image = s.articles.find((a) => a.image)?.image;
      s.articles.sort((x, y) => x.publishedAt - y.publishedAt);
      const prev = before.get(s.id);
      if (prev !== s.status) transitions.push({ story: s, from: prev, to: s.status });
    }
    return { changed: [...changed.values()], transitions };
  }

  prune(now, retentionMs) {
    const sorted = [...this.stories.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    sorted.forEach((s, i) => {
      if (i >= MAX_STORIES || now - s.updatedAt > retentionMs) {
        this.stories.delete(s.id);
        for (const a of s.articles) this.seen.delete(a.id);
        for (const k of s._keys) {
          const n = (this.df.get(k) || 1) - 1;
          if (n) this.df.set(k, n);
          else this.df.delete(k);
        }
      }
    });
  }

  get(id) {
    return this.stories.get(id);
  }

  list({ status, limit = 100 } = {}) {
    const statuses = status ? new Set(status.split(',')) : null;
    return [...this.stories.values()]
      .filter((s) => !statuses || statuses.has(s.status))
      .sort((a, b) => b.latestAt - a.latestAt)
      .slice(0, limit);
  }

  counts() {
    const c = { verified: 0, developing: 0, unconfirmed: 0 };
    for (const s of this.stories.values()) c[s.status] = (c[s.status] || 0) + 1;
    return c;
  }

  serialize() {
    return [...this.stories.values()].map(StoryBook.toJSON);
  }

  static toJSON(s) {
    const { _fps, _keys, ...rest } = s;
    return rest;
  }
}
