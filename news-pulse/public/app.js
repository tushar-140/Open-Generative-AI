const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// --- i18n ------------------------------------------------------------------
const STR = {
  en: {
    connecting: 'connecting', live: 'live', reconnecting: 'reconnecting', offline: 'offline',
    install: 'Install', share: 'Share', alerts: '🔔 Alerts', change: 'Change',
    where: 'Where?', placeHint: 'State, district or city — optional.', placePh: 'e.g. Rajasthan, Jaipur',
    topic: 'Topic', newsLang: 'News language', showNews: 'Show news', both: 'Both',
    keywordsPh: 'Your keywords, comma separated', needKeywords: 'Type a few keywords or a place.',
    tabVerified: '✅ Verified', tabDeveloping: '🟡 + Developing', tabAll: 'All',
    footer: '“Verified” means independent outlets corroborate the story (sister outlets and copied wire text count once). It reduces, but does not eliminate, false reports — open the sources.',
    alertsTitle: 'Alerts for this feed', levelVerified: 'Only verified stories', levelDeveloping: 'Developing and verified',
    turnOff: 'Turn off', turnOn: 'Turn on', update: 'Update', close: 'Close',
    verified: 'Verified', developing: 'Developing', unconfirmed: 'Unconfirmed',
    sources: (n) => `${n} source${n === 1 ? '' : 's'}`, sourcesBtn: (n) => `Sources (${n})`,
    first: 'first', latest: 'latest', updated: 'Updated',
    official: (x) => `Official source: ${x}`, outlets1: 'Single outlet so far', outlets: (n) => `${n} independent outlets`,
    wire: (x) => `Wire service: ${x}`, syndicated: (n) => `${n} sister/copied report${n === 1 ? '' : 's'} merged`,
    langs: 'Reported in English and Hindi', signals: (n) => `${n} social post${n === 1 ? '' : 's'} (not counted)`,
    tier: { official: 'Official', wire: 'Wire', major: 'Major', standard: 'Outlet', low: 'Low trust', social: 'Social' },
    emptyCollecting: 'Collecting the first stories for this feed… usually under a minute.',
    emptyFilter: 'No stories at this level yet.', widen: 'Show developing stories too',
    newStories: (n) => `↑ ${n} new stor${n === 1 ? 'y' : 'ies'}`,
    feedReady: 'Feed ready — share the link so others can follow it', linkCopied: 'Link copied',
    alertsOn: 'Alerts on — you will be notified as stories are verified', alertsOff: 'Alerts off for this feed',
    alertsOnFeed: 'Alerts are ON for this feed.', alertsOther: (n) => `Alerts are on for ${n} other feed(s).`,
    blocked: 'Notifications are blocked in your browser settings.',
    ios: 'On iPhone/iPad: tap Share → “Add to Home Screen”, open NewsPulse from the home screen, then turn on alerts.',
    noPush: 'This browser does not support push notifications.', serverDown: (e) => `Could not reach the server (${e}).`,
    src: { gnews: 'Google News', gdelt: 'GDELT', rss: 'Official feeds', x: 'X' },
    shareText: (t) => `Live, verified news: ${t}`, remove: 'Remove',
  },
  hi: {
    connecting: 'जुड़ रहा है', live: 'लाइव', reconnecting: 'फिर से जुड़ रहा है', offline: 'ऑफ़लाइन',
    install: 'इंस्टॉल', share: 'शेयर', alerts: '🔔 अलर्ट', change: 'बदलें',
    where: 'कहाँ की खबर?', placeHint: 'राज्य, ज़िला या शहर — वैकल्पिक।', placePh: 'जैसे राजस्थान, जयपुर',
    topic: 'विषय', newsLang: 'खबरों की भाषा', showNews: 'खबरें दिखाएँ', both: 'दोनों',
    keywordsPh: 'अपने कीवर्ड, कॉमा से अलग करें', needKeywords: 'कुछ कीवर्ड या जगह लिखें।',
    tabVerified: '✅ पुष्ट', tabDeveloping: '🟡 + विकसित हो रही', tabAll: 'सभी',
    footer: '“पुष्ट” का मतलब है कि अलग-अलग स्वतंत्र मीडिया संस्थानों ने खबर की पुष्टि की है (एक ही समूह के संस्थान और कॉपी की गई एजेंसी खबरें एक ही गिनी जाती हैं)। इससे गलत खबरें काफ़ी कम होती हैं, पर पूरी तरह ख़त्म नहीं — स्रोत ज़रूर देखें।',
    alertsTitle: 'इस फ़ीड के अलर्ट', levelVerified: 'सिर्फ़ पुष्ट खबरें', levelDeveloping: 'विकसित हो रही और पुष्ट खबरें',
    turnOff: 'बंद करें', turnOn: 'चालू करें', update: 'अपडेट करें', close: 'बंद',
    verified: 'पुष्ट', developing: 'विकसित हो रही', unconfirmed: 'अपुष्ट',
    sources: (n) => `${n} स्रोत`, sourcesBtn: (n) => `स्रोत (${n})`,
    first: 'पहली खबर', latest: 'ताज़ा', updated: 'अपडेट',
    official: (x) => `आधिकारिक स्रोत: ${x}`, outlets1: 'अभी तक एक ही स्रोत', outlets: (n) => `${n} स्वतंत्र स्रोत`,
    wire: (x) => `समाचार एजेंसी: ${x}`, syndicated: (n) => `एक ही समूह/कॉपी की ${n} रिपोर्ट एक गिनी गई`,
    langs: 'हिंदी और अंग्रेज़ी दोनों में', signals: (n) => `${n} सोशल पोस्ट (गिनी नहीं गईं)`,
    tier: { official: 'आधिकारिक', wire: 'एजेंसी', major: 'प्रमुख', standard: 'मीडिया', low: 'कम भरोसेमंद', social: 'सोशल' },
    emptyCollecting: 'इस फ़ीड की पहली खबरें जुटाई जा रही हैं… आमतौर पर एक मिनट से कम।',
    emptyFilter: 'इस स्तर पर अभी कोई खबर नहीं।', widen: 'विकसित हो रही खबरें भी दिखाएँ',
    newStories: (n) => `↑ ${n} नई खबरें`,
    feedReady: 'फ़ीड तैयार — लिंक शेयर करें ताकि दूसरे भी देख सकें', linkCopied: 'लिंक कॉपी हो गया',
    alertsOn: 'अलर्ट चालू — खबर पुष्ट होते ही सूचना मिलेगी', alertsOff: 'इस फ़ीड के अलर्ट बंद',
    alertsOnFeed: 'इस फ़ीड के अलर्ट चालू हैं।', alertsOther: (n) => `${n} दूसरी फ़ीड के अलर्ट चालू हैं।`,
    blocked: 'ब्राउज़र सेटिंग्स में नोटिफ़िकेशन ब्लॉक हैं।',
    ios: 'iPhone/iPad पर: शेयर → “Add to Home Screen” दबाएँ, होम स्क्रीन से NewsPulse खोलें, फिर अलर्ट चालू करें।',
    noPush: 'यह ब्राउज़र पुश नोटिफ़िकेशन सपोर्ट नहीं करता।', serverDown: (e) => `सर्वर से संपर्क नहीं हो सका (${e})।`,
    src: { gnews: 'Google News', gdelt: 'GDELT', rss: 'आधिकारिक फ़ीड', x: 'X' },
    shareText: (t) => `लाइव, पुष्ट खबरें: ${t}`, remove: 'हटाएँ',
  },
};
const LANG_NAME = { en: 'English', hi: 'हिंदी' };

function localGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
}

const params = new URLSearchParams(location.search);
const state = {
  ui: localGet('np.ui') || (navigator.language?.startsWith('hi') ? 'hi' : 'en'),
  meta: null,
  featured: [],
  feed: null,
  status: localGet('np.status') ?? 'verified,developing',
  stories: new Map(),
  pending: new Map(),
  sources: {},
  focusStory: params.get('story'),
  recents: JSON.parse(localGet('np.recents') || '[]'),
  es: null,
  draft: { country: 'IN', place: '', domain: 'politics', langs: [], keywords: '' },
};
const t = (k, ...a) => {
  const v = STR[state.ui][k] ?? STR.en[k];
  return typeof v === 'function' ? v(...a) : v;
};

// --- helpers -----------------------------------------------------------------
async function getJson(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
const postJson = (url, body) => getJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3500);
}

function ago(ts) {
  const s = Math.round((ts - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(state.ui === 'hi' ? 'hi-IN' : 'en', { numeric: 'auto', style: 'short' });
  if (Math.abs(s) < 60) return rtf.format(0, 'second');
  if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');
const feedName = (f) => f?.label?.[state.ui] || f?.label?.en || '';

// --- static text ---------------------------------------------------------------
function applyStrings() {
  document.documentElement.lang = state.ui;
  for (const n of $$('[data-i18n]')) n.textContent = t(n.dataset.i18n);
  $('#uiLangBtn').textContent = state.ui === 'hi' ? 'English' : 'हिंदी';
  $('#placeInput').placeholder = t('placePh');
  $('#keywordsInput').placeholder = t('keywordsPh');
  setLive($('#live').dataset.mode);
}

// --- finder ------------------------------------------------------------------
const country = (code) => state.meta.countries.find((c) => c.code === code);
const countryName = (c) => (state.ui === 'hi' ? c.nameHi : c.name);

function renderFinder() {
  const d = state.draft;
  const sel = $('#countrySelect');
  sel.replaceChildren(...state.meta.countries.map((c) => el('option', { value: c.code }, countryName(c))));
  sel.value = d.country;
  const places = state.meta.places[d.country] || [];
  // Show a known place in the interface language (the server accepts either spelling).
  const known = places.find((p) => [p.en, p.hi].some((n) => n.toLowerCase() === d.place.trim().toLowerCase()));
  if (known) d.place = state.ui === 'hi' ? known.hi : known.en;
  $('#placeInput').value = d.place;
  $('#placeList').replaceChildren(
    ...places.map((p) => el('option', { value: state.ui === 'hi' ? p.hi : p.en }, p.state ? `${state.ui === 'hi' ? p.en : p.hi} · ${p.state}` : state.ui === 'hi' ? p.en : p.hi)),
  );
  $('#topicChips').replaceChildren(
    ...state.meta.domains.map((dm) =>
      el('button', {
        type: 'button', role: 'radio', class: `chip${dm.id === d.domain ? ' active' : ''}`, 'aria-checked': String(dm.id === d.domain),
        onclick: () => { d.domain = dm.id; renderFinder(); if (dm.id === 'custom') $('#keywordsInput').focus(); },
      }, `${dm.icon} ${state.ui === 'hi' ? dm.labelHi : dm.label}`),
    ),
  );
  $('#keywordsInput').hidden = d.domain !== 'custom';
  $('#keywordsInput').value = d.keywords;
  const langs = country(d.country)?.langs || ['en'];
  $('#langField').hidden = langs.length < 2;
  if (!d.langs.length || d.langs.some((l) => !langs.includes(l))) d.langs = [...langs];
  const options = [...langs.map((l) => [[l], LANG_NAME[l]]), [langs, t('both')]];
  $('#langChips').replaceChildren(
    ...options.map(([value, label]) => {
      const on = value.length === d.langs.length && value.every((l) => d.langs.includes(l));
      return el('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: on ? 'active' : '', onclick: () => { d.langs = [...value]; renderFinder(); } }, label);
    }),
  );
  $('#summaryText').textContent = state.feed ? `📍 ${feedName(state.feed)}${state.feed.langs.length > 1 ? ` · ${t('both')}` : ` · ${LANG_NAME[state.feed.langs[0]] || ''}`}` : '';
}

function setFinderOpen(open) {
  $('#finder').classList.toggle('open', open);
  $('#finderSummary').setAttribute('aria-expanded', String(open));
}

$('#finderSummary').addEventListener('click', () => setFinderOpen(!$('#finder').classList.contains('open')));
$('#countrySelect').addEventListener('change', (e) => {
  Object.assign(state.draft, { country: e.target.value, place: '', langs: [] });
  renderFinder();
});
$('#placeInput').addEventListener('input', (e) => (state.draft.place = e.target.value));
$('#keywordsInput').addEventListener('input', (e) => (state.draft.keywords = e.target.value));
$('#finderBody').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = state.draft;
  $('#finderError').hidden = true;
  if (d.domain === 'custom' && !d.keywords.trim() && !d.place.trim()) {
    $('#finderError').textContent = t('needKeywords');
    $('#finderError').hidden = false;
    return;
  }
  try {
    const feed = await postJson('/api/feeds', { country: d.country, place: d.place, domain: d.domain, langs: d.langs, keywords: d.keywords.split(',') });
    setFinderOpen(false);
    await selectFeed(feed);
    if (feed.custom) toast(t('feedReady'));
  } catch (err) {
    $('#finderError').textContent = err.message;
    $('#finderError').hidden = false;
  }
});

// --- feed shortcuts ------------------------------------------------------------
function remember(feed) {
  state.recents = [feed, ...state.recents.filter((f) => f.id !== feed.id)].slice(0, 8);
  localSet('np.recents', JSON.stringify(state.recents));
}

function renderShortcuts() {
  const seen = new Set();
  const list = [...state.recents, ...state.featured].filter((f) => !seen.has(f.id) && seen.add(f.id));
  $('#myFeeds').replaceChildren(
    ...list.map((f) => {
      const isRecent = state.recents.some((r) => r.id === f.id) && f.id !== state.feed?.id;
      return el('span', { class: `chip feedchip${f.id === state.feed?.id ? ' active' : ''}` },
        el('button', { type: 'button', class: 'go', onclick: () => selectFeed(f) }, feedName(f)),
        isRecent ? el('button', {
          type: 'button', class: 'x', 'aria-label': t('remove'),
          onclick: () => {
            state.recents = state.recents.filter((r) => r.id !== f.id);
            localSet('np.recents', JSON.stringify(state.recents));
            renderShortcuts();
          },
        }, '×') : null,
      );
    }),
  );
}

// --- stories -------------------------------------------------------------------
const STATUS_CLASS = { verified: 'ok', developing: 'warn', unconfirmed: 'muted' };

function reasonText(r) {
  switch (r.code) {
    case 'official': return t('official', r.name);
    case 'outlets': return r.n === 1 ? t('outlets1') : t('outlets', r.n);
    case 'wire': return t('wire', r.name);
    case 'syndicated': return t('syndicated', r.n);
    case 'langs': return t('langs');
    case 'signals': return t('signals', r.n);
    default: return typeof r === 'string' ? r : '';
  }
}

function storyCard(s) {
  const cls = STATUS_CLASS[s.status] || 'muted';
  const head = s.titles?.[state.ui] || { title: s.title, url: s.url };
  const outlets = new Map();
  for (const a of s.articles) if (!outlets.has(a.rootDomain)) outlets.set(a.rootDomain, a);
  return el('article', { class: `story s-${cls}${s._fresh ? ' fresh' : ''}`, id: `s-${s.id}` },
    el('div', { class: 'row meta' },
      el('span', { class: `badge ${cls}` }, t(s.status)),
      el('span', {}, t('sources', s.origins)),
      s.langs?.length > 1 ? el('span', { class: 'langtag' }, 'EN + हिं') : null,
      el('span', { class: 'when', title: new Date(s.publishedAt).toLocaleString() }, `${t('first')} ${ago(s.publishedAt)}`),
      s.latestAt - s.publishedAt > 120000 ? el('span', { class: 'when' }, `${t('latest')} ${ago(s.latestAt)}`) : null,
    ),
    el('h3', {}, el('a', { href: safeUrl(head.url), target: '_blank', rel: 'noopener noreferrer' }, head.title)),
    el('p', { class: 'reasons' }, s.reasons.map(reasonText).filter(Boolean).join(' · ')),
    el('div', { class: 'row tools' },
      el('details', {},
        el('summary', {}, t('sourcesBtn', outlets.size)),
        el('ol', { class: 'sources' },
          [...outlets.values()].map((a) => el('li', {},
            el('span', { class: `tier t-${a.tier}` }, t('tier')[a.tier] || a.tier),
            el('a', { href: safeUrl(a.url), target: '_blank', rel: 'noopener noreferrer' }, a.source || a.host),
            el('span', { class: 'when' }, ` ${a.lang === 'hi' ? 'हिं' : 'EN'} · ${ago(a.publishedAt)}`),
            el('div', { class: 'srctitle' }, a.title),
          )),
        ),
      ),
      el('button', { class: 'link', onclick: () => shareStory(s, head.title) }, t('share')),
    ),
  );
}

function counts() {
  const c = { verified: 0, developing: 0, all: state.stories.size };
  for (const s of state.stories.values()) if (s.status in c) c[s.status]++;
  c.developing += c.verified;
  return c;
}

function render() {
  const statuses = state.status ? new Set(state.status.split(',')) : null;
  const list = [...state.stories.values()]
    .filter((s) => !statuses || statuses.has(s.status))
    .sort((a, b) => b.latestAt - a.latestAt);
  $('#stories').replaceChildren(...list.map(storyCard));
  const c = counts();
  for (const b of $$('[data-count]')) b.textContent = c[b.dataset.count] || '';
  for (const tab of $$('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.status === state.status));
  const empty = $('#empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.replaceChildren(
      el('p', {}, state.stories.size ? t('emptyFilter') : t('emptyCollecting')),
      state.stories.size && state.status !== '' ? el('button', { class: 'ghost', onclick: () => setStatus(state.status === 'verified' ? 'verified,developing' : '') }, t('widen')) : null,
    );
  }
  renderStatus();
  if (state.focusStory) {
    const node = document.getElementById(`s-${state.focusStory}`);
    if (node) {
      node.classList.add('focus');
      node.scrollIntoView({ block: 'center' });
      state.focusStory = null;
    }
  }
}

function renderStatus() {
  const src = Object.entries(state.sources)
    .map(([id, s]) => `${t('src')[id] || id} ${s.lastError ? '⚠' : s.lastOk ? '✓' : '…'}`)
    .join(' · ');
  const last = Math.max(0, ...Object.values(state.sources).map((s) => s.lastOk || 0));
  $('#feedStatus').textContent = [last ? `${t('updated')} ${ago(last)}` : '', src].filter(Boolean).join(' · ');
}

function setStatus(status) {
  state.status = status;
  localSet('np.status', status);
  render();
}
for (const tab of $$('.tab')) tab.addEventListener('click', () => setStatus(tab.dataset.status));

// New stories arriving while the reader is scrolled down wait behind a pill instead of shifting the page.
function receive(stories) {
  const atTop = scrollY < 200;
  for (const s of stories) {
    const isNew = !state.stories.has(s.id);
    if (atTop || !isNew) {
      s._fresh = isNew;
      state.stories.set(s.id, s);
    } else {
      state.pending.set(s.id, s);
    }
  }
  updatePill();
  render();
}
function updatePill() {
  const pill = $('#newPill');
  pill.hidden = !state.pending.size;
  pill.textContent = t('newStories', state.pending.size);
}
$('#newPill').addEventListener('click', () => {
  for (const [id, s] of state.pending) state.stories.set(id, { ...s, _fresh: true });
  state.pending.clear();
  updatePill();
  render();
  scrollTo({ top: 0, behavior: 'smooth' });
});
addEventListener('scroll', () => {
  if (scrollY < 50 && state.pending.size) $('#newPill').click();
}, { passive: true });

// --- feed selection & live stream ------------------------------------------------
async function selectFeed(feed, { updateUrl = true } = {}) {
  state.feed = feed;
  Object.assign(state.draft, { country: feed.country, place: feed.place, domain: feed.domain, langs: [...feed.langs], keywords: (feed.keywords || []).join(', ') });
  localSet('np.feed', feed.id);
  remember(feed);
  if (updateUrl) {
    const u = new URL(location.href);
    u.searchParams.set('feed', feed.id);
    u.searchParams.delete('story');
    history.replaceState(null, '', u);
  }
  document.title = `${feedName(feed)} — NewsPulse`;
  $('#feedTitle').textContent = feedName(feed);
  state.stories.clear();
  state.pending.clear();
  updatePill();
  renderFinder();
  renderShortcuts();
  render();
  try {
    const data = await getJson(`/api/feeds/${encodeURIComponent(feed.id)}/stories?limit=300`);
    state.sources = data.sources;
    state.stories = new Map(data.stories.map((s) => [s.id, s]));
    render();
  } catch (e) {
    toast(e.message);
  }
  connectStream();
}

function connectStream() {
  state.es?.close();
  setLive('connecting');
  const es = new EventSource(`/api/stream?feed=${encodeURIComponent(state.feed.id)}`);
  state.es = es;
  es.onopen = () => setLive('live');
  es.onerror = () => setLive(navigator.onLine ? 'reconnecting' : 'offline');
  es.addEventListener('stories', (e) => receive(JSON.parse(e.data)));
  es.addEventListener('ping', (e) => {
    state.sources = JSON.parse(e.data);
    renderStatus();
  });
}

function setLive(mode = 'connecting') {
  const n = $('#live');
  n.dataset.mode = mode;
  n.querySelector('b').textContent = t(mode);
}

// --- sharing -----------------------------------------------------------------------
async function share(data) {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    toast(t('linkCopied'));
  } catch {
    prompt(t('share'), data.url);
  }
}
function shareStory(s, title) {
  const u = new URL('/', location.origin);
  u.searchParams.set('feed', state.feed.id);
  u.searchParams.set('story', s.id);
  share({ title, text: `${t(s.status)}: ${title}`, url: u.href });
}
$('#shareBtn').addEventListener('click', () => {
  const u = new URL('/', location.origin);
  u.searchParams.set('feed', state.feed.id);
  share({ title: `${feedName(state.feed)} — NewsPulse`, text: t('shareText', feedName(state.feed)), url: u.href });
});

// --- interface language ----------------------------------------------------------
$('#uiLangBtn').addEventListener('click', async () => {
  state.ui = state.ui === 'hi' ? 'en' : 'hi';
  localSet('np.ui', state.ui);
  applyStrings();
  renderFinder();
  renderShortcuts();
  updatePill();
  if (state.feed) {
    $('#feedTitle').textContent = feedName(state.feed);
    document.title = `${feedName(state.feed)} — NewsPulse`;
  }
  render();
  // Keep push notifications in the reader's language.
  if (pushSupported) {
    const st = await pushStatus().catch(() => null);
    if (st?.feeds.length) savePush(st.feeds, st.level).catch(() => {});
  }
});

// --- push notifications ------------------------------------------------------------
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function pushStatus() {
  const sub = await currentSubscription();
  if (!sub) return { feeds: [], level: 'verified' };
  return postJson('/api/push/status', { subscription: sub });
}

async function savePush(feeds, level) {
  let sub = await currentSubscription();
  if (!sub) {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error(t('blocked'));
    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.meta.vapidPublicKey) });
  }
  const res = await postJson('/api/push/subscribe', { subscription: sub, feeds, level, ui: state.ui });
  if (!res.feeds.length) await sub.unsubscribe();
  return res;
}

