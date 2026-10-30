// Optional X (Twitter) adapter using the official v2 recent-search API (needs a paid API tier).
// Posts are treated as early *signals*: they never count towards verification unless the author
// is listed in the feed's `xOfficialHandles`, in which case the post counts as an official source.
import { config } from '../config.js';
import { feedKeywords, orGroup } from '../query.js';

export const id = 'x';
export const enabled = () => Boolean(config.xBearerToken);

export function buildUrl(feed) {
  const kw = orGroup(feedKeywords(feed));
  const place = feed.place ? `"${feed.place}"` : '';
  const query = [kw, place, '-is:retweet -is:reply'].filter(Boolean).join(' ').slice(0, 512);
  const qs = new URLSearchParams({
    query,
    max_results: '50',
    'tweet.fields': 'created_at,author_id',
    expansions: 'author_id',
    'user.fields': 'username,name',
  });
  return `${config.bases.x}/2/tweets/search/recent?${qs}`;
}

export function parse(data, feed) {
  const users = new Map((data.includes?.users || []).map((u) => [u.id, u]));
  const official = new Set((feed.xOfficialHandles || []).map((h) => h.toLowerCase().replace(/^@/, '')));
  return (data.data || []).map((t) => {
    const u = users.get(t.author_id) || { username: 'unknown', name: 'unknown' };
    const handle = u.username.toLowerCase();
    return {
      id: `x${t.id}`,
      title: t.text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 240),
      url: `https://x.com/${u.username}/status/${t.id}`,
      source: `@${u.username}`,
      sourceUrl: `https://x.com/${u.username}`,
      host: `x.com/${handle}`,
      publishedAt: Date.parse(t.created_at) || Date.now(),
      tier: official.has(handle) ? 'official' : 'social',
      via: id,
    };
  });
}

export async function fetchItems(feed) {
  const res = await fetch(buildUrl(feed), {
    headers: { authorization: `Bearer ${config.xBearerToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`X API HTTP ${res.status}`);
  return parse(await res.json(), feed);
}
