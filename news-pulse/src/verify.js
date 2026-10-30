// Story clustering and corroboration scoring.
//
// A "story" is a cluster of articles whose headlines describe the same event. A story's status:
//   verified    - an official source reported it, or enough independent outlets corroborate it
//   developing  - at least two independent outlets, not yet enough weight to verify
//   unconfirmed - a single outlet (or only social-media signals)
// Independence: one vote per publisher root domain, and outlets carrying an identical headline
// (syndicated wire copy) collapse into a single origin.

export const TIER_WEIGHT = { official: 3, wire: 3, major: 2, standard: 1, low: 0.5, social: 0 };
const TIER_ORDER = ['official', 'wire', 'major', 'standard', 'low', 'social'];

const STOP = new Set(
  ('the and but for from with into onto over under after before amid about than then that this these those ' +
    'are was were been being has have had its his her their our your will would can could may might not ' +
    'says said say new news live updates update latest report reports how why what who when where which ' +
    'more most just also via per out off all any some today yesterday tomorrow week year here there his him ' +
    'they them she you get gets got amp watch video photos').split(' '),
);

const CJK = /[぀-ヿ㐀-鿿가-힯]/;

export function normalizeTitle(t) {
  return String(t)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(title) {
  const out = new Set();
  for (let w of normalizeTitle(title).split(' ')) {
    if (!w) continue;
    if (CJK.test(w)) {
      // No word boundaries in CJK scripts: use character bigrams.
      for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2));
      continue;
    }
    if (w.length < 3 && !/^\d+$/.test(w)) continue;
    if (STOP.has(w)) continue;
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

export function similarity(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const min = Math.min(a.size, b.size);
  const union = a.size + b.size - inter;
  return { inter, overlap: min ? inter / min : 0, jaccard: union ? inter / union : 0 };
}

export function isSameStory(a, b) {
  const s = similarity(a, b);
  if (Math.min(a.size, b.size) <= 3) return s.inter >= 2 && s.overlap >= 0.67;
  return (s.inter >= 3 && s.overlap >= 0.6) || s.jaccard >= 0.45;
}

function domainMatches(host, pattern) {
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1));
  return host === pattern || host.endsWith(`.${pattern}`);
}

export function makeTierResolver(sources) {
  const order = ['blocked', 'official', 'wire', 'major', 'low'];
  return (host) => {
    for (const tier of order) {
      for (const p of sources[tier] || []) if (domainMatches(host, p)) return tier;
    }
    return 'standard';
  };
}

const better = (a, b) => TIER_WEIGHT[a.tier] > TIER_WEIGHT[b.tier] || (TIER_WEIGHT[a.tier] === TIER_WEIGHT[b.tier] && a.publishedAt < b.publishedAt);

export function evaluate(articles, rules = { verifiedScore: 4, verifiedOrigins: 3 }) {
  const outlets = new Map();
  let signals = 0;
  for (const a of articles) {
    if (a.tier === 'social') {
      signals++;
      continue;
    }
    const prev = outlets.get(a.rootDomain);
    if (!prev || better(a, prev)) outlets.set(a.rootDomain, a);
  }
  const origins = new Map();
  for (const a of outlets.values()) {
    const key = normalizeTitle(a.title);
    const prev = origins.get(key);
    if (!prev || better(a, prev)) origins.set(key, a);
  }
  const list = [...origins.values()];
  const score = list.reduce((s, a) => s + TIER_WEIGHT[a.tier], 0);
  const n = list.length;
  const official = list.find((a) => a.tier === 'official');
  const wire = list.find((a) => a.tier === 'wire');

  let status = 'unconfirmed';
  if (official || (n >= 2 && score >= rules.verifiedScore) || (n >= rules.verifiedOrigins && score >= rules.verifiedOrigins)) {
    status = 'verified';
  } else if (n >= 2) {
    status = 'developing';
  }

  const reasons = [];
  if (official) reasons.push(`Official source: ${official.source || official.rootDomain}`);
  reasons.push(n === 1 ? 'Single outlet so far' : `${n} independent outlets`);
  if (wire) reasons.push(`Wire service: ${wire.source || wire.rootDomain}`);
  if (outlets.size > n) reasons.push(`${outlets.size - n} syndicated cop${outlets.size - n === 1 ? 'y' : 'ies'} merged`);
  if (signals) reasons.push(`${signals} social signal${signals === 1 ? '' : 's'} (not counted)`);
  return { status, score, origins: n, outlets: outlets.size, signals, reasons };
}

// Picks the headline to display: best-tier, earliest article.
export function leadArticle(articles) {
  return articles.reduce((best, a) => (!best || better(a, best) ? a : best), null);
}

export const tierRank = (t) => TIER_ORDER.indexOf(t);
