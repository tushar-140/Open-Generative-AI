import test from 'node:test';
import assert from 'node:assert/strict';
import * as gnews from '../src/sources/googleNews.js';
import * as gdelt from '../src/sources/gdelt.js';
import * as x from '../src/sources/x.js';
import { parseFeed } from '../src/sources/xml.js';
import { fixture } from './helpers.js';

const feed = { id: 'f', country: 'IN', place: 'Mumbai', domain: 'custom', keywords: ['RBI', 'repo rate'] };

test('google news url carries query, recency and edition', () => {
  const u = new URL(gnews.buildUrl(feed));
  assert.equal(u.pathname, '/rss/search');
  assert.equal(u.searchParams.get('q'), '(RBI OR "repo rate") "Mumbai" when:1h');
  assert.equal(u.searchParams.get('gl'), 'IN');
  assert.equal(u.searchParams.get('ceid'), 'IN:en');
});

test('google news without keywords falls back to top stories', () => {
  assert.match(gnews.buildUrl({ country: 'US', domain: 'custom', keywords: [] }), /\/rss\?hl=en-US&gl=US/);
});

test('google news parse strips publisher suffix and keeps source url', () => {
  const items = gnews.parse(fixture('gnews.xml'));
  assert.equal(items.length, 6);
  assert.equal(items[0].title, 'RBI keeps repo rate unchanged at 6.25%, shifts stance to neutral');
  assert.equal(items[0].source, 'Reuters');
  assert.equal(items[0].sourceUrl, 'https://www.reuters.com');
  assert.ok(items[0].publishedAt > Date.now() - 3600e3);
});

test('gdelt url drops too-short terms and filters by source country', () => {
  const u = new URL(gdelt.buildUrl({ ...feed, keywords: ['AI', 'repo rate', 'RBI'] }));
  assert.equal(u.searchParams.get('query'), '("repo rate" OR RBI) "Mumbai" sourcecountry:india');
  assert.equal(u.searchParams.get('timespan'), '1h');
});

test('gdelt skips feeds with nothing to search', () => {
  assert.equal(gdelt.buildUrl({ country: 'WORLD', domain: 'custom', keywords: [] }), null);
});

test('gdelt parse handles json and reports text errors', () => {
  const items = gdelt.parse(fixture('gdelt.json'));
  assert.equal(items.length, 2);
  assert.equal(items[0].source, 'livemint.com');
  assert.equal(items[0].image, 'https://images.example/rbi.jpg');
  assert.ok(Math.abs(items[0].publishedAt - (Date.now() - 3 * 60000)) < 2000);
  assert.throws(() => gdelt.parse('The specified phrase is too short.'), /too short/);
});

test('atom feeds parse', () => {
  const items = parseFeed(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>q1</id>
    <title>M 6.1 - 20 km S of Town, Japan</title><updated>2026-10-30T10:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://earthquake.usgs.gov/earthquakes/eventpage/q1"/></entry></feed>`);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://earthquake.usgs.gov/earthquakes/eventpage/q1');
});

test('x posts are signals unless from an official handle', () => {
  const items = x.parse(
    {
      data: [
        { id: '1', author_id: 'a', text: 'RBI keeps repo rate unchanged https://t.co/x', created_at: new Date().toISOString() },
        { id: '2', author_id: 'b', text: 'Repo rate unchanged!!', created_at: new Date().toISOString() },
      ],
      includes: { users: [{ id: 'a', username: 'RBI' }, { id: 'b', username: 'someone' }] },
    },
    { xOfficialHandles: ['@rbi'] },
  );
  assert.equal(items[0].tier, 'official');
  assert.equal(items[0].title, 'RBI keeps repo rate unchanged');
  assert.equal(items[1].tier, 'social');
});
