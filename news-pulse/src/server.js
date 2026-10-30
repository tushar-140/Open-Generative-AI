import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { config, countryByCode } from './config.js';
import { Store } from './store.js';
import { StoryBook } from './storybook.js';
import { Poller } from './poller.js';
import { Notifier } from './notifier.js';
import { adapters } from './sources/index.js';
import { feedKeywords, feedLabel, feedLangs, resolvePlace } from './query.js';
import { reasonText } from './verify.js';
import { hash, slug } from './util.js';

const store = new Store(config.dataDir);
const now = () => Date.now();

// --- state -----------------------------------------------------------------
if (!config.vapid.publicKey || !config.vapid.privateKey) {
  // Persist generated keys: rotating them would invalidate every existing subscription.
  store.data.vapid ||= webpush.generateVAPIDKeys();
  Object.assign(config.vapid, store.data.vapid);
}

const subscriptions = new Map(store.data.subscriptions.map((s) => [s.subscription.endpoint, s]));
const books = new Map(
  Object.entries(store.data.stories).map(([id, stories]) => [id, new StoryBook(id, config.rules, stories)]),
);
const customFeeds = new Map(store.data.customFeeds.map((f) => [f.id, f]));
const builtinIds = new Set(config.feeds.map((f) => f.id));
const markDirty = () => store.markDirty();

const notifier = new Notifier({ config, subscriptions, onChange: markDirty });
notifier.init(config.vapid);
const poller = new Poller({ config, adapters, notifier, books });

const allFeeds = () => [...config.feeds, ...customFeeds.values()];
const getFeed = (id) => config.feeds.find((f) => f.id === id) || customFeeds.get(id);
for (const f of allFeeds()) poller.add(f);

const snapshot = () => ({
  customFeeds: [...customFeeds.values()],
  stories: Object.fromEntries([...books].map(([id, b]) => [id, b.serialize()])),
  subscriptions: [...subscriptions.values()],
  vapid: store.data.vapid,
});
const save = () => {
  try {
    store.save(snapshot);
  } catch (e) {
    console.error(`[store] save failed: ${e.message}`);
  }
};

// --- live stream (SSE) -----------------------------------------------------
const streams = new Map(); // feedId -> Set<res>
poller.on('stories', (feedId, stories) => {
  markDirty();
  const clients = streams.get(feedId);
  if (!clients?.size) return;
  const msg = `event: stories\ndata: ${JSON.stringify(stories.map(StoryBook.toJSON))}\n\n`;
  for (const res of clients) res.write(msg);
});

// --- housekeeping ----------------------------------------------------------
setInterval(() => {
  for (const b of books.values()) b.prune(now(), config.retentionHours * 3600 * 1000);
  const idleMs = config.customFeedIdleDays * 86400 * 1000;
  const subscribed = new Set([...subscriptions.values()].flatMap((s) => s.feeds));
  for (const f of customFeeds.values()) {
    if (now() - (f.lastAccess || 0) > idleMs && !subscribed.has(f.id) && !streams.get(f.id)?.size) {
      poller.remove(f.id);
      customFeeds.delete(f.id);
      markDirty();
    }
  }
}, 15 * 60 * 1000).unref();
setInterval(() => store.dirty && save(), 10 * 1000).unref();

// --- helpers ---------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy':
    "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};
const publicDir = path.join(config.root, 'public');
const indexTemplate = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': isJson ? 'application/json' : 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req, limit = 16 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const feedFingerprint = (f) =>
  JSON.stringify([f.country, f.domain, (f.place || '').toLowerCase(), (f.keywords || []).map((k) => k.toLowerCase()).sort(), feedLangs(f).map((e) => e.lang).sort()]);

