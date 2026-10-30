import { httpGet, hash, canonicalUrl, hostOf } from '../util.js';
import { parseFeed } from './xml.js';

export const id = 'rss';
export const enabled = (feed) => Array.isArray(feed.rss) && feed.rss.length > 0;

export function parse(xml, src) {
  return parseFeed(xml)
    .filter((it) => it.title && it.link)
    .map((it) => ({
      id: hash(canonicalUrl(it.link)),
      title: it.title,
      url: it.link,
      source: src.name || hostOf(it.link),
      sourceUrl: it.link,
      publishedAt: Date.parse(it.published) || Date.now(),
      tier: src.tier,
      via: id,
    }));
}

export async function fetchItems(feed) {
  const results = await Promise.allSettled(feed.rss.map(async (src) => parse(await httpGet(src.url), src)));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length === results.length && failed.length) throw failed[0].reason;
  return items;
}
