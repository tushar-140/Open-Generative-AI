import { config, countryByCode } from '../config.js';
import { feedKeywords, orGroup } from '../query.js';
import { httpGet, hash } from '../util.js';
import { parseFeed } from './xml.js';

export const id = 'gnews';
export const enabled = () => true;

export function buildUrl(feed) {
  const c = countryByCode.get(feed.country) || countryByCode.get('WORLD');
  const params = `hl=${encodeURIComponent(c.hl)}&gl=${c.gl}&ceid=${encodeURIComponent(c.ceid)}`;
  const parts = [orGroup(feedKeywords(feed))];
  if (feed.place) parts.push(`"${feed.place.replace(/"/g, '')}"`);
  const q = parts.filter(Boolean).join(' ');
  if (!q) return `${config.bases.gnews}/rss?${params}`;
  return `${config.bases.gnews}/rss/search?q=${encodeURIComponent(`${q} when:1h`)}&${params}`;
}

// Google News appends " - Publisher" to titles; strip it when it matches the <source> name.
export function cleanTitle(title, sourceName) {
  if (sourceName && title.endsWith(` - ${sourceName}`)) return title.slice(0, -(sourceName.length + 3)).trim();
  return title;
}

export function parse(xml) {
  return parseFeed(xml)
    .filter((it) => it.title && it.link)
    .map((it) => ({
      id: hash(it.guid || it.link),
      title: cleanTitle(it.title, it.sourceName),
      url: it.link,
      source: it.sourceName,
      sourceUrl: it.sourceUrl,
      publishedAt: Date.parse(it.published) || Date.now(),
      via: id,
    }));
}

export async function fetchItems(feed) {
  return parse(await httpGet(buildUrl(feed)));
}
