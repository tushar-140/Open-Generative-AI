import crypto from 'node:crypto';

const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'co.in', 'gov.in', 'nic.in', 'org.in', 'net.in', 'ac.in',
  'com.au', 'gov.au', 'net.au', 'co.nz', 'govt.nz', 'com.sg', 'gov.sg', 'com.my', 'com.ph', 'com.pk',
  'com.bd', 'co.za', 'com.ng', 'co.ke', 'com.br', 'com.mx', 'co.jp', 'co.kr', 'go.kr', 'go.jp', 'gc.ca',
]);

export const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\d?\./, '');
  } catch {
    return '';
  }
}

export function rootDomain(host) {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  return MULTI_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|ocid)/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

export async function httpGet(url, { headers = {}, timeoutMs = 15000 } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'NewsPulse/1.0 (+https://github.com/)', accept: '*/*', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).host}`);
  return res.text();
}

export const slug = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40);

export const stripHtml = (s = '') =>
  String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
