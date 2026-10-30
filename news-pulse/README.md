# NewsPulse

NewsPulse is a PWA that shows near-real-time news for any **place** and **topic**, in **English, Hindi or both**. It checks each story against several independent outlets before marking it verified, and it pushes alerts as stories reach that bar.

- **Pick a place, a topic and a language.**
  - The place can be a country, a state ("Rajasthan" or "राजस्थान"), a district or a city.
  - Topics: politics, markets, tech, health, disasters, security, sports, or your own keywords.
  - A feed is created on the fly and shared by everyone who asks for the same thing.
- **Bilingual**:
  - Indian feeds search the English and Hindi Google News editions with Hindi topic keywords and Hindi place names.
  - The interface itself switches between English and हिंदी, and so do relative times and notifications.
  - Hindi and English reports of the same event are merged into one story.
- **Shareable links**: `/?feed=<id>` opens a feed and `/?feed=<id>&story=<id>` opens one story. Shared links show a preview with the title and verification status.
- **Live updates**:
  - Open tabs receive new stories over Server-Sent Events. If you have scrolled down, they wait behind a "↑ N new stories" pill.
  - Installed or closed apps get **Web Push** notifications in the subscriber's language, including on iOS 16.4+ once the app is added to the Home Screen.
  - Verified stories can optionally go to ntfy.sh or Telegram as well.

## Sources (and why not scraping X)

| Option | Verdict |
|---|---|
| Scraping X/Twitter | ❌ Against X's Terms of Service. Accounts and IPs get blocked quickly and scrapers break often. It is also the noisiest source for misinformation. |
| X API v2 (official) | ⚠️ **Optional** adapter (`X_BEARER_TOKEN`, paid tier). Posts only count as *signals* and never verify a story on their own, unless they come from handles you whitelist as official. |
| **Google News RSS** per language edition | ✅ Primary low-latency source, polled every 60 s. Indian feeds query `IN:en` and `IN:hi`, and results name the original publisher. |
| **GDELT DOC 2.0 API** | ✅ Free and global, updates every 15 min, polled every 5 min. It machine-translates about 65 languages, so English terms also find Hindi articles. Requests are queued at least 6 s apart to stay under GDELT's rate limit. |
| Official / primary RSS & Atom | ✅ Per-feed `rss` list (central bank, government press office, USGS…). You can mark these `official`, which verifies a story on its own. |

### What keeps regional feeds on-region (no metro/national bias)
- **Place comes first in the query, within a word budget.**
  - Google ignores words past roughly 32, which can silently drop the place from a long query. In a live test this put "Israel election" into a Rajasthan feed.
  - Queries now start with the place, and keywords are trimmed to stay under the limit.
- **Region guard**: headlines that name only unrelated places are dropped.
  - In a Rajasthan feed this drops stories about Israel, Nepal or Bihar. Jaipur and India are kept, because they are inside or contain Rajasthan.
  - In an India feed it drops "Pakistan stock market" and "US stocks crash", but keeps "India-US trade deal".
- **Regional window**: place feeds look back 12 h instead of 2 h, so lower-volume regions are never empty. Only stories that are new since the last poll trigger alerts.
- **Regional outlets count as major sources**: Dainik Bhaskar, Rajasthan Patrika, Amar Ujala, Jagran, Live Hindustan, ETV Bharat, First India and others are in the `major` tier. A story confirmed by two regional papers is verified just like one confirmed by two national papers.
- **State terms**: politics feeds include Vidhan Sabha, MLA, panchayat, bypoll, BJP, Congress (भाजपा, कांग्रेस…), not just parliament.
- **Place list** (`config/places.json`): all states and union territories plus about 50 cities, in English and Hindi, with spelling variants (Bengaluru/Bangalore, Gurugram/Gurgaon, Prayagraj/Allahabad). Any other place you type is searched as written.

## How verification works

1. **Clustering**: headlines describing the same event are grouped into one story using three checks:
   - **Word overlap** within the same language. Hindi words keep their vowel signs, and Hindi stopwords and ज़/ज nukta variants are handled.
   - **Phonetic skeleton** across scripts: भजनलाल ≈ Bhajanlal, कांग्रेस ≈ Congress, भाजपा ≈ BJP.
   - **Multilingual sentence embeddings** (optional, on by default): `paraphrase-multilingual-MiniLM-L12-v2` running locally via transformers.js. It catches rewordings and translations.
2. **Merge vetoes**:
   - Headlines naming unrelated places never merge (a Bikaner earthquake is not a Nepal earthquake).
   - Embedding matches must share a specific term, and are vetoed when the headlines quote different figures.
   - Terms that appear in many stories of a feed, such as the feed's own state name, don't count as evidence.
