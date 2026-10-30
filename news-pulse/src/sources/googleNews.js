import { config, countryByCode } from '../config.js';
import { feedKeywords, feedLangs, orGroup, placeAliases } from '../query.js';
import { httpGet, hash } from '../util.js';
import { parseFeed } from './xml.js';

export const id = 'gnews';
export const enabled = () => true;

// One search URL per language edition of the feed's country.
export function buildUrls(feed) {
  const country = countryByCode.get(feed.country) || countryByCode.get('WORLD');
  return feedLangs(feed).map((ed) => {
    const params = `hl=${encodeURIComponent(ed.hl)}&gl=${ed.gl}&ceid=${encodeURIComponent(ed.ceid)}`;
    const parts = [orGroup(feedKeywords(feed, ed.lang)), orGroup(placeAliases(feed, ed.lang))];
    // Without a place, an English edition also returns foreign stories ("stock market" → Wall Street).
    // Anchor the query to the country; extras like Sensex/RBI count as anchors too.
    const anchors = country.anchors?.[ed.lang];
    if (!feed.place && anchors && parts[0]) {
      const extras = country.domainExtras?.[feed.domain]?.[ed.lang] || [];
      parts.push(orGroup([...anchors, ...extras]));
    }
    const q = parts.filter(Boolean).join(' ');
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
