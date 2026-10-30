import { config } from './config.js';

// Resolves a feed's effective keyword list: domain preset + custom keywords.
export function feedKeywords(feed) {
  const preset = config.domains[feed.domain]?.keywords || [];
  return [...new Set([...preset, ...(feed.keywords || [])].map((k) => k.trim()).filter(Boolean))];
}

const quote = (k) => (/\s/.test(k) ? `"${k.replace(/"/g, '')}"` : k);

export function orGroup(keywords) {
  if (!keywords.length) return '';
  if (keywords.length === 1) return quote(keywords[0]);
  return `(${keywords.map(quote).join(' OR ')})`;
}
