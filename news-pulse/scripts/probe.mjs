// Raw probe of upstream sources (used in CI to confirm live data shape).
const UA = { 'user-agent': 'Mozilla/5.0 NewsPulse-probe' };
const gn = (q, hl, ceid) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=IN&ceid=${encodeURIComponent(ceid)}`;
const gd = (q, ts) => `https://api.gdeltproject.org/api/v2/doc/doc?${new URLSearchParams({ query: q, mode: 'artlist', format: 'json', maxrecords: '30', timespan: ts, sort: 'datedesc' })}`;
const probes = [
  ['gn-en', gn('Rajasthan (election OR minister OR "chief minister" OR assembly OR BJP OR Congress) when:12h', 'en-IN', 'IN:en')],
  ['gn-hi', gn('राजस्थान (चुनाव OR मंत्री OR मुख्यमंत्री OR विधानसभा OR भाजपा OR कांग्रेस) when:12h', 'hi', 'IN:hi')],
  ['gn-hi-grouped', gn('("राजस्थान" OR "Rajasthan") (चुनाव OR मंत्री OR मुख्यमंत्री OR विधानसभा OR भाजपा OR कांग्रेस) when:12h', 'hi', 'IN:hi')],
  ['gn-en-1h-markets', gn('(Sensex OR Nifty OR "stock market" OR RBI) when:1h', 'en-IN', 'IN:en')],
  ['gd-en', gd('"Rajasthan" (election OR minister OR assembly OR BJP OR Congress) sourcecountry:india', '12h')],
  ['gd-hi', gd('"Rajasthan" (election OR minister OR assembly OR BJP OR Congress) sourcelang:hindi', '12h')],
];
for (const [name, url] of probes) {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
    const body = await res.text();
    if (name.startsWith('gn')) {
      const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
      console.log(`\n### ${name}: HTTP ${res.status}, ${items.length} items`);
      for (const it of items.slice(0, 12)) {
        const t = /<title>([\s\S]*?)<\/title>/.exec(it)?.[1];
        const d = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(it)?.[1];
        const s = /<source url="([^"]*)">/.exec(it)?.[1];
        console.log(`- ${t} | ${s} | ${d}`);
      }
    } else {
      let j = {};
      try { j = JSON.parse(body); } catch { console.log(`\n### ${name}: HTTP ${res.status} non-json: ${body.slice(0, 200)}`); continue; }
      const a = j.articles || [];
      console.log(`\n### ${name}: HTTP ${res.status}, ${a.length} articles`);
      for (const x of a.slice(0, 12)) console.log(`- ${x.title} | ${x.domain} | ${x.language} | ${x.seendate}`);
    }
  } catch (e) {
    console.log(`\n### ${name}: ERROR ${e.message}`);
  }
}
