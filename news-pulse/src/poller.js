import { EventEmitter } from 'node:events';
import { StoryBook } from './storybook.js';
import { makeTierResolver } from './verify.js';
import { hostOf, rootDomain } from './util.js';

// Schedules every source adapter for every feed, clusters results and triggers notifications.
export class Poller extends EventEmitter {
  constructor({ config, adapters, notifier, books }) {
    super();
    this.config = config;
    this.adapters = adapters;
    this.notifier = notifier;
    this.books = books; // Map feedId -> StoryBook
    this.feeds = new Map();
    this.state = new Map(); // feedId -> { timers, warmUntil, sources: {} }
    this.resolveTier = makeTierResolver(config.sources);
    this.stagger = 0;
  }

  add(feed) {
    if (this.feeds.has(feed.id)) return;
    this.feeds.set(feed.id, feed);
    if (!this.books.has(feed.id)) this.books.set(feed.id, new StoryBook(feed.id, this.config.rules));
    const active = this.adapters.filter((a) => a.enabled(feed));
    const maxInterval = Math.max(60, ...active.map((a) => this.config.intervals[a.id]));
    const st = {
      timers: [],
      // A brand-new feed backfills the last hour; don't fire notifications for that backlog.
      warmUntil: this.books.get(feed.id).size === 0 ? Date.now() + (maxInterval + 60) * 1000 : 0,
      sources: {},
    };
    this.state.set(feed.id, st);
    for (const adapter of active) {
      const every = this.config.intervals[adapter.id] * 1000;
      // Stagger first runs so many feeds don't hit a source at the same instant.
      const delay = (this.stagger++ % 30) * 1000;
      st.timers.push(setTimeout(() => {
        this.run(feed, adapter);
        st.timers.push(setInterval(() => this.run(feed, adapter), every + Math.random() * 5000));
      }, delay));
    }
  }

  remove(feedId) {
    const st = this.state.get(feedId);
    if (st) st.timers.forEach((t) => clearTimeout(t));
    this.state.delete(feedId);
    this.feeds.delete(feedId);
    this.books.delete(feedId);
  }

  stop() {
    for (const id of [...this.feeds.keys()]) {
      this.state.get(id)?.timers.forEach((t) => clearTimeout(t));
    }
  }

  enrich(item, now) {
    const host = item.host || hostOf(item.sourceUrl || item.url);
    const tier = item.tier || this.resolveTier(host);
    if (tier === 'blocked' || !host) return null;
    const maxAge = this.config.ingestMaxAgeHours * 3600 * 1000;
    if (item.publishedAt < now - maxAge) return null;
    return {
      ...item,
      host,
      rootDomain: rootDomain(host),
      tier,
      source: item.source || host,
      publishedAt: Math.min(item.publishedAt, now),
    };
  }

  async run(feed, adapter) {
    const st = this.state.get(feed.id);
    if (!st) return;
    const src = (st.sources[adapter.id] ||= { runs: 0, errors: 0 });
    src.lastRun = Date.now();
    src.runs++;
    try {
      const items = await adapter.fetchItems(feed);
      src.lastOk = Date.now();
      src.lastCount = items.length;
      delete src.lastError;
      await this.ingest(feed, items);
    } catch (e) {
      src.errors++;
      src.lastError = e.message;
      console.warn(`[poll] ${feed.id}/${adapter.id}: ${e.message}`);
    }
  }

  async ingest(feed, items, now = Date.now()) {
    const book = this.books.get(feed.id);
    const st = this.state.get(feed.id);
    if (!book || !st) return;
    const enriched = items.map((i) => this.enrich(i, now)).filter(Boolean);
    const { changed, transitions } = book.ingest(enriched, now);
    if (!changed.length) return;
    this.emit('stories', feed.id, changed);

    const warm = now < st.warmUntil;
    const maxAge = this.config.notifyMaxAgeMin * 60 * 1000;
    for (const { story, to } of transitions) {
      if (to !== 'developing' && to !== 'verified') continue;
      if (story.notified[to]) continue;
      story.notified[to] = now;
      if (to === 'verified') story.notified.developing ||= now;
      if (warm || story.publishedAt < now - maxAge) continue;
      await this.notifier.notify(feed, story, to, now);
    }
  }

  status(feedId) {
    return this.state.get(feedId)?.sources || {};
  }
}
