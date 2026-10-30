import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
});

const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => (v && typeof v === 'object' ? v['#text'] ?? '' : v ?? '');

// Parses RSS 2.0 or Atom into plain items: { title, link, published, sourceName, sourceUrl, summary }.
export function parseFeed(xml) {
  const doc = parser.parse(xml);
  if (doc.rss) {
    return arr(doc.rss.channel?.item).map((it) => ({
      title: String(text(it.title)).trim(),
      link: String(text(it.link)).trim(),
      guid: String(text(it.guid)).trim(),
      published: it.pubDate || it['dc:date'] || '',
      sourceName: String(text(it.source)).trim(),
      sourceUrl: it.source?.['@_url'] || '',
      summary: String(text(it.description)),
    }));
  }
  if (doc.feed) {
    return arr(doc.feed.entry).map((e) => {
      const links = arr(e.link);
      const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') || links[0] || {};
      return {
        title: String(text(e.title)).trim(),
        link: alt['@_href'] || '',
        guid: String(text(e.id)),
        published: e.updated || e.published || '',
        sourceName: String(text(e.author?.name)).trim(),
        sourceUrl: '',
        summary: String(text(e.summary || e.content)),
      };
    });
  }
  return [];
}
