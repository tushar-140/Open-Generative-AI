# NewsPulse

NewsPulse is a PWA that shows near-real-time news for any **geography** (country edition plus an optional city or region) and **domain** (markets, politics, tech, health, disasters, security, sports, or your own keywords). It checks each story against several independent sources before marking it verified, and it pushes alerts as stories reach that bar.

- Links are **shareable**: `/?feed=<id>` opens a feed and `/?feed=<id>&story=<id>` opens one story. Shared links show a proper preview (title and verification status).
- Anyone can **create a feed** in the UI. Feeds are deduplicated, so two people asking for "Mumbai · Security" get the same feed and the same link.
- **Live updates**: open tabs get new stories through Server-Sent Events. Installed or closed apps get **Web Push** notifications, including on iOS 16.4+ when the app is added to the Home Screen.
- **Broadcast channels** (optional): verified stories can also go to an ntfy.sh topic or a Telegram channel/group. People who never open the app can follow along there.

## Why these sources (and not scraping X)

| Option | Verdict |
|---|---|
| Scraping X/Twitter | ❌ Against X's Terms of Service. Accounts and IPs get blocked quickly and scrapers break often. It is also the noisiest source for misinformation. |
| X API v2 (official) | ⚠️ Supported as an **optional** adapter (`X_BEARER_TOKEN`). Search needs a paid tier. Posts only count as *signals* and never verify a story on their own, unless they come from handles you whitelist as official. |
| **Google News RSS** (search per edition) | ✅ Primary low-latency source. It works per country and language edition, supports `when:1h`, OR-queries and place names, and names the original publisher. Polled every 60 s. |
| **GDELT DOC 2.0 API** | ✅ Free, global, updates every 15 min. It machine-translates about 65 languages, filters by source country, and links straight to articles. Polled every 5 min. |
| Official / primary RSS & Atom | ✅ Per-feed `rss` list, e.g. central bank, government press office, USGS earthquakes. You can mark these `official`, which verifies a story on its own. |

## How verification works

1. **Clustering**: headlines are normalised (lowercased, stopwords removed, light stemming; CJK uses character bigrams). Two headlines go in the same story when they share enough words (overlap ≥ 0.6 with ≥ 3 shared terms, or Jaccard ≥ 0.45).
2. **Independence**:
   - Each publisher's root domain gets one vote.
   - Outlets that ran an *identical* headline (syndicated wire copy) count as a single origin.
3. **Source tiers** (`config/sources.json`): `official` 3, `wire` 3, `major` 2, `standard` 1, `low` 0.5, `social` 0, plus `blocked`.
4. **Status**:
   - **Verified**: an official source reported it, *or* there are ≥ 2 origins with a weighted score ≥ 4 (e.g. wire + any outlet, or two majors), *or* ≥ 3 origins with a score ≥ 3.
   - **Developing**: ≥ 2 independent origins, but below the verified bar.
   - **Unconfirmed**: a single origin, or only social signals.
5. Every card lists *why* it got its status and shows all sources with their tier, so readers can check for themselves.

Thresholds are set by `VERIFIED_SCORE` and `VERIFIED_ORIGINS`. This is corroboration, not fact-checking. It filters out most single-source rumours, but several outlets can still repeat the same false report.

## Automated update & notification workflow

```
every 60s ─ Google News RSS ─┐
every 5m  ─ GDELT DOC API ───┤
every 2m  ─ official RSS ────┼─► enrich (domain, tier) ─► cluster ─► score ─► status change?
every 5m  ─ X API (optional) ┘                                                │
                                   SSE → open tabs ◄──────────────────────────┤
              Web Push / ntfy / Telegram (first time story hits developing/verified)
```

Rules that keep notifications useful:
- A brand-new feed backfills quietly; it does not push its first hour of backlog.
- A story triggers each alert level only once.
- Stories older than `NOTIFY_MAX_AGE_MIN` (180 min) are not pushed.
- Bursts are capped: more than `NOTIFY_BURST_LIMIT` alerts per feed in 10 min collapse into one digest.
- Subscriptions the push service reports as expired (404/410) are removed automatically.
- Each subscriber picks *verified only* or *developing + verified* for each feed.

## Run locally

```bash
cd news-pulse
npm install
npm start            # http://localhost:8080
npm test
```

VAPID keys for Web Push are generated on first start and saved in `data/state.json`. To pin your own keys, run `npm run vapid` and set them in the environment (see `.env.example`). Push only works over HTTPS, or on `localhost`.

## Deploy (always-on server needed)

The poller has to run all the time for alerts to be immediate. Use a host that does **not** sleep idle apps, and give it a persistent volume for `/data`.

- **Fly.io** (config included, Mumbai region):
  ```bash
  fly launch --copy-config --no-deploy
  fly volumes create newspulse_data --size 1
  fly secrets set PUBLIC_URL=https://<app>.fly.dev VAPID_SUBJECT=mailto:you@example.com
  fly deploy
  ```
- **Docker anywhere** (VPS, Railway, Render paid instance, etc.):
  ```bash
  docker build -t newspulse .
  docker run -d -p 8080:8080 -v newspulse:/data -e PUBLIC_URL=https://news.example.com newspulse
  ```
  Put it behind HTTPS (Caddy, Cloudflare, or the platform's TLS).

CI (`.github/workflows/news-pulse.yml`) runs the tests, a boot smoke test and a Docker build on every change.

## Configuration

- `config/feeds.json`: featured feeds. Fields: `country` (code from `config/countries.json`), optional `place`, `domain` (from `config/domains.json`), extra `keywords`, `rss: [{url, tier, name}]`, and optionally `xOfficialHandles`, `ntfyTopic`, `telegramChatId`.
- `config/domains.json`: domain presets (keyword lists). Add your own.
- `config/sources.json`: trust tiers by domain. Add regional outlets to `major`, and add known junk to `low` or `blocked`.
- `config/countries.json`: Google News edition and GDELT country name for each country.
- For non-English editions (DE, FR, JP…), add keywords in the local language. GDELT already matches English keywords against translated text.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/feeds` | List feeds |
| POST | `/api/feeds` | `{country, domain, place?, keywords?}` → create or reuse a feed |
| GET | `/api/feeds/:id/stories?status=verified,developing&limit=` | Stories (newest activity first) and source health |
| GET | `/api/stream?feed=:id` | SSE: `stories` events with changed stories, and a `ping` with source health |
| POST | `/api/push/subscribe` | `{subscription, feeds[], level}`. An empty `feeds` unsubscribes |
| POST | `/api/push/status` | `{subscription}` → current feeds and level |
| GET | `/api/health` | Liveness |

## Limits

- State is stored in one JSON file on a single instance. To run several replicas, move it to SQLite, Postgres or Redis.
- Google News RSS is an unofficial endpoint and is intended for personal/non-commercial use. For commercial use, swap in a licensed news API by adding an adapter in `src/sources/`.
- Headline clustering is lexical. Very differently worded reports of the same event can stay in separate stories.
