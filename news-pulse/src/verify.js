import { config } from './config.js';

// Story clustering and corroboration scoring.
//
// A "story" is a cluster of articles whose headlines describe the same event. A story's status:
//   verified    - an official source reported it, or enough independent outlets corroborate it
//   developing  - at least two independent outlets, not yet enough weight to verify
//   unconfirmed - a single outlet (or only social-media signals)
// Independence: one vote per publisher group (sister outlets such as Dainik Bhaskar and Bhaskar
// English share one), and outlets carrying an identical headline (syndicated copy) collapse
// into a single origin.
//
// Hindi and English headlines about the same event are matched through a phonetic consonant
// skeleton: names, places, parties and numbers ("भजनलाल शर्मा" ~ "Bhajanlal Sharma",
// "कांग्रेस" ~ "Congress", "भाजपा" ~ "BJP") reduce to the same key in both scripts.

export const TIER_WEIGHT = { official: 3, wire: 3, major: 2, standard: 1, low: 0.5, social: 0 };

const STOP = new Set(
  ('the and but for from with into onto over under after before amid about than then that this these those ' +
    'are was were been being has have had its his her their our your will would can could may might not ' +
    'says said say new news live updates update latest report reports how why what who when where which ' +
    'more most just also via per out off all any some today yesterday tomorrow week year here there him during ' +
    'they them she you get gets got amp watch video photos read click know check full list').split(' '),
);

const HI_STOP = new Set(
  ('का की के को में से ने पर और है हैं था थे थी यह वह ये वो एक लिए भी तो ही कि जो किया गया गई गए कर करें करने ' +
    'करते करेंगे बाद साथ अब तक नहीं हुआ हुई हुए रहे रही रहा होगा होगी होंगे दिया दी दिए लेकर बीच बताया कहा ' +
    'कहते जाने वाले वाली वाला अपने अपनी अपना इस उस इन उन जब तब सकते सकता सकती आज कल फिर बड़ा बड़ी बड़े नया ' +
    'नई नए खबर खबरें लाइव अपडेट पढ़ें देखें सबसे पहले बोले बोली होने हो रहा जा रहे लिया मिला मिली गये').split(' '),
);

export const DEVANAGARI = /[\u0900-\u097F]/;
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

export function normalizeTitle(t) {
  return String(t)
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966))
    .replace(/(\d)[,.](?=\d)/g, '$1')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Outlets write ज़/ज, फ़/फ interchangeably; keep the nukta only where it changes the sound (ड़, ढ़).
    .replace(/([^\u0921\u0922])\u093C/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
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
    if (DEVANAGARI.test(w)) {
      if (!HI_STOP.has(w.normalize('NFC')) && [...w].length >= 2) out.add(w);
      continue;
    }
    if (w.length < 3 && !/^\d+$/.test(w)) continue;
    if (STOP.has(w)) continue;
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

// --- phonetic skeleton -----------------------------------------------------
const DEV_CONSONANTS = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', ळ: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h', 'ं': 'n', 'ँ': 'n', 'ः': 'h',
};
const NUKTA = '़';

// Consonants only: vowels are dropped from the skeleton anyway.
export function transliterate(word) {
  const chars = [...word.normalize('NFKD')];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (chars[i + 1] === NUKTA && (c === 'ड' || c === 'ढ')) {
      out += 'r';
      continue;
    }
    out += DEV_CONSONANTS[c] || '';
  }
  return out;
}

export function phoneticKey(latin) {
  return latin
    .toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/ch/g, 'C')
    .replace(/ck/g, 'k')
    .replace(/c/g, 'k')
    .replace(/C/g, 'c')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/f/g, 'p')
    .replace(/[^a-z0-9]/g, '')
    .replace(/[haeiouy]/g, '')
    .replace(/(.)\1+/g, '$1');
}

export function skeleton(token) {
  if (/^\d+$/.test(token)) return token;
  if (CJK.test(token)) return '';
  const key = phoneticKey(DEVANAGARI.test(token) ? transliterate(token) : token);
  // Acronyms (CBI, IAS) collapse to < 3 consonants; keep them verbatim, as Hindi headlines print them in Latin too.
  return key.length < 3 && /^[a-z]{3,4}$/.test(token) ? token : key;
}

