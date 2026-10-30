import { config, countryByCode } from './config.js';

export const DEVANAGARI = /[ऀ-ॿ]/;
const LANG_NAMES = { en: 'English', hi: 'हिंदी' };

const norm = (s) => s.trim().toLowerCase();

// Finds a gazetteer entry by any English or Hindi alias.
export function resolvePlace(country, input) {
  const q = norm(input || '');
  if (!q) return null;
  return (config.places[country] || []).find((p) => [...p.en, ...p.hi].some((a) => norm(a) === q)) || null;
}

// Place spellings to search for in a given language edition.
export function placeAliases(feed, lang) {
  if (!feed.place) return [];
  const p = resolvePlace(feed.country, feed.place);
  if (!p) return [feed.place];
  return p[lang]?.length ? p[lang] : p.en;
}

export function allPlaceAliases(feed) {
  if (!feed.place) return [];
  const p = resolvePlace(feed.country, feed.place);
  return p ? [...p.en, ...p.hi] : [feed.place];
}

// Feed languages, limited to editions the country actually has.
export function feedLangs(feed) {
  const editions = countryByCode.get(feed.country)?.editions || [];
  const wanted = feed.langs?.length ? feed.langs : editions.map((e) => e.lang);
  const picked = editions.filter((e) => wanted.includes(e.lang));
  return picked.length ? picked : editions.slice(0, 1);
}

// Domain preset + country-specific extras + the user's own keywords, for one language.
export function feedKeywords(feed, lang = 'en') {
  const domain = config.domains[feed.domain];
  const extras = countryByCode.get(feed.country)?.domainExtras?.[feed.domain]?.[lang] || [];
  const preset = domain?.keywords?.[lang] || [];
  const custom = feed.keywords || [];
  // Keywords typed in the edition's script; fall back to all of them if none match.
  const scripted = custom.filter((k) => (lang === 'hi') === DEVANAGARI.test(k));
  const own = scripted.length || feed.domain !== 'custom' ? scripted : custom;
  // Most specific first, so a word budget keeps the terms that matter.
  return [...new Set([...own, ...extras, ...preset].map((k) => k.trim()).filter(Boolean))];
}

const words = (term) => term.trim().split(/\s+/).length;

// Search engines ignore words past a limit (Google: ~32), silently dropping later terms such as the place.
// Keep terms, in priority order, while "a OR b OR c" stays within maxWords.
export function withinBudget(terms, maxWords) {
  const out = [];
  let used = 0;
  for (const t of terms) {
    const cost = words(t) + (out.length ? 1 : 0);
    if (used + cost > maxWords) break;
    out.push(t);
    used += cost;
  }
  return out;
}

export const groupWords = (terms) => (terms.length ? terms.reduce((n, t) => n + words(t), 0) + terms.length - 1 : 0);

const quote = (k) => (/[\s.]/.test(k) ? `"${k.replace(/"/g, '')}"` : k);

export function orGroup(keywords) {
  if (!keywords.length) return '';
  if (keywords.length === 1) return quote(keywords[0]);
  return `(${keywords.map(quote).join(' OR ')})`;
}

export function feedLabel(feed, ui = 'en') {
  const c = countryByCode.get(feed.country);
  const p = resolvePlace(feed.country, feed.place);
  const place = p ? (ui === 'hi' ? p.hi[0] : p.en[0]) : feed.place;
  const country = ui === 'hi' ? c?.nameHi : c?.name;
  const d = config.domains[feed.domain];
  const topic = feed.domain === 'custom' && feed.keywords?.length ? feed.keywords.slice(0, 3).join(', ') : ui === 'hi' ? d?.labelHi : d?.label;
  const where = place ? `${place}${feed.country !== 'WORLD' ? `, ${country}` : ''}` : country;
  return `${where} · ${topic}`;
}

export const langName = (l) => LANG_NAMES[l] || l;
