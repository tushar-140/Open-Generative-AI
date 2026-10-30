import { config, countryByCode } from '../config.js';
import { feedKeywords, orGroup } from '../query.js';
import { httpGet, hash, canonicalUrl } from '../util.js';

export const id = 'gdelt';
export const enabled = () => true;

export function buildUrl(feed) {
  const c = countryByCode.get(feed.country);
  // GDELT rejects terms shorter than 3 characters.
  const parts = [orGroup(feedKeywords(feed).filter((k) => k.length >= 3))];
  if (feed.place) parts.push(`"${feed.place.replace(/"/g, '')}"`);
  if (c?.gdelt) parts.push(`sourcecountry:${c.gdelt}`);
  // Without keywords or a place the query would match a whole country's output: skip.
  if (!parts[0] && !feed.place) return null;
  const query = parts.filter(Boolean).join(' ');
  const qs = new URLSearchParams({
    query, mode: 'artlist', format: 'json', maxrecords: '75', timespan: '1h', sort: 'datedesc',
  });
  return `${config.bases.gdelt}/api/v2/doc/doc?${qs}`;
}

// seendate looks like 20261030T154500Z
export function parseSeenDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now();
}

export function parse(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    // GDELT answers query errors with plain text.
    throw new Error(`GDELT: ${body.slice(0, 120)}`);
  }
  return (data.articles || [])
    .filter((a) => a.title && a.url)
    .map((a) => ({
      id: hash(canonicalUrl(a.url)),
      title: a.title.trim(),
      url: a.url,
      source: a.domain || '',
      sourceUrl: a.url,
      publishedAt: parseSeenDate(a.seendate),
      image: a.socialimage || undefined,
      via: id,
    }));
}

export async function fetchItems(feed) {
  const url = buildUrl(feed);
  if (!url) return [];
  return parse(await httpGet(url, { timeoutMs: 25000 }));
}
