import test from 'node:test';
import assert from 'node:assert/strict';
import * as gnews from '../src/sources/googleNews.js';
import * as gdelt from '../src/sources/gdelt.js';
import * as x from '../src/sources/x.js';
import { parseFeed } from '../src/sources/xml.js';
import { fixture } from './helpers.js';

const q = (u) => new URL(u).searchParams.get('q');

test('regional feed queries both English and Hindi editions with localised place and keywords', () => {
  const urls = gnews.buildUrls({ country: 'IN', place: 'Rajasthan', domain: 'politics', keywords: [] });
  assert.deepEqual(urls.map((u) => u.lang), ['en', 'hi']);
  const en = q(urls[0].url);
  const hi = q(urls[1].url);
  assert.match(en, /^\(election OR minister OR "chief minister" OR MLA OR assembly/);
  assert.match(en, /BJP OR Congress/);
  assert.match(en, / Rajasthan when:12h$/);
  assert.match(hi, /^\(चुनाव OR मंत्री OR मुख्यमंत्री/);
  assert.match(hi, /भाजपा OR कांग्रेस/);
  assert.match(hi, / राजस्थान when:12h$/);
  assert.equal(new URL(urls[1].url).searchParams.get('ceid'), 'IN:hi');
});

test('place typed in Hindi resolves to the same aliases', () => {
  const urls = gnews.buildUrls({ country: 'IN', place: 'राजस्थान', domain: 'politics', langs: ['en'] });
  assert.equal(urls.length, 1);
  assert.match(q(urls[0].url), / Rajasthan when:12h$/);
});

test('cities with alternate spellings search all of them', () => {
  const [en] = gnews.buildUrls({ country: 'IN', place: 'Bangalore', domain: 'tech', langs: ['en'] });
  assert.match(q(en.url), /\(Bengaluru OR Bangalore\)/);
});

test('country feeds without a place are anchored to the country in English only', () => {
  const [en, hi] = gnews.buildUrls({ country: 'IN', place: '', domain: 'markets', keywords: [] });
  assert.match(q(en.url), /\(India OR Indian OR Sensex OR Nifty OR RBI OR SEBI OR rupee\) when:2h$/);
  assert.doesNotMatch(q(hi.url), /India/);
});

test('custom English keywords still work in the Hindi edition when no Hindi ones are given', () => {
  const [, hi] = gnews.buildUrls({ country: 'IN', place: 'Jaipur', domain: 'custom', keywords: ['metro'] });
  assert.match(q(hi.url), /^metro जयपुर when:12h$/);
});

test('google news without keywords falls back to top stories', () => {
  assert.match(gnews.buildUrls({ country: 'US', domain: 'custom', keywords: [] })[0].url, /\/rss\?hl=en-US&gl=US/);
});

test('google news parse strips publisher and section suffixes and tags language', () => {
  const items = gnews.parse(fixture('gnews.xml'), 'en');
  assert.equal(items.length, 6);
  assert.equal(items[0].title, 'RBI keeps repo rate unchanged at 6.25%, shifts stance to neutral');
  assert.equal(items[0].sourceUrl, 'https://www.reuters.com');
  assert.equal(items[0].lang, 'en');
  assert.equal(gnews.cleanTitle('कौन बना सरपंच - Bhilwara News - Dainik Bhaskar', 'Dainik Bhaskar'), 'कौन बना सरपंच');
});

test('gdelt query covers place aliases, both languages and source country', () => {
  const u = new URL(gdelt.buildUrl({ country: 'IN', place: 'Rajasthan', domain: 'politics', keywords: [] }));
  const query = u.searchParams.get('query');
  assert.match(query, /^\(election OR minister/);
  assert.match(query, /"Rajasthan" sourcecountry:india \(sourcelang:english OR sourcelang:hindi\)$/);
  assert.equal(u.searchParams.get('timespan'), '12h');
});

test('gdelt drops too-short terms and skips feeds with nothing to search', () => {
  const query = new URL(gdelt.buildUrl({ country: 'US', domain: 'custom', keywords: ['AI', 'chips'] })).searchParams.get('query');
  assert.equal(query, 'chips sourcecountry:unitedstates sourcelang:english');
  assert.equal(gdelt.buildUrl({ country: 'WORLD', domain: 'custom', keywords: [] }), null);
});

test('gdelt parse handles json, maps language and reports text errors', () => {
  const items = gdelt.parse(fixture('gdelt.json'));
  assert.equal(items.length, 2);
  assert.equal(items[0].lang, 'en');
  assert.equal(items[0].image, 'https://images.example/rbi.jpg');
  assert.throws(() => gdelt.parse('The specified phrase is too short.'), /too short/);
});

test('atom feeds parse', () => {
  const items = parseFeed(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>q1</id>
    <title>M 6.1 - 20 km S of Town, Japan</title><updated>2026-10-30T10:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://earthquake.usgs.gov/earthquakes/eventpage/q1"/></entry></feed>`);
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
  assert.equal(items[1].tier, 'social');
});