const form = $('#notifyForm');
$('#notifyBtn').addEventListener('click', async () => {
  $('#notifyFeedName').textContent = feedName(state.feed);
  const msg = $('#notifyMsg');
  msg.textContent = '';
  if (!pushSupported) {
    msg.textContent = isIos && !isStandalone ? t('ios') : t('noPush');
    $('#subBtn').disabled = $('#unsubBtn').disabled = true;
  } else {
    const st = await pushStatus().catch(() => ({ feeds: [], level: 'verified' }));
    const on = st.feeds.includes(state.feed.id);
    form.level.value = st.level;
    msg.textContent = on ? t('alertsOnFeed') : st.feeds.length ? t('alertsOther', st.feeds.length) : '';
    $('#subBtn').textContent = on ? t('update') : t('turnOn');
    $('#unsubBtn').disabled = !on;
  }
  $('#notifyDialog').showModal();
});
$('#subBtn').addEventListener('click', async () => {
  try {
    const st = await pushStatus().catch(() => ({ feeds: [] }));
    await savePush([...new Set([...st.feeds, state.feed.id])], form.level.value);
    $('#notifyDialog').close();
    toast(t('alertsOn'));
  } catch (e) {
    $('#notifyMsg').textContent = e.message;
  }
});
$('#unsubBtn').addEventListener('click', async () => {
  try {
    const st = await pushStatus();
    await savePush(st.feeds.filter((f) => f !== state.feed.id), st.level);
    $('#notifyDialog').close();
    toast(t('alertsOff'));
  } catch (e) {
    $('#notifyMsg').textContent = e.message;
  }
});

// --- install -----------------------------------------------------------------------
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  $('#installBtn').hidden = true;
  await installEvent?.prompt();
  installEvent = null;
});

// --- boot ------------------------------------------------------------------------
setInterval(() => state.feed && render(), 60000); // refresh relative times
addEventListener('online', () => state.feed && selectFeed(state.feed, { updateUrl: false }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.es?.readyState === EventSource.CLOSED) connectStream();
});

async function boot() {
  applyStrings();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try {
    [state.meta, state.featured] = await Promise.all([getJson('/api/meta'), getJson('/api/feeds?featured=1')]);
  } catch (e) {
    $('#empty').hidden = false;
    $('#empty').textContent = t('serverDown', e.message);
    return;
  }
  const wanted = params.get('feed') || localGet('np.feed');
  let feed = state.featured.find((f) => f.id === wanted);
  if (!feed && wanted) feed = await getJson(`/api/feeds/${encodeURIComponent(wanted)}`).catch(() => null);
  const firstVisit = !feed;
  feed ||= state.featured[0];
  await selectFeed(feed, { updateUrl: !params.get('story') });
  setFinderOpen(firstVisit);
}
boot();