const createLimiter = new Map(); // ip -> timestamps
function allowCreate(ip) {
  const list = (createLimiter.get(ip) || []).filter((t) => now() - t < 3600 * 1000);
  if (list.length >= 30) return false;
  list.push(now());
  createLimiter.set(ip, list);
  return true;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function publicFeed(f) {
  const langs = feedLangs(f).map((e) => e.lang);
  return {
    id: f.id,
    label: { en: feedLabel(f, 'en'), hi: feedLabel(f, 'hi') },
    country: f.country,
    place: f.place || '',
    domain: f.domain,
    langs,
    keywords: f.keywords || [],
    effectiveKeywords: Object.fromEntries(langs.map((l) => [l, feedKeywords(f, l)])),
    custom: !builtinIds.has(f.id),
  };
}

function touch(feed) {
  if (customFeeds.has(feed.id)) feed.lastAccess = now();
}

// Index page with link-preview tags for the shared feed/story.
function renderIndex(url) {
  const feed = getFeed(url.searchParams.get('feed') || '');
  const story = feed && books.get(feed.id)?.get(url.searchParams.get('story') || '');
  const title = story ? story.title : feed ? `${feedLabel(feed, 'en')} — NewsPulse` : 'NewsPulse — verified news as it happens';
  const desc = story
    ? `${story.status === 'verified' ? 'Verified' : story.status === 'developing' ? 'Developing' : 'Unconfirmed'} · ${story.reasons.map(reasonText).join(' · ')}`
    : 'Real-time news for any place and topic, cross-checked across independent sources.';
  return indexTemplate
    .replaceAll('{{OG_TITLE}}', escapeHtml(title))
    .replaceAll('{{OG_DESC}}', escapeHtml(desc))
    .replaceAll('{{BASE}}', escapeHtml(config.publicUrl));
}

function serveStatic(req, res, url) {
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return send(res, 200, renderIndex(url), { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
  }
  const file = path.normalize(path.join(publicDir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(publicDir + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file);
    const noCache = ext === '.webmanifest' || file.endsWith('sw.js');
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': noCache ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(file).pipe(res);
  });
}

// --- API -------------------------------------------------------------------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  if (parts[1] === 'health') {
    return send(res, 200, { ok: true, feeds: allFeeds().length, subscriptions: subscriptions.size, uptime: process.uptime() });
  }

  if (parts[1] === 'meta' && method === 'GET') {
    return send(res, 200, {
      countries: config.countries.map((c) => ({ code: c.code, name: c.name, nameHi: c.nameHi, langs: c.editions.map((e) => e.lang) })),
      domains: Object.entries(config.domains).map(([id, d]) => ({ id, label: d.label, labelHi: d.labelHi, icon: d.icon, keywords: d.keywords })),
      places: Object.fromEntries(Object.entries(config.places).map(([cc, list]) => [cc, list.map((p) => ({ en: p.en[0], hi: p.hi[0], type: p.type, state: p.state }))])),
      vapidPublicKey: config.vapid.publicKey,
      intervals: config.intervals,
      sources: adapters.filter((a) => a.id !== 'rss').map((a) => ({ id: a.id, enabled: a.enabled({}) })),
    });
  }

  if (parts[1] === 'feeds') {
    if (parts.length === 2 && method === 'GET') return send(res, 200, allFeeds().map(publicFeed));

    if (parts.length === 2 && method === 'POST') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      const b = await readJson(req);
      const country = countryByCode.has(b.country) ? b.country : null;
      const domain = config.domains[b.domain] ? b.domain : null;
      if (!country || !domain) return send(res, 400, { error: 'country and domain are required' });
      const rawPlace = String(b.place || '').trim().slice(0, 60);
      // Canonical English name for known places, so "राजस्थान" and "rajasthan" share one feed.
      const place = resolvePlace(country, rawPlace)?.en[0] || rawPlace;
      const keywords = (Array.isArray(b.keywords) ? b.keywords : String(b.keywords || '').split(','))
        .map((k) => String(k).trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 12);
      if (domain === 'custom' && !keywords.length && !place) return send(res, 400, { error: 'Add keywords or a place' });
      const available = countryByCode.get(country).editions.map((e) => e.lang);
      const langs = (Array.isArray(b.langs) ? b.langs : []).filter((l) => available.includes(l));
      const finalLangs = (langs.length ? langs : available).sort();
      const fingerprint = JSON.stringify([country, domain, place.toLowerCase(), keywords.map((k) => k.toLowerCase()).sort(), finalLangs]);
      const id = `${slug(`${country}-${place}-${domain}`).replace(/-+/g, '-')}-${hash(fingerprint).slice(0, 6)}`;
      const existing = allFeeds().find((f) => f.id === id || feedFingerprint(f) === fingerprint);
      if (existing) {
        touch(existing);
        return send(res, 200, publicFeed(existing));
      }
      if (customFeeds.size >= config.maxCustomFeeds) return send(res, 429, { error: 'Feed limit reached on this server' });
      if (!allowCreate(ip)) return send(res, 429, { error: 'Too many new feeds, try again later' });
      const feed = { id, country, place, domain, keywords, langs: finalLangs, rss: [], createdAt: now(), lastAccess: now() };
      customFeeds.set(id, feed);
      poller.add(feed);
      markDirty();
      return send(res, 201, publicFeed(feed));
    }

    const feed = getFeed(parts[2]);
    if (!feed) return send(res, 404, { error: 'Unknown feed' });
    touch(feed);
    if (parts.length === 3 && method === 'GET') {
      return send(res, 200, { ...publicFeed(feed), sources: poller.status(feed.id) });
    }
    if (parts[3] === 'stories' && method === 'GET') {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);
      const stories = books.get(feed.id)?.list({ status: url.searchParams.get('status') || '', limit }) || [];
      const book = books.get(feed.id);
      return send(res, 200, { feed: publicFeed(feed), sources: poller.status(feed.id), counts: book?.counts() || {}, stories: stories.map(StoryBook.toJSON) },
        { 'cache-control': 'no-cache' });
    }
  }

  if (parts[1] === 'stream' && method === 'GET') {
    const feed = getFeed(url.searchParams.get('feed') || '');
    if (!feed) return send(res, 404, { error: 'Unknown feed' });
    touch(feed);
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    const set = streams.get(feed.id) || new Set();
    set.add(res);
    streams.set(feed.id, set);
    const beat = setInterval(() => res.write(`event: ping\ndata: ${JSON.stringify(poller.status(feed.id))}\n\n`), 25000);
    req.on('close', () => {
      clearInterval(beat);
      set.delete(res);
    });
    return;
  }

  if (parts[1] === 'push' && method === 'POST') {
    const b = await readJson(req);
    const sub = b.subscription;
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint)) return send(res, 400, { error: 'Invalid subscription' });
    if (parts[2] === 'subscribe') {
      if (!sub.keys?.p256dh || !sub.keys?.auth) return send(res, 400, { error: 'Invalid subscription' });
      const feeds = (Array.isArray(b.feeds) ? b.feeds : []).filter((id) => getFeed(id)).slice(0, 20);
      const level = b.level === 'developing' ? 'developing' : 'verified';
      const ui = b.ui === 'hi' ? 'hi' : 'en';
      if (!feeds.length) {
        subscriptions.delete(sub.endpoint);
      } else {
        subscriptions.set(sub.endpoint, { subscription: { endpoint: sub.endpoint, keys: sub.keys }, feeds, level, ui, updatedAt: now() });
      }
      markDirty();
      return send(res, 200, { ok: true, feeds, level });
    }
    if (parts[2] === 'status') {
      const s = subscriptions.get(sub.endpoint);
      return send(res, 200, s ? { feeds: s.feeds, level: s.level } : { feeds: [], level: 'verified' });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Internal error' });
    if (!e.status) console.error(e);
  }
});

server.listen(config.port, () => {
  console.log(`NewsPulse listening on :${config.port} · ${allFeeds().length} feeds · sources: ${adapters.filter((a) => a.enabled({ rss: [1] })).map((a) => a.id).join(', ')}`);
});

function shutdown() {
  poller.stop();
  save();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
