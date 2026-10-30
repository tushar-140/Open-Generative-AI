import { tokenize, isSameStory, similarity, evaluate, leadArticle } from './verify.js';
import { hash } from './util.js';

const MATCH_WINDOW_MS = 24 * 3600 * 1000;
const MAX_STORIES = 400;
const MAX_ARTICLES_PER_STORY = 60;
const MAX_TOKEN_SETS = 12;
const ARTICLE_FIELDS = ['id', 'title', 'url', 'source', 'host', 'rootDomain', 'tier', 'publishedAt', 'via', 'image'];

const pick = (a) => Object.fromEntries(ARTICLE_FIELDS.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));

// Holds the clustered stories for one feed.
export class StoryBook {
  constructor(feedId, rules, stories = []) {
    this.feedId = feedId;
    this.rules = rules;
    this.stories = new Map();
    this.seen = new Set();
    for (const s of stories) this.#hydrate(s);
  }

  #hydrate(s) {
    s._tokens = s.articles.slice(0, MAX_TOKEN_SETS).map((a) => tokenize(a.title));
    this.stories.set(s.id, s);
    for (const a of s.articles) this.seen.add(a.id);
  }

  get size() {
    return this.stories.size;
  }

  #bestMatch(tokens, now) {
    let best = null;
    let bestScore = 0;
    for (const s of this.stories.values()) {
      if (now - s.updatedAt > MATCH_WINDOW_MS) continue;
      for (const t of s._tokens) {
        if (!isSameStory(t, tokens)) continue;
        const { jaccard } = similarity(t, tokens);
        if (jaccard > bestScore) {
          best = s;
          bestScore = jaccard;
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
      const tokens = tokenize(a.title);
      if (!tokens.size) continue;
      let story = this.#bestMatch(tokens, now);
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
          _tokens: [],
        };
        this.stories.set(story.id, story);
      }
      if (!before.has(story.id)) before.set(story.id, story.status);
      if (story.articles.length >= MAX_ARTICLES_PER_STORY) continue;
      story.articles.push(pick(a));
      if (story._tokens.length < MAX_TOKEN_SETS) story._tokens.push(tokens);
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

  serialize() {
    return [...this.stories.values()].map(StoryBook.toJSON);
  }

  static toJSON(s) {
    const { _tokens, ...rest } = s;
    return rest;
  }
}