3. **Independence**:
   - Each **media group** counts once (`config/groups.json`): Dainik Bhaskar + Bhaskar English, Times of India + Economic Times + Navbharat Times, Hindustan Times + Live Hindustan + Mint, and so on.
   - Outlets running identical syndicated copy count once.
4. **Source tiers** (`config/sources.json`): `official` 3, `wire` 3, `major` 2, `standard` 1, `low` 0.5, `social` 0, plus `blocked`.
5. **Status**:
   - **Verified**: an official source reported it, *or* there are ≥ 2 origins with a weighted score ≥ 4, *or* ≥ 3 origins with a score ≥ 3.
   - **Developing**: ≥ 2 origins, but below the verified bar.
   - **Unconfirmed**: a single origin.
6. Every card shows *why* it got its status and lists all sources with their tier and language.

This is corroboration, not fact-checking. Clustering is tuned to **avoid wrong merges**, because a wrong merge could produce a false "verified". The trade-off is that two reports of one event occasionally stay as separate cards.

### Measured on real news (CI `live-check` job)
`npm run live-check`, also run in CI on every push, fetches live feeds and prints what a reader would see:
- per-source item counts;
- the languages mix;
- region-guard drops;
- the top stories with their status;
- the bilingual merges it found.

It also scores the matcher on labelled headline pairs in `scripts/calibration-pairs.json`. Most pairs are real headlines from those live runs; a few were written by hand to exercise Hindi↔English matching.

Results from the 30 Oct 2026 runs:
- **Freshness**: every Indian feed had stories 2–18 min old. Rajasthan politics alone yielded about 105 items, ~80% in Hindi.
- **Bilingual merges** were found in every Indian feed. For example, "SIR is not new" was confirmed by ThePrint, Hans India, Bhaskar Hindi and Prabhasakshi, and the Cyclone Arnab story in the Bihar feed combined 22 outlets across Hindi and English.
- **Calibration**: 24/24 labelled pairs decided correctly. The embedding thresholds (`SEMANTIC_SAME_LANG`, `SEMANTIC_CROSS_LANG` = 0.62) come from this: same-event pairs scored 0.62–0.88, and different-event pairs at most 0.57. The exceptions were two pairs (0.61, 0.87) about different places, which the place veto handles.
- **GDELT** answered 429 or returned 0 articles from GitHub's shared runners, so its contribution is **unverified**. Every result above came from Google News.

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
npm run live-check   # needs internet: real sources end to end
```

Semantic matching downloads its model (~120 MB) into `DATA_DIR/models` on first start. Without network access to huggingface.co, or with `SEMANTIC_MATCH=0`, it falls back to word and phonetic matching.

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

- `config/feeds.json`: featured feeds. Fields:
  - `country`, optional `place`, `domain`, `langs` (e.g. `["en","hi"]`) and extra `keywords`;
  - `rss: [{url, tier, name}]`;
  - optional `xOfficialHandles`, `ntfyTopic` and `telegramChatId`.
- `config/domains.json`: topic presets with English and Hindi keywords, labels and icons.
- `config/countries.json`: language editions per country, Hindi names, country anchor words, and country-specific topic terms (`domainExtras`).
- `config/places.json`: the place list, with English and Hindi aliases and the parent state. Add districts here to improve the region guard and Hindi search.
- `config/sources.json`: trust tiers. Add your region's outlets to `major`, and add known junk to `low` or `blocked`.
- `config/groups.json`: media groups whose outlets count as one source.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/feeds` | List feeds |
| POST | `/api/feeds` | `{country, domain, place?, langs?, keywords?}` → create or reuse a feed |
| GET | `/api/feeds/:id/stories?status=verified,developing&limit=` | Stories (newest activity first) and source health |
| GET | `/api/stream?feed=:id` | SSE: `stories` events with changed stories, and a `ping` with source health |
| POST | `/api/push/subscribe` | `{subscription, feeds[], level, ui}`. An empty `feeds` unsubscribes |
| POST | `/api/push/status` | `{subscription}` → current feeds and level |
| GET | `/api/health` | Liveness |

## Limits

- State is stored in one JSON file on a single instance. To run several replicas, move it to SQLite, Postgres or Redis.
- Google News RSS is an unofficial endpoint and is intended for personal/non-commercial use. For commercial use, swap in a licensed news API by adding an adapter in `src/sources/`.
- Clustering prefers missing a merge to making a wrong one. Very differently worded reports can stay as separate cards; each card is still verified on its own sources.
- The region guard relies on place names in headlines. Districts missing from `config/places.json` can't be used to exclude or confirm stories.
- GDELT is best-effort: from CI it answered 429 or returned nothing, so it has not been verified. Google News carries the load.
- Google News RSS is the single verified source. If it rate-limits or changes format, feeds go quiet until it recovers. The per-source ✓/⚠ status under each feed title shows this. Adding official RSS feeds per region spreads the risk.
