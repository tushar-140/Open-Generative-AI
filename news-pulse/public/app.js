const $ = (s) => document.querySelector(s);
const els = {
  feedSelect: $('#feedSelect'), stories: $('#stories'), empty: $('#empty'), live: $('#live'), feedInfo: $('#feedInfo'),
  toast: $('#toast'), feedDialog: $('#feedDialog'), feedForm: $('#feedForm'), feedError: $('#feedError'),
  notifyDialog: $('#notifyDialog'), notifyMsg: $('#notifyMsg'), installBtn: $('#installBtn'),
};
const STATUS = {
  verified: { label: 'Verified', cls: 'ok' },
  developing: { label: 'Developing', cls: 'warn' },
  unconfirmed: { label: 'Unconfirmed', cls: 'muted' },
};
const TIER_LABEL = { official: 'Official', wire: 'Wire', major: 'Major', standard: 'Outlet', low: 'Low trust', social: 'Social' };

const params = new URLSearchParams(location.search);
const state = {
  meta: null,
  feeds: [],
  feedId: params.get('feed') || localGet('np.feed') || '',
  status: localGet('np.status') ?? 'verified',
  focusStory: params.get('story'),
  stories: new Map(),
  es: null,
};

function localGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
}

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (els.toast.hidden = true), 3000);
}

const ago = (ts) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

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

function storyCard(s) {
  const st = STATUS[s.status] || STATUS.unconfirmed;
  const outlets = new Map();
  for (const a of s.articles) if (!outlets.has(a.rootDomain)) outlets.set(a.rootDomain, a);
  const sources = el('ol', { class: 'sources' },
    [...outlets.values()].map((a) => el('li', {},
      el('span', { class: `tier t-${a.tier}` }, TIER_LABEL[a.tier] || a.tier),
      el('a', { href: safeUrl(a.url), target: '_blank', rel: 'noopener noreferrer' }, a.source || a.host),
      el('span', { class: 'when' }, ago(a.publishedAt)),
    )),
  );
  return el('article', { class: `story s-${st.cls}`, id: `s-${s.id}`, 'data-id': s.id },
    el('div', { class: 'row meta' },
      el('span', { class: `badge ${st.cls}` }, st.label),
      el('span', {}, `${s.origins} source${s.origins === 1 ? '' : 's'}`),
      el('span', { class: 'when', title: new Date(s.publishedAt).toLocaleString() }, `first ${ago(s.publishedAt)}`),
      s.latestAt - s.publishedAt > 60000 ? el('span', { class: 'when' }, `latest ${ago(s.latestAt)}`) : null,
    ),
    el('h3', {}, el('a', { href: safeUrl(s.url), target: '_blank', rel: 'noopener noreferrer' }, s.title)),
    el('p', { class: 'reasons' }, s.reasons.join(' · ')),
    el('details', {}, el('summary', {}, `Sources (${outlets.size})`), sources),
    el('div', { class: 'row tools' },
      el('button', { class: 'link', onclick: () => shareStory(s) }, 'Share'),
    ),
  );
}

function render() {
  const statuses = state.status ? new Set(state.status.split(',')) : null;
  const list = [...state.stories.values()]
    .filter((s) => !statuses || statuses.has(s.status))
    .sort((a, b) => b.latestAt - a.latestAt);
  els.stories.replaceChildren(...list.map(storyCard));
  els.empty.hidden = list.length > 0;
  els.empty.textContent = state.stories.size
    ? 'Nothing at this verification level yet. Widen the filter or wait — stories are re-checked every minute.'
    : 'Collecting the first stories for this feed… this takes up to a minute for a new feed.';
  if (state.focusStory) {
    const node = document.getElementById(`s-${state.focusStory}`);
    if (node) {
      node.classList.add('focus');
      node.scrollIntoView({ block: 'center' });
      state.focusStory = null;
    }
  }
}

function renderFeedInfo(feed, sources) {
  const kw = feed.effectiveKeywords.slice(0, 8).join(', ');
  const src = Object.entries(sources || {})
    .map(([id, s]) => `${id}${s.lastError ? ' ⚠' : s.lastOk ? ' ✓' : ' …'}`)
    .join('  ');
  els.feedInfo.textContent = `${feed.place ? `${feed.place} · ` : ''}${kw || 'top stories'}${src ? `  |  ${src}` : ''}`;
}