export function fingerprint(title) {
  const tokens = tokenize(title);
  const skel = new Set();
  for (const t of tokens) {
    const k = skeleton(t);
    if (k.length >= 3) skel.add(k);
  }
  const script = DEVANAGARI.test(title) ? 'deva' : CJK.test(title) ? 'cjk' : 'latn';
  const fp = { script, tokens, skel };
  fp.places = PLACE_INDEX_READY ? placesIn(fp) : new Set();
  // Two-letter country abbreviations are dropped by the tokenizer; catch them in the raw title (case-sensitive).
  if (PLACE_INDEX_READY) for (const [re, id] of SHORT_PLACES) if (re.test(title)) fp.places.add(id);
  return fp;
}

// --- places ----------------------------------------------------------------
// Countries (from ICU, English + Hindi names) and the gazetteer (Indian states and cities with parents).
// Two headlines naming unrelated places ("Bikaner" vs "Nepal") are never the same story.
let PLACE_INDEX_READY = false;
const SHORT_PLACES = [[/\bU\.?S\.?(?=[\s,:;'’-]|$)/, 'US'], [/\bUK\b/, 'GB']];
const PLACES = [];
const PARENT = new Map();

function buildPlaceIndex() {
  const en = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const hi = new Intl.DisplayNames(['hi'], { type: 'region', fallback: 'none' });
  const extra = { US: ['USA', 'America', 'United States'], GB: ['Britain', 'England', 'ब्रिटेन'], AE: ['UAE', 'Dubai'], IN: ['भारत'] };
  for (const c of config.countries) if (c.code !== 'WORLD') extra[c.code] = [...(extra[c.code] || []), c.name, c.nameHi];
  const add = (id, names, parent) => {
    const keys = [...new Set(names.filter(Boolean))].map(tokenize).filter((k) => k.size);
    PLACES.push({ id, keys });
    if (parent) PARENT.set(id, parent);
  };
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = en.of(code);
      if (name && name !== code) add(code, [name, hi.of(code), ...(extra[code] || [])]);
    }
  }
  for (const [cc, list] of Object.entries(config.places)) {
    for (const p of list) add(`${cc}:${p.en[0]}`, [...p.en, ...p.hi], p.state ? `${cc}:${p.state}` : cc);
  }
  PLACE_INDEX_READY = true;
}

const subset = (small, big) => small.size > 0 && [...small].every((k) => big.has(k));

function placesIn(fp) {
  const found = new Set();
  for (const p of PLACES) {
    // Exact words only: every place has its Hindi and English spellings in the index, and phonetic
    // keys are too loose for single words (पत्नी "wife" ~ Patna).
    if (p.keys.some((k) => subset(k, fp.tokens))) found.add(p.id);
  }
  return found;
}

const lineage = (id) => {
  const out = [id];
  for (let p = PARENT.get(id); p; p = PARENT.get(p)) out.push(p);
  return out;
};

// True when both headlines name places and none of them coincide or contain one another.
export function placesConflict(a, b) {
  if (!a.places?.size || !b.places?.size) return false;
  for (const x of a.places) {
    for (const y of b.places) if (lineage(x).includes(y) || lineage(y).includes(x)) return false;
  }
  return true;
}

// --- matching --------------------------------------------------------------
export function similarity(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const min = Math.min(a.size, b.size);
  const union = a.size + b.size - inter;
  return { inter, overlap: min ? inter / min : 0, jaccard: union ? inter / union : 0 };
}

// Same-script headline match on word sets.
export function lexicalMatch(a, b) {
  const s = similarity(a, b);
  if (Math.min(a.size, b.size) <= 3) return s.inter >= 2 && s.overlap >= 0.67;
  return (s.inter >= 3 && s.overlap >= 0.6) || (s.inter >= 4 && s.overlap >= 0.5) || s.jaccard >= 0.45;
}

const without = (set, drop) => {
  const out = new Set();
  for (const k of set) if (!drop(k)) out.add(k);
  return out;
};

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
const numbers = (tokens) => [...tokens].filter((t) => /^\d{2,}$/.test(t));

// Meaning-level match from sentence embeddings (when available). Guard rails against the known
// weaknesses of embeddings: they must share at least one specific term, and headlines quoting
// different figures ("falls 500 points" vs "rises 300 points") are never merged this way.
export function semanticScore(a, b, isCommon, thresholds) {
  if (!a.vec || !b.vec || !thresholds) return 0;
  const cos = dot(a.vec, b.vec);
  if (cos < (a.script === b.script ? thresholds.sameLang : thresholds.crossLang)) return 0;
  const na = numbers(a.tokens);
  const nb = new Set(numbers(b.tokens));
  if (na.length && nb.size && !na.some((n) => nb.has(n))) return 0;
  const shared =
    similarity(without(a.tokens, isCommon), without(b.tokens, isCommon)).inter +
    similarity(without(a.skel, (k) => isCommon(`~${k}`)), without(b.skel, (k) => isCommon(`~${k}`))).inter;
  return shared >= 1 ? cos : 0;
}

// Returns a match score (0 = different stories). `isCommon(key)` drops terms that appear across
// many stories in this feed (e.g. the feed's own place name), which otherwise cause false merges.
export function matchScore(a, b, isCommon = () => false, thresholds = null) {
  if (placesConflict(a, b)) return 0;
  return Math.max(lexicalScore(a, b, isCommon), semanticScore(a, b, isCommon, thresholds));
}

function lexicalScore(a, b, isCommon) {
  if (a.script === b.script) {
    const ta = without(a.tokens, isCommon);
    const tb = without(b.tokens, isCommon);
    return lexicalMatch(ta, tb) ? similarity(ta, tb).jaccard : 0;
  }
  if (a.script === 'cjk' || b.script === 'cjk') return 0;
  const sa = without(a.skel, (k) => isCommon(`~${k}`));
  const sb = without(b.skel, (k) => isCommon(`~${k}`));
  const s = similarity(sa, sb);
  return s.inter >= 3 && s.overlap >= 0.4 ? s.overlap / 2 : 0;
}

// Kept for callers that only have titles.
export const isSameStory = (titleA, titleB) => matchScore(fingerprint(titleA), fingerprint(titleB)) > 0;

// --- tiers & groups --------------------------------------------------------
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

export function makeGroupResolver(groups) {
  const entries = Object.entries(groups).filter(([k]) => !k.startsWith('_'));
  return (host, root) => {
    for (const [name, domains] of entries) if (domains.some((d) => domainMatches(host, d))) return name;
    return root;
  };
}

// --- scoring ---------------------------------------------------------------
const better = (a, b) =>
  TIER_WEIGHT[a.tier] > TIER_WEIGHT[b.tier] || (TIER_WEIGHT[a.tier] === TIER_WEIGHT[b.tier] && a.publishedAt < b.publishedAt);

export function evaluate(articles, rules = { verifiedScore: 4, verifiedOrigins: 3 }) {
  const outlets = new Map();
  let signals = 0;
  for (const a of articles) {
    if (a.tier === 'social') {
      signals++;
      continue;
    }
    const key = a.group || a.rootDomain;
    const prev = outlets.get(key);
    if (!prev || better(a, prev)) outlets.set(key, a);
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
  const langs = [...new Set(articles.map((a) => a.lang).filter(Boolean))].sort();

  let status = 'unconfirmed';
  if (official || (n >= 2 && score >= rules.verifiedScore) || (n >= rules.verifiedOrigins && score >= rules.verifiedOrigins)) {
    status = 'verified';
  } else if (n >= 2) {
    status = 'developing';
  }

  // Reasons are codes + params so the client can render them in the reader's language.
  const reasons = [];
  if (official) reasons.push({ code: 'official', name: official.source || official.rootDomain });
  reasons.push({ code: 'outlets', n });
  if (wire) reasons.push({ code: 'wire', name: wire.source || wire.rootDomain });
  const domains = new Set(articles.filter((a) => a.tier !== 'social').map((a) => a.rootDomain)).size;
  if (domains > n) reasons.push({ code: 'syndicated', n: domains - n });
  if (langs.length > 1) reasons.push({ code: 'langs', langs });
  if (signals) reasons.push({ code: 'signals', n: signals });
  return { status, score, origins: n, outlets: domains, signals, langs, reasons };
}

export function reasonText(r) {
  switch (r.code) {
    case 'official': return `Official source: ${r.name}`;
    case 'outlets': return r.n === 1 ? 'Single outlet so far' : `${r.n} independent outlets`;
    case 'wire': return `Wire service: ${r.name}`;
    case 'syndicated': return `${r.n} syndicated/sister cop${r.n === 1 ? 'y' : 'ies'} merged`;
    case 'langs': return `Reported in ${r.langs.join(' + ')}`;
    case 'signals': return `${r.n} social signal${r.n === 1 ? '' : 's'} (not counted)`;
    default: return '';
  }
}

// Picks the headline to display: best-tier, earliest article.
export function leadArticle(articles) {
  return articles.reduce((best, a) => (!best || better(a, best) ? a : best), null);
}

buildPlaceIndex();
