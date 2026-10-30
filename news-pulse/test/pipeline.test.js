import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { Poller } from '../src/poller.js';
import * as gnews from '../src/sources/googleNews.js';
import * as gdelt from '../src/sources/gdelt.js';
import { fixture } from './helpers.js';

function setup() {
  const sent = [];
  const notifier = { notify: async (feed, story, level) => sent.push({ id: story.id, level, title: story.title }) };
  const poller = new Poller({ config, adapters: [], notifier, books: new Map() });
  const feed = { id: 'in-test', name: 'Test', country: 'IN', domain: 'markets', keywords: [] };
  poller.add(feed);
  return { poller, feed, sent };
}

test('google news + gdelt cluster into corroborated stories', async () => {
  const { poller, feed } = setup();
  await poller.ingest(feed, gnews.parse(fixture('gnews.xml')));
  await poller.ingest(feed, gdelt.parse(fixture('gdelt.json')));
  const stories = poller.books.get(feed.id).list();
  const rbi = stories.find((s) => /repo rate/i.test(s.title));
  assert.equal(rbi.status, 'verified');
  assert.equal(rbi.origins, 4);
  assert.equal(rbi.title, 'RBI keeps repo rate unchanged at 6.25%, shifts stance to neutral'); // wire headline leads
  const sensex = stories.find((s) => /sensex/i.test(s.title));
  // Two blogs ran the same syndicated headline, so they count as one origin: blog copy + NDTV.
  assert.equal(sensex.status, 'developing');
  assert.equal(sensex.outlets, 3);
  assert.equal(sensex.origins, 2);
  assert.ok(sensex.reasons.includes('1 syndicated copy merged'));
  const ipo = stories.find((s) => /IPO/.test(s.title));
  assert.equal(ipo.status, 'unconfirmed');
  assert.equal(stories.length, 3);
});

test('no notifications during warm-up backfill, then one per transition', async () => {
  const { poller, feed, sent } = setup();
  await poller.ingest(feed, gnews.parse(fixture('gnews.xml')));
  assert.equal(sent.length, 0);

  poller.state.get(feed.id).warmUntil = 0;
  const now = Date.now();
  const fresh = (id, title, host) => ({ id, title, url: `https://${host}/${id}`, sourceUrl: `https://${host}`, source: host, publishedAt: now - 60000 });
  await poller.ingest(feed, [fresh('n1', 'Major bank merger announced between Alpha Bank and Beta Bank', 'one.example')]);
  assert.equal(sent.length, 0); // single source
  await poller.ingest(feed, [fresh('n2', 'Alpha Bank and Beta Bank announce major merger', 'two.example')]);
  assert.deepEqual(sent.map((s) => s.level), ['developing']);
  await poller.ingest(feed, [fresh('n3', 'Alpha Bank, Beta Bank merger announced', 'reuters.com')]);
  assert.deepEqual(sent.map((s) => s.level), ['developing', 'verified']);
  await poller.ingest(feed, [fresh('n4', 'Alpha Bank Beta Bank merger announced today', 'bbc.com')]);
  assert.equal(sent.length, 2); // already verified: no repeat
});

test('stale stories are not pushed', async () => {
  const { poller, feed, sent } = setup();
  poller.state.get(feed.id).warmUntil = 0;
  const old = Date.now() - 5 * 3600e3;
  const mk = (id, host, title) => ({ id, title, url: `https://${host}/${id}`, sourceUrl: `https://${host}`, publishedAt: old });
  await poller.ingest(feed, [
    mk('o1', 'reuters.com', 'Cyclone makes landfall near eastern coast'),
    mk('o2', 'apnews.com', 'Cyclone landfall on eastern coast, thousands evacuated'),
  ]);
  assert.equal(poller.books.get(feed.id).list()[0].status, 'verified');
  assert.equal(sent.length, 0);
});
