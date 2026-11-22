/**
 * RSS 2.0 / RDF / Atom parsing for official feeds. Pure and dependency-free:
 * the project carries no maintained XML parser, so this is a deliberately
 * small, strict tokenizer instead of pattern matching over the document.
 *
 * - One pass over the input: every position is read a bounded number of
 *   times, so the cost grows linearly with the size (2 MiB at most).
 * - No DTD and no entity expansion: a document declaring either is refused
 *   outright; only the five XML entities and numeric references are decoded.
 *   Nothing external is ever loaded.
 * - Well-formedness is checked as it goes: unclosed or mismatched elements,
 *   unterminated comments, CDATA or tags, and content after the root are
 *   refused as unparseable. A failed parse is an error, never an empty feed.
 * - Limits apply while reading: element depth, items kept and text kept per
 *   field. A valid feed without items returns [].
 * Feed content is untrusted data; nothing here interprets it beyond text.
 */
export interface FeedItem {
  guid: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  text: string;
}
export class FeedError extends Error {
  constructor(
    readonly code:
      | "feed_dtd_refused"
      | "feed_not_rss_or_atom"
      | "feed_too_large"
      | "feed_unparseable"
      | "feed_no_usable_items",
  ) {
    super(code);
  }
}

export const MAX_FEED_CHARS = 2 * 1024 * 1024;
const MAX_ITEMS = 200;
const MAX_TEXT = 8000;
const MAX_DEPTH = 64;
/** Raw characters kept per field before decoding; the decoded text is cut to its limit. */
const MAX_RAW = MAX_TEXT * 4;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,4});/gi, (match, entity: string) => {
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

/** Removes markup in one pass (escaped HTML in a description is markup too). */
function stripTags(value: string): string {
  let out = "";
  let at = 0;
  for (;;) {
    const open = value.indexOf("<", at);
    if (open === -1) return out + value.slice(at);
    const close = value.indexOf(">", open + 1);
    if (close === -1) return out + value.slice(at);
    out += value.slice(at, open) + " ";
    at = close + 1;
  }
}

const words = (raw: string, max: number) =>
  stripTags(decode(raw)).replace(/\s+/g, " ").trim().slice(0, max);

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
function isoDate(value: string): string | null {
  if (!value) return null;
  const time = Date.parse(value.trim());
  // Unknown dates stay unknown: never "now" as a stand-in.
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Attributes of one start tag, by lower-case name. Values are entity-decoded. */
function attributes(source: string): Map<string, string> {
  const found = new Map<string, string>();
  if (source.length > 4096) return found; // no real link tag is this long
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern))
    if (!found.has(match[1].toLowerCase()))
      found.set(match[1].toLowerCase(), decode(match[2] ?? match[3] ?? ""));
  return found;
}

const RSS_FIELDS = new Set([
  "title",
  "link",
  "description",
  "content:encoded",
  "guid",
  "pubdate",
  "dc:date",
]);
const ATOM_FIELDS = new Set(["title", "summary", "content", "id", "published", "updated"]);

interface Draft {
  fields: Map<string, string>;
  link: string | null;
}

