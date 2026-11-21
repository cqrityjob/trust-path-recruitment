/**
 * RSS 2.0 / Atom parsing for official feeds. Pure, dependency-free and
 * deliberately small: no DTD or entity expansion (a document declaring one is
 * refused outright), no external references, bounded sizes. Feed content is
 * untrusted data; nothing here interprets it beyond text.
 */
export interface FeedItem {
  guid: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  text: string;
}
export class FeedError extends Error {
  constructor(readonly code: "feed_dtd_refused" | "feed_not_rss_or_atom" | "feed_too_large") {
    super(code);
  }
}

const MAX_ITEMS = 200;
const MAX_TEXT = 8000;
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    }
    return NAMED[entity.toLowerCase()] ?? match;
  });
}

/** Text content of one element: CDATA kept verbatim, markup removed, entities decoded. */
function textOf(fragment: string | undefined): string {
  if (!fragment) return "";
  const parts: string[] = [];
  let rest = fragment;
  for (;;) {
    const start = rest.indexOf("<![CDATA[");
    if (start === -1) {
      parts.push(decode(rest.replace(/<[^>]*>/g, " ")));
      break;
    }
    parts.push(decode(rest.slice(0, start).replace(/<[^>]*>/g, " ")));
    const end = rest.indexOf("]]>", start + 9);
    const cdata = rest.slice(start + 9, end === -1 ? undefined : end);
    // HTML inside CDATA is still markup to us: keep the words only.
    parts.push(decode(cdata.replace(/<[^>]*>/g, " ")));
    if (end === -1) break;
    rest = rest.slice(end + 3);
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

function element(block: string, name: string): string | undefined {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return match?.[1];
}
function attribute(block: string, name: string, attr: string): string | undefined {
  const tag = new RegExp(`<${name}\\b[^>]*>`, "gi");
  for (const match of block.matchAll(tag)) {
    const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(match[0])?.[1];
    if (rel && rel !== "alternate") continue;
    const value = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, "i").exec(match[0])?.[1];
    if (value) return decode(value);
  }
  return undefined;
}
function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && trimmed.length <= 2048 && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
function isoDate(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value.trim());
  // Unknown dates stay unknown: never "now" as a stand-in.
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function parseFeed(xml: string): FeedItem[] {
  if (xml.length > 2 * 1024 * 1024) throw new FeedError("feed_too_large");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new FeedError("feed_dtd_refused");
  const isAtom = /<feed[\s>]/i.test(xml);
  const isRss = /<rss[\s>]|<rdf:RDF[\s>]/i.test(xml);
  if (!isAtom && !isRss) throw new FeedError("feed_not_rss_or_atom");
  const blocks = [
    ...xml.matchAll(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi),
  ]
    .map((match) => match[0])
    .slice(0, MAX_ITEMS);
  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = textOf(element(block, "title")).slice(0, 500);
    const url = isAtom
      ? httpsUrl(attribute(block, "link", "href"))
      : httpsUrl(textOf(element(block, "link")));
    const text = textOf(
      isAtom
        ? (element(block, "summary") ?? element(block, "content"))
        : (element(block, "description") ?? element(block, "content:encoded")),
    ).slice(0, MAX_TEXT);
    const guid = textOf(element(block, isAtom ? "id" : "guid")) || url || title;
    const publishedAt = isoDate(
      textOf(
        isAtom
          ? (element(block, "published") ?? element(block, "updated"))
          : (element(block, "pubDate") ?? element(block, "dc:date")),
      ),
    );
    if (!title || !guid) continue;
    items.push({ guid: guid.slice(0, 2000), title, url, publishedAt, text: text || title });
  }
  return items;
}
