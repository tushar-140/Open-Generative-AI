import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, isSameStory, evaluate, makeTierResolver } from '../src/verify.js';
import { rootDomain } from '../src/util.js';

const art = (title, host, tier, extra = {}) => ({ title, host, rootDomain: rootDomain(host), tier, source: host, publishedAt: Date.now(), ...extra });

test('same event with different wording clusters together', () => {
  const a = tokenize('RBI keeps repo rate unchanged at 6.25%, shifts stance to neutral');
  const b = tokenize('RBI holds repo rate at 6.25% and changes policy stance to neutral');
  const c = tokenize('Sensex jumps 600 points as IT stocks rally');
  assert.ok(isSameStory(a, b));
  assert.ok(!isSameStory(a, c));
});

test('different events sharing a topic word stay apart', () => {
  const a = tokenize('Sensex falls 500 points on weak global cues');
  const b = tokenize('Sensex rises 300 points as banks gain');
  assert.ok(!isSameStory(a, b));
});

test('CJK headlines tokenise into bigrams', () => {
  assert.ok(isSameStory(tokenize('東京で地震が発生'), tokenize('東京で強い地震が発生')));
});

test('single outlet is unconfirmed', () => {
  assert.equal(evaluate([art('X happened', 'smallpaper.example', 'standard')]).status, 'unconfirmed');
});

test('two standard outlets are developing; wire + standard verifies', () => {
  assert.equal(evaluate([art('A b c', 'one.example', 'standard'), art('A b d', 'two.example', 'standard')]).status, 'developing');
  const r = evaluate([art('A b c', 'reuters.com', 'wire'), art('A b d', 'two.example', 'standard')]);
  assert.equal(r.status, 'verified');
  assert.ok(r.reasons.some((x) => x.startsWith('Wire service')));
});

test('official source verifies on its own', () => {
  assert.equal(evaluate([art('Policy announced', 'rbi.org.in', 'official')]).status, 'verified');
});

test('same domain and syndicated identical headlines count once', () => {
  const r = evaluate([
    art('Exact same headline', 'a.example', 'standard'),
    art('Exact same headline', 'b.example', 'standard'),
    art('Another take', 'news.a.example', 'standard'),
  ]);
  assert.equal(r.origins, 1);
  assert.equal(r.status, 'unconfirmed');
});

test('social signals never verify', () => {
  const r = evaluate([art('x', 'x.com/a', 'social'), art('y', 'x.com/b', 'social'), art('z', 'x.com/c', 'social')]);
  assert.equal(r.status, 'unconfirmed');
  assert.equal(r.signals, 3);
});

test('tier resolver matches suffixes and subdomains', () => {
  const resolve = makeTierResolver({ official: ['*.gov.in'], wire: ['reuters.com'], blocked: ['spam.example'] });
  assert.equal(resolve('pib.gov.in'), 'official');
  assert.equal(resolve('in.reuters.com'), 'wire');
  assert.equal(resolve('notreuters.com'), 'standard');
  assert.equal(resolve('spam.example'), 'blocked');
});

test('root domain handles multi-part suffixes', () => {
  assert.equal(rootDomain('economictimes.indiatimes.com'), 'indiatimes.com');
  assert.equal(rootDomain('news.bbc.co.uk'), 'bbc.co.uk');
});
