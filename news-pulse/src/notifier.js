import webpush from 'web-push';
import { feedLabel } from './query.js';
import { reasonText } from './verify.js';

const BURST_WINDOW_MS = 10 * 60 * 1000;
const LEVEL_RANK = { developing: 1, verified: 2 };
const LABEL = {
  en: { verified: '✅ Verified', developing: '🟡 Developing', more: (n) => `${n} more stor${n === 1 ? 'y' : 'ies'} in the last few minutes` },
  hi: { verified: '✅ पुष्ट', developing: '🟡 विकसित हो रही', more: (n) => `पिछले कुछ मिनटों में ${n} और खबरें` },
};

// Fans a story out to Web Push subscribers and optional ntfy / Telegram channels.
export class Notifier {
  constructor({ config, subscriptions, onChange }) {
    this.config = config;
    this.subscriptions = subscriptions; // Map endpoint -> { subscription, feeds: [], level, ui }
    this.onChange = onChange;
    this.bursts = new Map(); // feedId -> { times: [], suppressed }
  }

  init(vapid) {
    webpush.setVapidDetails(this.config.vapid.subject, vapid.publicKey, vapid.privateKey);
  }

  // Returns false when the per-feed burst limit is hit; a digest is sent instead.
  #allow(feedId, now) {
    const b = this.bursts.get(feedId) || { times: [], suppressed: 0 };
    b.times = b.times.filter((t) => now - t < BURST_WINDOW_MS);
    this.bursts.set(feedId, b);
    if (b.times.length < this.config.notifyBurstLimit) {
      b.times.push(now);
      b.suppressed = 0;
      return true;
    }
    b.suppressed++;
    return false;
  }

  payload(feed, story, level, ui, digest) {
    const L = LABEL[ui] || LABEL.en;
    const feedUrl = `/?feed=${encodeURIComponent(feed.id)}`;
    if (digest) return { title: feedLabel(feed, ui), body: L.more(digest), url: feedUrl, tag: `digest-${feed.id}` };
    const headline = story.titles?.[ui]?.title || story.title;
    return {
      title: `${L[level]} · ${feedLabel(feed, ui)}`,
      body: headline,
      url: `${feedUrl}&story=${story.id}`,
      tag: story.id,
      meta: ui === 'en' ? story.reasons.map(reasonText).filter(Boolean).join(' · ') : undefined,
    };
  }

  async notify(feed, story, level, now = Date.now()) {
    const digest = this.#allow(feed.id, now) ? 0 : this.bursts.get(feed.id).suppressed;
    await Promise.allSettled([
      this.#webPush(feed, story, level, digest),
      this.#channels(feed, story, level, this.payload(feed, story, level, 'en', digest)),
    ]);
  }

  async #webPush(feed, story, level, digest) {
    const bodies = {};
    const jobs = [];
    for (const [endpoint, sub] of this.subscriptions) {
      if (!sub.feeds.includes(feed.id)) continue;
      if (LEVEL_RANK[level] < LEVEL_RANK[sub.level || 'verified']) continue;
      const ui = sub.ui === 'hi' ? 'hi' : 'en';
      bodies[ui] ||= JSON.stringify(this.payload(feed, story, level, ui, digest));
      jobs.push(
        webpush.sendNotification(sub.subscription, bodies[ui], { TTL: 3600, urgency: 'high' }).catch((err) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            this.subscriptions.delete(endpoint);
            this.onChange?.();
          } else {
            console.warn(`[push] ${err.statusCode || ''} ${err.message}`);
          }
        }),
      );
    }
    await Promise.all(jobs);
  }

  async #channels(feed, story, level, payload) {
    const c = this.config.channels;
    if (LEVEL_RANK[level] < LEVEL_RANK[c.level]) return;
    const link = this.config.publicUrl ? `${this.config.publicUrl}${payload.url}` : story.url;
    const topic = feed.ntfyTopic || (c.ntfyTopicPrefix && `${c.ntfyTopicPrefix}-${feed.id}`);
    const jobs = [];
    if (topic) {
      jobs.push(
        fetch(`${c.ntfyUrl}/${encodeURIComponent(topic)}`, {
          method: 'POST',
          body: payload.body,
          headers: {
            Title: encodeHeader(payload.title),
            Click: link,
            Tags: level === 'verified' ? 'white_check_mark' : 'yellow_circle',
            Priority: level === 'verified' ? '4' : '3',
          },
          signal: AbortSignal.timeout(10000),
        }),
      );
    }
    const chatId = feed.telegramChatId || c.telegramChatId;
    if (c.telegramToken && chatId) {
      jobs.push(
        fetch(`https://api.telegram.org/bot${c.telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: [payload.title, payload.body, payload.meta, link].filter(Boolean).join('\n'),
          }),
          signal: AbortSignal.timeout(10000),
        }),
      );
    }
    const results = await Promise.allSettled(jobs);
    for (const r of results) if (r.status === 'rejected') console.warn(`[channels] ${r.reason?.message}`);
  }
}

// HTTP headers must be latin1; ntfy accepts RFC 2047 encoded words.
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
