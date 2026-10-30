import { config, countryByCode } from '../config.js';
import { feedKeywords, feedLangs, orGroup, placeAliases, withinBudget, groupWords } from '../query.js';

const MAX_QUERY_WORDS = 28;
import { httpGet, hash } from '../util.js';
import { parseFeed } from './xml.js';

export const id = 'gnews';
export const enabled = () => true;

// One search URL per language edition of the feed's country.
export function buildUrls(feed) {
  const country = countryByCode.get(feed.country) || countryByCode.get('WORLD');
  return feedLangs(feed).map((ed) => {
    const params = `hl=${encodeURIComponent(ed.hl)}&gl=${ed.gl}&ceid=${encodeURIComponent(ed.ceid)}`;
    // The place goes first: Google ignores words beyond its limit, and the place is the filter that matters most.
    const place = placeAliases(feed, ed.lang);
    let anchors = [];
    let keywords = feedKeywords(feed, ed.lang);
    // Without a place, an English edition also returns foreign stories ("stock market" → Wall Street).
    // Anchor the query to the country; extras like Sensex/RBI count as anchors too.
    if (!feed.place && country.anchors?.[ed.lang] && keywords.length) {
      anchors = [...new Set([...country.anchors[ed.lang], ...(country.domainExtras?.[feed.domain]?.[ed.lang] || [])])];
      keywords = keywords.filter((k) => !anchors.includes(k));
    }
    keywords = withinBudget(keywords, MAX_QUERY_WORDS - groupWords(place) - groupWords(anchors));
    const q = [orGroup(place), orGroup(keywords), orGroup(anchors)].filter(Boolean).join(' ');
    if (!q) return { lang: ed.lang, url: `${config.bases.gnews}/rss?${params}` };
    // Regional feeds are lower volume: look back further so they are never empty.
    const when = feed.place ? '12h' : '2h';
    return { lang: ed.lang, url: `${config.bases.gnews}/rss/search?q=${encodeURIComponent(`${q} when:${when}`)}&${params}` };
  });
}

// Google News appends " - Publisher" (sometimes " - Section News - Publisher") to titles.
export function cleanTitle(title, sourceName) {
  let t = title;
  if (sourceName && t.endsWith(` - ${sourceName}`)) t = t.slice(0, -(sourceName.length + 3)).trim();
  return t.replace(/ - [^-]{1,40}(News|समाचार|न्यूज़|न्यूज)$/u, '').trim();
}

export function parse(xml, lang) {
  return parseFeed(xml)
    .filter((it) => it.title && it.link)
    .map((it) => ({
      id: hash(it.guid || it.link),
      title: cleanTitle(it.title, it.sourceName),
      url: it.link,
      source: it.sourceName,
      sourceUrl: it.sourceUrl,
      publishedAt: Date.parse(it.published) || Date.now(),
      lang,
      via: id,
    }));
}

export async function fetchItems(feed) {
  const results = await Promise.allSettled(buildUrls(feed).map(async ({ url, lang }) => parse(await httpGet(url), lang)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length === results.length) throw failed[0].reason;
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
