import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, isSameStory, evaluate, makeTierResolver, makeGroupResolver, skeleton, fingerprint, matchScore } from '../src/verify.js';
import { rootDomain } from '../src/util.js';
import { config } from '../src/config.js';

const art = (title, host, tier, extra = {}) => ({ title, host, rootDomain: rootDomain(host), tier, source: host, publishedAt: Date.now(), ...extra });

test('same event with different wording clusters together', () => {
  assert.ok(isSameStory('RBI keeps repo rate unchanged at 6.25%, shifts stance to neutral', 'RBI holds repo rate at 6.25% and changes policy stance to neutral'));
  assert.ok(!isSameStory('RBI keeps repo rate unchanged at 6.25%', 'Sensex jumps 600 points as IT stocks rally'));
  assert.ok(!isSameStory('Sensex falls 500 points on weak global cues', 'Sensex rises 300 points as banks gain'));
});

test('real headlines: Gehlot CBI/ED probe stories match across outlets', () => {
  assert.ok(isSameStory(
    'Rajasthan: Gehlot seeks CBI, ED probe into IAS officer’s family property',
    'Gehlot demands CBI, ED probe into large property deals linked to senior Rajasthan IAS officer',
  ));
});

test('Hindi tokens keep their vowel signs and drop Hindi stopwords', () => {
  const t = tokenize('राजस्थान की 3,626 ग्राम पंचायतों में मतदान समाप्त');
  assert.ok(t.has('राजस्थान'.normalize('NFKD')));
  assert.ok(t.has('3626'));
  assert.ok(!t.has('की') && !t.has('में'));
});

test('phonetic skeleton bridges Hindi and English names', () => {
  const pairs = [['भजनलाल', 'Bhajanlal'], ['शर्मा', 'Sharma'], ['कांग्रेस', 'Congress'], ['भाजपा', 'BJP'], ['बीजेपी', 'BJP'],
    ['गहलोत', 'Gehlot'], ['राजस्थान', 'Rajasthan'], ['पुलिस', 'police'], ['जयपुर', 'Jaipur'], ['छत्तीसगढ़', 'Chhattisgarh'], ['पायलट', 'Pilot']];
  for (const [hi, en] of pairs) assert.equal(skeleton(tokenize(hi).values().next().value), skeleton(en.toLowerCase()), `${hi} vs ${en}`);
});

test('Hindi and English reports of the same event match; unrelated ones do not', () => {
  const en = fingerprint('Gehlot demands CBI, ED probe into property of IAS officer Shikhar Agarwal');
  const hi = fingerprint('गहलोत ने IAS अधिकारी शिखर अग्रवाल के परिवार की संपत्ति की CBI-ED जांच मांगी');
  assert.ok(matchScore(en, hi) > 0);
  const other = fingerprint('अशोक गहलोत का BJP को संदेश, भारत बचाओ रैली के बाद गिर गई थी सरकार');
  assert.equal(matchScore(en, other), 0);
});

test('the feed place name is not evidence of the same story', () => {
  const a = fingerprint('Rajasthan BJP announces candidates for Jaipur civic polls');
  const b = fingerprint('Rajasthan BJP slams Congress over Jaipur water crisis');
  const ignore = new Set(['rajasthan', 'jaipur', '~rjstn', '~jpr']);
  assert.equal(matchScore(a, b, (k) => ignore.has(k)), 0);
});

test('CJK headlines tokenise into bigrams', () => {
  assert.ok(isSameStory('東京で地震が発生', '東京で強い地震が発生'));
});

test('status rules', () => {
  assert.equal(evaluate([art('X happened', 'smallpaper.example', 'standard')]).status, 'unconfirmed');
  assert.equal(evaluate([art('A b c', 'one.example', 'standard'), art('A b d', 'two.example', 'standard')]).status, 'developing');
  assert.equal(evaluate([art('A b c', 'reuters.com', 'wire'), art('A b d', 'two.example', 'standard')]).status, 'verified');
  assert.equal(evaluate([art('Policy announced', 'rbi.org.in', 'official')]).status, 'verified');
  assert.equal(evaluate([art('A', 'one.example', 'standard'), art('B', 'two.example', 'standard'), art('C', 'three.example', 'standard')]).status, 'verified');
});

test('sister outlets of one media group count once', () => {
  const group = makeGroupResolver(config.groups);
  const mk = (title, host) => art(title, host, 'major', { group: group(host, rootDomain(host)) });
  const r = evaluate([mk('Gehlot seeks probe', 'bhaskar.com'), mk('Gehlot demands probe', 'bhaskarenglish.in')]);
  assert.equal(r.origins, 1);
  assert.equal(r.status, 'unconfirmed');
  assert.deepEqual(r.reasons.find((x) => x.code === 'syndicated'), { code: 'syndicated', n: 1 });
});

test('syndicated identical headlines count once; social never verifies', () => {
  const r = evaluate([art('Exact same headline', 'a.example', 'standard'), art('Exact same headline', 'b.example', 'standard')]);
  assert.equal(r.origins, 1);
  const s = evaluate([art('x', 'x.com/a', 'social'), art('y', 'x.com/b', 'social'), art('z', 'x.com/c', 'social')]);
  assert.equal(s.status, 'unconfirmed');
  assert.equal(s.signals, 3);
});

test('tier resolver covers national and Hindi regional outlets', () => {
  const resolve = makeTierResolver(config.sources);
  assert.equal(resolve('pib.gov.in'), 'official');
  assert.equal(resolve('dipr.rajasthan.gov.in'), 'official');
  assert.equal(resolve('in.reuters.com'), 'wire');
  assert.equal(resolve('bhaskar.com'), 'major');
  assert.equal(resolve('amarujala.com'), 'major');
  assert.equal(resolve('notreuters.com'), 'standard');
});

test('root domain handles multi-part suffixes', () => {
  assert.equal(rootDomain('economictimes.indiatimes.com'), 'indiatimes.com');
  assert.equal(rootDomain('news.bbc.co.uk'), 'bbc.co.uk');
});

test('headlines about unrelated places never merge; nested places can', async () => {
  const { placesConflict } = await import('../src/verify.js');
  const fp = (t) => fingerprint(t);
  assert.ok(placesConflict(fp('Earthquake of magnitude 4.2 hits Bikaner'), fp('Earthquake of magnitude 5.1 hits Nepal, tremors felt in Bihar')));
  assert.ok(placesConflict(fp('Fire breaks out at Jaipur chemical factory'), fp('जोधपुर में फैक्ट्री में आग')));
  assert.ok(!placesConflict(fp('Fire breaks out at Jaipur chemical factory'), fp('राजस्थान: फैक्ट्री में आग')));
  assert.ok(!placesConflict(fp('इज़राइल में चुनाव'), fp('Israel election results')));
  assert.deepEqual([...fp('Jaipur Murder: पत्नी की हत्या').places], ['IN:Jaipur']);
  assert.equal(matchScore(fp('Earthquake of magnitude 4.2 hits Bikaner'), fp('Earthquake of magnitude 5.1 hits Nepal')), 0);
});