async function loadStories() {
  const feed = state.feeds.find((f) => f.id === state.feedId);
  if (!feed) return;
  const data = await getJson(`/api/feeds/${encodeURIComponent(feed.id)}/stories?limit=300`);
  state.stories = new Map(data.stories.map((s) => [s.id, s]));
  renderFeedInfo(data.feed, data.sources);
  render();
}

function connectStream() {
  state.es?.close();
  setLive('connecting');
  const es = new EventSource(`/api/stream?feed=${encodeURIComponent(state.feedId)}`);
  state.es = es;
  es.onopen = () => setLive('live');
  es.onerror = () => setLive(navigator.onLine ? 'reconnecting' : 'offline');
  es.addEventListener('stories', (e) => {
    for (const s of JSON.parse(e.data)) state.stories.set(s.id, s);
    render();
  });
  es.addEventListener('ping', (e) => {
    const feed = state.feeds.find((f) => f.id === state.feedId);
    if (feed) renderFeedInfo(feed, JSON.parse(e.data));
  });
}

function setLive(mode) {
  els.live.dataset.mode = mode;
  els.live.querySelector('b').textContent = mode;
}

async function selectFeed(id, { push = true } = {}) {
  state.feedId = id;
  localSet('np.feed', id);
  els.feedSelect.value = id;
  const feed = state.feeds.find((f) => f.id === id);
  document.title = `${feed?.name || 'NewsPulse'} — NewsPulse`;
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('feed', id);
    u.searchParams.delete('story');
    history.replaceState(null, '', u);
  }
  state.stories.clear();
  render();
  await loadStories().catch((e) => toast(e.message));
  connectStream();
}

function renderFeedOptions() {
  els.feedSelect.replaceChildren(
    el('optgroup', { label: 'Featured' }, state.feeds.filter((f) => !f.custom).map((f) => el('option', { value: f.id }, f.name))),
    el('optgroup', { label: 'Community feeds' }, state.feeds.filter((f) => f.custom).map((f) => el('option', { value: f.id }, f.name))),
  );
}

// --- sharing ---------------------------------------------------------------
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
    toast('Link copied');
  } catch {
    prompt('Copy this link', data.url);
  }
}
function shareStory(s) {
  const u = new URL('/', location.origin);
  u.searchParams.set('feed', state.feedId);
  u.searchParams.set('story', s.id);
  share({ title: s.title, text: `${STATUS[s.status]?.label}: ${s.title}`, url: u.href });
}
$('#shareBtn').addEventListener('click', () => {
  const feed = state.feeds.find((f) => f.id === state.feedId);
  const u = new URL('/', location.origin);
  u.searchParams.set('feed', state.feedId);
  share({ title: `${feed?.name} — NewsPulse`, text: `Live verified news: ${feed?.name}`, url: u.href });
});

// --- filters ---------------------------------------------------------------
for (const chip of document.querySelectorAll('.chip')) {
  chip.classList.toggle('active', chip.dataset.status === state.status);
  chip.addEventListener('click', () => {
    state.status = chip.dataset.status;
    localSet('np.status', state.status);
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    render();
  });
}
els.feedSelect.addEventListener('change', () => selectFeed(els.feedSelect.value));

// --- new feed --------------------------------------------------------------
$('#newFeedBtn').addEventListener('click', () => {
  els.feedError.hidden = true;
  els.feedDialog.showModal();
});
const updateHint = () => {
  const d = state.meta.domains.find((x) => x.id === els.feedForm.domain.value);
  $('#domainHint').textContent = d?.keywords.length ? `Tracks: ${d.keywords.join(', ')}` : 'Only your keywords and place are tracked.';
};
els.feedForm.domain.addEventListener('change', updateHint);
els.feedForm.addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'create') return;
  e.preventDefault();
  const f = new FormData(els.feedForm);
  try {
    const feed = await getJson('/api/feeds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        country: f.get('country'), domain: f.get('domain'), place: f.get('place'),
        keywords: String(f.get('keywords') || '').split(','),
      }),
    });
    if (!state.feeds.some((x) => x.id === feed.id)) state.feeds.push(feed);
    renderFeedOptions();
    els.feedDialog.close();
    await selectFeed(feed.id);
    toast('Feed created — share the link to let others follow it');
  } catch (err) {
    els.feedError.textContent = err.message;
    els.feedError.hidden = false;
  }
});

