import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  root,
  port: int(env.PORT, 8080),
  dataDir: env.DATA_DIR || path.join(root, 'data'),
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },
  // Seconds between polls per source adapter.
  intervals: {
    gnews: int(env.GNEWS_INTERVAL_SEC, 60),
    gdelt: int(env.GDELT_INTERVAL_SEC, 300),
    rss: int(env.RSS_INTERVAL_SEC, 120),
    x: int(env.X_INTERVAL_SEC, 300),
  },
  ingestMaxAgeHours: int(env.INGEST_MAX_AGE_HOURS, 12),
  retentionHours: int(env.RETENTION_HOURS, 48),
  notifyMaxAgeMin: int(env.NOTIFY_MAX_AGE_MIN, 180),
  notifyBurstLimit: int(env.NOTIFY_BURST_LIMIT, 6),
  maxCustomFeeds: int(env.MAX_CUSTOM_FEEDS, 50),
  customFeedIdleDays: int(env.CUSTOM_FEED_IDLE_DAYS, 7),
  rules: {
    verifiedScore: Number(env.VERIFIED_SCORE || 4),
    verifiedOrigins: int(env.VERIFIED_ORIGINS, 3),
  },
  bases: {
    gnews: env.GNEWS_BASE_URL || 'https://news.google.com',
    gdelt: env.GDELT_BASE_URL || 'https://api.gdeltproject.org',
    x: env.X_BASE_URL || 'https://api.x.com',
  },
  xBearerToken: env.X_BEARER_TOKEN || '',
  channels: {
    level: env.CHANNEL_NOTIFY_LEVEL || 'verified',
    ntfyUrl: (env.NTFY_URL || 'https://ntfy.sh').replace(/\/$/, ''),
    ntfyTopicPrefix: env.NTFY_TOPIC_PREFIX || '',
    telegramToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
  },
  feeds: readJson('config/feeds.json'),
  sources: readJson('config/sources.json'),
  domains: readJson('config/domains.json'),
  countries: readJson('config/countries.json'),
};

export const countryByCode = new Map(config.countries.map((c) => [c.code, c]));