export function parseFeed(xml: string): FeedItem[] {
  if (xml.length > MAX_FEED_CHARS) throw new FeedError("feed_too_large");
  const fail: () => never = () => {
    throw new FeedError("feed_unparseable");
  };
  const stack: string[] = [];
  let kind: "rss" | "atom" | null = null;
  let rootClosed = false;
  let itemDepth = -1; // stack depth of the open item/entry, -1 outside one
  let field: string | null = null; // the item child being collected
  let fieldDepth = -1;
  let draft: Draft | null = null;
  let seenItems = 0;
  const drafts: Draft[] = [];

  const text = (raw: string) => {
    if (!raw) return;
    if (stack.length === 0) {
      if (raw.trim()) fail(); // character data outside the root element
      return;
    }
    if (draft && field) {
      const before = draft.fields.get(field) ?? "";
      if (before.length < MAX_RAW)
        draft.fields.set(field, before + raw.slice(0, MAX_RAW - before.length));
    }
  };

  let at = 0;
  const n = xml.length;
  while (at < n) {
    const open = xml.indexOf("<", at);
    if (open === -1) {
      text(xml.slice(at));
      break;
    }
    if (open > at) text(xml.slice(at, open));
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end === -1) fail();
      at = end + 3;
    } else if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      if (end === -1) fail();
      if (stack.length === 0) fail();
      // CDATA in a feed carries HTML: its markup is removed and its entities decoded later.
      text(xml.slice(open + 9, end));
      at = end + 3;
    } else if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end === -1) fail();
      at = end + 2;
    } else if (xml.startsWith("<!", open)) {
      // A document type or entity declaration is refused; any other is malformed.
      if (/^<!(DOCTYPE|ENTITY|ELEMENT|ATTLIST)/i.test(xml.slice(open, open + 10)))
        throw new FeedError("feed_dtd_refused");
      fail();
    } else {
      // A tag: find its end outside quoted attribute values, in one pass.
      let quote = 0;
      let end = -1;
      for (let i = open + 1; i < n; i++) {
        const c = xml.charCodeAt(i);
        if (quote) {
          if (c === quote) quote = 0;
        } else if (c === 34 || c === 39) quote = c;
        else if (c === 62) {
          end = i;
          break;
        } else if (c === 60) fail();
      }
      if (end === -1) fail();
      const tag = xml.slice(open + 1, end);
      at = end + 1;
      // Markup inside a field separates words.
      if (draft && field) text(" ");
      if (tag[0] === "/") {
        const name = tag.slice(1).trim().toLowerCase();
        if (!name || stack.pop() !== name) fail();
        if (stack.length === fieldDepth) {
          field = null;
          fieldDepth = -1;
        }
        if (stack.length === itemDepth) {
          if (draft) drafts.push(draft);
          draft = null;
          itemDepth = -1;
        }
        if (stack.length === 0) rootClosed = true;
        continue;
      }
      const selfClosing = tag.endsWith("/");
      const body = selfClosing ? tag.slice(0, -1) : tag;
      const name = /^[A-Za-z_][\w.:-]*/.exec(body)?.[0]?.toLowerCase();
      if (!name) fail();
      if (stack.length === 0) {
        if (rootClosed || kind) fail(); // a second root element
        kind = name === "feed" ? "atom" : name === "rss" || name === "rdf:rdf" ? "rss" : null;
        if (!kind) throw new FeedError("feed_not_rss_or_atom");
      }
      const depth = stack.length; // this element's depth once pushed is depth + 1
      if (itemDepth < 0 && name === (kind === "atom" ? "entry" : "item")) {
        seenItems++;
        if (drafts.length < MAX_ITEMS) {
          draft = { fields: new Map(), link: null };
          itemDepth = depth;
        }
        if (selfClosing) {
          if (draft) drafts.push(draft);
          draft = null;
          itemDepth = -1;
          continue;
        }
      } else if (draft && depth === itemDepth + 1) {
        if (kind === "atom" && name === "link" && !draft.link) {
          const attrs = attributes(body);
          const rel = attrs.get("rel");
          if (!rel || rel === "alternate") draft.link = httpsUrl(attrs.get("href"));
        }
        if (
          (kind === "atom" ? ATOM_FIELDS : RSS_FIELDS).has(name) &&
          !selfClosing &&
          !draft.fields.has(name)
        ) {
          field = name;
          fieldDepth = depth;
          draft.fields.set(name, "");
        }
      }
      if (selfClosing) continue;
      if (stack.length >= MAX_DEPTH) fail();
      stack.push(name);
    }
  }
  if (!kind) throw new FeedError("feed_not_rss_or_atom");
  if (stack.length || !rootClosed) fail(); // truncated or unclosed

  const items: FeedItem[] = [];
  for (const { fields, link } of drafts) {
    const get = (name: string) => fields.get(name) ?? "";
    const url = kind === "atom" ? link : httpsUrl(words(get("link"), 2048));
    const text = words(
      kind === "atom"
        ? get("summary") || get("content")
        : get("description") || get("content:encoded"),
      MAX_TEXT,
    );
    const title = words(get("title"), 500) || text.slice(0, 200);
    const guid = words(get(kind === "atom" ? "id" : "guid"), 2000) || url || title;
    const publishedAt = isoDate(
      words(
        kind === "atom" ? get("published") || get("updated") : get("pubdate") || get("dc:date"),
        200,
      ),
    );
    if (!title || !guid) continue;
    items.push({ guid: guid.slice(0, 2000), title, url, publishedAt, text: text || title });
  }
  // Items that exist but carry nothing usable are a failed read, not "nothing new".
  if (seenItems > 0 && items.length === 0) throw new FeedError("feed_no_usable_items");
  return items;
}