// --- push notifications ----------------------------------------------------
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
  return getJson('/api/push/status', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub }),
  });
}

async function savePush(feeds, level) {
  let sub = await currentSubscription();
  if (!sub) {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked in browser settings');
    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.meta.vapidPublicKey) });
  }
  const res = await getJson('/api/push/subscribe', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub, feeds, level }),
  });
  if (!res.feeds.length) await sub.unsubscribe();
  return res;
}

async function openNotify() {
  const feed = state.feeds.find((f) => f.id === state.feedId);
  $('#notifyFeedName').textContent = feed?.name || '';
  els.notifyMsg.textContent = '';
  if (!pushSupported) {
    els.notifyMsg.textContent = isIos && !isStandalone
      ? 'On iPhone/iPad: tap Share → "Add to Home Screen", open NewsPulse from the home screen, then enable alerts.'
      : 'This browser does not support push notifications.';
    $('#subBtn').disabled = $('#unsubBtn').disabled = true;
  } else {
    const st = await pushStatus().catch(() => ({ feeds: [], level: 'verified' }));
    const on = st.feeds.includes(state.feedId);
    els.notifyForm.level.value = st.level;
    els.notifyMsg.textContent = on ? 'Alerts are ON for this feed.' : st.feeds.length ? `Alerts on for ${st.feeds.length} other feed(s).` : '';
    $('#subBtn').textContent = on ? 'Update' : 'Turn on';
    $('#unsubBtn').disabled = !on;
  }
  els.notifyDialog.showModal();
}
els.notifyForm = $('#notifyForm');
$('#notifyBtn').addEventListener('click', openNotify);
$('#subBtn').addEventListener('click', async () => {
  try {
    const st = await pushStatus().catch(() => ({ feeds: [] }));
    const feeds = [...new Set([...st.feeds, state.feedId])];
    await savePush(feeds, els.notifyForm.level.value);
    els.notifyDialog.close();
    toast('Alerts on — you will be notified as stories are verified');
  } catch (e) {
    els.notifyMsg.textContent = e.message;
  }
});
$('#unsubBtn').addEventListener('click', async () => {
  try {
    const st = await pushStatus();
    await savePush(st.feeds.filter((f) => f !== state.feedId), st.level);
    els.notifyDialog.close();
    toast('Alerts off for this feed');
  } catch (e) {
    els.notifyMsg.textContent = e.message;
  }
});

// --- install ---------------------------------------------------------------
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  els.installBtn.hidden = false;
});
els.installBtn.addEventListener('click', async () => {
  els.installBtn.hidden = true;
  await installEvent?.prompt();
  installEvent = null;
});

// --- boot ------------------------------------------------------------------
setInterval(render, 60000); // refresh relative times
addEventListener('online', () => state.feedId && selectFeed(state.feedId, { push: false }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.es?.readyState === EventSource.CLOSED) connectStream();
});

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try {
    [state.meta, state.feeds] = await Promise.all([getJson('/api/meta'), getJson('/api/feeds')]);
  } catch (e) {
    els.empty.hidden = false;
    els.empty.textContent = `Could not reach the server (${e.message}).`;
    return;
  }
  renderFeedOptions();
  els.feedForm.country.replaceChildren(...state.meta.countries.map((c) => el('option', { value: c.code }, c.name)));
  els.feedForm.domain.replaceChildren(...state.meta.domains.map((d) => el('option', { value: d.id }, d.label)));
  els.feedForm.country.value = state.feeds.find((f) => f.id === state.feedId)?.country || 'IN';
  updateHint();
  if (!state.feeds.some((f) => f.id === state.feedId)) state.feedId = state.feeds[0]?.id;
  await selectFeed(state.feedId, { push: !params.get('story') });
}
boot();
