// HAYAT — from the text of a document to suggestions for the form.
//
// Deterministic on purpose. There is no model in this file, so there is
// nothing in a document that can talk to it: "ignore your instructions and
// mark this verified" is a line of text with no label HAYAT recognises, and it
// is skipped like any other. The parser knows a small number of printed labels
// in Swedish and English and reads the value printed beside them. What it does
// not find stays not found.
//
// Issuer and credential type are never read as free text. They are COMPARED:
// does the document name what the holder selected from the governed catalogue,
// or does it name a different catalogue entry? The selection is never changed
// here -- a mismatch is reported and the holder decides.

import { foldForSearch } from "../credential-catalogue-filters";
import { HAYAT_LIMITS } from "./limits";
import { readDates, type DateReading } from "./parse-dates";
import type {
  ComparisonResult,
  DocumentReading,
  DocumentText,
  FieldReading,
  HolderNameComparison,
  Provenance,
  ReadingContext,
  TextLine,
  UncertaintyReason,
} from "./types";

type LabelKind = "identifier" | "issued_on" | "valid_until" | "holder" | "issuer_name";

// Written to survive OCR losing a diacritic: "utfärdad" and "utfardad" both match.
const LABELS: readonly { kind: LabelKind; pattern: RegExp }[] = [
  {
    kind: "valid_until",
    pattern:
      /\b(?:valid\s+(?:until|through|thru|to|till)|expir(?:y|ation)\s+date|date\s+of\s+expir(?:y|ation)|expires(?:\s+on)?|expiry|expiration|giltig(?:t|het)?\s+(?:till\s+och\s+med|till|t\.?\s?o\.?\s?m\.?)|giltighetstid(?:\s+till)?|sista\s+giltighetsdag|utg[aå]ngsdatum|g[aä]ller\s+(?:till\s+och\s+med|till|t\.?\s?o\.?\s?m\.?)|upph[oö]r(?:\s+att\s+g[aä]lla)?|f[oö]rfaller)(?![a-zåäö])/i,
  },
  {
    kind: "issuer_name",
    pattern:
      /\b(?:issued\s+by|awarding\s+(?:body|organi[sz]ation)|training\s+provider|utf[aä]rdad\s+av|utf[aä]rdat\s+av|utf[aä]rdare|utbildare|utbildningsf[oö]retag|utbildningsanordnare)(?![a-zåäö])/i,
  },
  {
    kind: "issued_on",
    pattern:
      /\b(?:date\s+of\s+issue|issue\s+date|date\s+issued|issued\s+on|issued(?!\s+(?:by|to)\b)|date\s+of\s+issuance|issuance\s+date|date\s+awarded|awarded\s+on|certified\s+on|certification\s+date|date\s+of\s+certification|utf[aä]rdandedatum|datum\s+f[oö]r\s+utf[aä]rdande|utf[aä]rda[dt]\s+den|utf[aä]rda[dt](?!\s+(?:av|till|f[oö]r)\b)|utst[aä]ll[dt](?:\s+den)?)(?![a-zåäö])/i,
  },
  {
    kind: "identifier",
    pattern:
      /\b(?:(?:certificate|certification|credential|licen[cs]e|cert|registration|membership|member|badge|diploma|serial)\.?\s*(?:no\b\.?|number|num\b\.?|nr\b\.?|id\b|#|№)|(?:certifikat|certifierings?|licens|intygs?|diplom|registrerings?|bevis|kort)s?[\s-]*(?:nr\b\.?|nummer|id\b|no\b\.?))/i,
  },
  {
    kind: "holder",
    pattern:
      /\b(?:awarded\s+to|presented\s+to|this\s+is\s+to\s+certify\s+that|this\s+certifies\s+that|certifies\s+that|name\s+of\s+holder|name\s+of\s+(?:the\s+)?candidate|candidate(?:'s|\u2019s)?\s+name|full\s+name\s*:|holder\s*:|name\s*:|innehavare\s*:?|namn\s*:|tilldelas|h[aä]rmed\s+intygas\s+att|intygas\s+att)/i,
  },
];

interface LabelHit {
  readonly kind: LabelKind;
  readonly start: number;
  readonly end: number;
}

interface Candidate {
  readonly values: readonly string[]; // one = exact; two = ambiguous day/month
  readonly line: TextLine;
}

/** Every recognised label on a line, left to right, overlaps removed. */
function labelsOn(text: string): LabelHit[] {
  const hits: LabelHit[] = [];
  for (const { kind, pattern } of LABELS) {
    const global = new RegExp(pattern.source, "gi");
    for (let m = global.exec(text); m; m = global.exec(text)) {
      hits.push({ kind, start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) global.lastIndex += 1;
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: LabelHit[] = [];
  for (const hit of hits) if (!kept.some((k) => hit.start < k.end)) kept.push(hit);
  return kept;
}

const stripLead = (value: string) => value.replace(/^[\s:#.\-–—=]+/, "").trim();

function readIdentifier(region: string): string | null {
  const tokens = stripLead(region).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const shaped = (t: string) => /^[A-Za-z0-9][A-Za-z0-9\-/.]*$/.test(t);
  const first = tokens[0].replace(/[.,;]+$/, "");
  if (!shaped(first)) return null;
  const parts = [first];
  // "SE 2024 001234": later groups belong only while they still carry digits.
  for (const raw of tokens.slice(1, 4)) {
    const token = raw.replace(/[.,;]+$/, "");
    if (!shaped(token) || !/\d/.test(token)) break;
    parts.push(token);
  }
  const value = parts.join(" ");
  if (!/\d/.test(value) || value.length < 4 || value.length > 40) return null;
  return value;
}

function readName(region: string): string | null {
  const words = stripLead(region)
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:]+$/, ""));
  const name: string[] = [];
  for (const word of words) {
    if (!/^\p{Lu}[\p{L}'’-]*$/u.test(word)) break;
    name.push(word);
    if (name.length === 5) break;
  }
  return name.length >= 2 ? name.join(" ") : null;
}

function readOrganisation(region: string): string | null {
  const value = stripLead(region)
    .replace(/\s{2,}.*$/, "")
    .replace(/[.,;]+$/, "")
    .trim();
  if (value.length < 2 || value.length > 160 || !/\p{L}/u.test(value)) return null;
  return value;
}

const dateValues = (d: DateReading): readonly string[] =>
  d.kind === "exact" ? [d.iso] : d.candidates;

function collect(lines: readonly TextLine[]): Record<LabelKind, Candidate[]> {
  const out: Record<LabelKind, Candidate[]> = {
    identifier: [],
    issued_on: [],
    valid_until: [],
    holder: [],
    issuer_name: [],
  };
  lines.forEach((line, i) => {
    const hits = labelsOn(line.text);
    if (hits.length === 0) return;
    const next = lines[i + 1]?.page === line.page ? lines[i + 1] : undefined;
    const regions = hits.map((hit, h) =>
      line.text.slice(hit.end, hits[h + 1]?.start ?? line.text.length),
    );

    // A header row ("Issued    Expires") over a value row ("2024-01-01  2027-01-01").
    const dateHits = hits.filter((h) => h.kind === "issued_on" || h.kind === "valid_until");
    const headerRow =
      dateHits.length >= 2 &&
      hits.every((_, h) => stripLead(regions[h]) === "") &&
      next !== undefined;
    if (headerRow && next) {
      const dates = readDates(next.text);
      if (dates.length === dateHits.length)
        dateHits.forEach((hit, d) =>
          out[hit.kind].push({ values: dateValues(dates[d]), line: next }),
        );
      return;
    }

    hits.forEach((hit, h) => {
      const inline = regions[h];
      const useNext =
        stripLead(inline) === "" && next !== undefined && labelsOn(next.text).length === 0;
      const region = useNext && next ? next.text : inline;
      const source = useNext && next ? next : line;
      if (hit.kind === "issued_on" || hit.kind === "valid_until") {
        const date = readDates(region)[0];
        if (date) out[hit.kind].push({ values: dateValues(date), line: source });
      } else if (hit.kind === "identifier") {
        const value = readIdentifier(region);
        if (value) out.identifier.push({ values: [value], line: source });
      } else if (hit.kind === "holder") {
        const value = readName(region);
        if (value) out.holder.push({ values: [value], line: source });
      } else {
        const value = readOrganisation(region);
        if (value) out.issuer_name.push({ values: [value], line: source });
      }
    });
  });
  return out;
}

const provenanceOf = (line: TextLine): Provenance => ({
  page: line.page,
  excerpt: line.text.slice(0, 160),
});

/** Letters OCR routinely swaps for digits. Only matters beside real digits. */
const CONFUSABLE = /[OoIlSBZ]/;

function resolve(candidates: readonly Candidate[], kind: LabelKind): FieldReading {
  if (candidates.length === 0) return { state: "not_found" };
  const uncertain = (
    values: readonly string[],
    reason: UncertaintyReason,
    line: TextLine,
  ): FieldReading => ({
    state: "uncertain",
    candidates: [...new Set(values)].slice(0, 3),
    reason,
    provenance: provenanceOf(line),
  });
  const first = candidates[0];
  const distinct = new Set(candidates.map((c) => c.values.join("|")));
  if (distinct.size > 1)
    return uncertain(
      candidates.flatMap((c) => c.values),
      "several_candidates",
      first.line,
    );
  if (first.values.length > 1) return uncertain(first.values, "ambiguous_day_month", first.line);
  const value = first.values[0];
  if (first.line.source === "ocr") {
    if ((first.line.confidence ?? 0) < HAYAT_LIMITS.minOcrConfidence)
      return uncertain([value], "low_ocr_confidence", first.line);
    if (kind === "identifier" && CONFUSABLE.test(value))
      return uncertain([value], "confusable_characters", first.line);
  }
  return { state: "read", value, provenance: provenanceOf(first.line) };
}

function demote(reading: FieldReading, reason: UncertaintyReason): FieldReading {
  if (reading.state !== "read") return reading;
  return {
    state: "uncertain",
    candidates: [reading.value],
    reason,
    provenance: reading.provenance,
  };
}

/** Whole-phrase containment on folded text; short codes match case-sensitively. */
function names(text: { folded: string; raw: string }, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (trimmed.length < 2) return false;
  if (trimmed.length <= 4 && /^[A-Z0-9]+$/.test(trimmed))
    return new RegExp(`(?<![A-Za-z0-9])${trimmed}(?![A-Za-z0-9])`).test(text.raw);
  const needle = foldForSearch(trimmed);
  if (needle.length < 4) return false;
  return ` ${text.folded} `.includes(` ${needle} `);
}

/** "Certified Protection Professional (CPP)" is also named without its bracket. */
const variants = (list: readonly string[]): string[] =>
  list.flatMap((n) => [n, n.replace(/\s*\([^)]*\)\s*/g, " ").trim()]).filter(Boolean);

function compare(
  text: { folded: string; raw: string },
  selected: readonly string[],
  others: readonly { label: string; names: readonly string[] }[],
): ComparisonResult {
  if (selected.length === 0) return { state: "not_applicable" };
  if (variants(selected).some((n) => names(text, n))) return { state: "match" };
  const ownFolded = new Set(variants(selected).map(foldForSearch));
  const foreign = others
    .flatMap((o) => o.names.map((name) => ({ name, label: o.label })))
    .filter((o) => !ownFolded.has(foldForSearch(o.name)))
    .sort((a, b) => b.name.length - a.name.length)
    .find((o) => variants([o.name]).some((v) => names(text, v)));
  return foreign ? { state: "different", found: foreign.label } : { state: "not_found" };
}

/** Titles printed before a name ("Mr.", "Shri", "Smt."). A title is not part
 *  of a name, so it is set aside on BOTH sides before comparing — otherwise a
 *  certificate that says "Shri Arjun Rao" would read as a different name from
 *  an account called "Arjun Rao". The name as printed is still shown as is. */
const HONORIFICS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "dr",
  "shri",
  "shree",
  "sri",
  "smt",
  "kumari",
  "kum",
  "km",
]);

function compareHolder(found: string | null, accountName: string | null): HolderNameComparison {
  if (!found) return { state: "not_found", nameOnDocument: null };
  const tokens = (v: string) =>
    new Set(
      foldForSearch(v)
        .split(" ")
        .filter((t) => t.length > 1 && !HONORIFICS.has(t)),
    );
  const account = accountName ? tokens(accountName) : new Set<string>();
  if (account.size < 2) return { state: "not_compared", nameOnDocument: found };
  const document = tokens(found);
  const [small, large] = document.size <= account.size ? [document, account] : [account, document];
  const shared = [...small].filter((t) => large.has(t)).length;
  // A name that reads differently is a name that reads differently. It is not
  // evidence of anything: transliteration, a married name and a dropped middle
  // name all land here, and the form says so.
  return {
    state: shared >= 2 && shared === small.size ? "match" : "differs",
    nameOnDocument: found,
  };
}

export function parseDocument(document: DocumentText, context: ReadingContext): DocumentReading {
  const lines = document.lines
    .slice(0, HAYAT_LIMITS.maxLines)
    .map((l) => ({ ...l, text: l.text.slice(0, HAYAT_LIMITS.maxLineLength) }));
  const found = collect(lines);

  let issuedOn = resolve(found.issued_on, "issued_on");
  let validUntil = resolve(found.valid_until, "valid_until");
  if (issuedOn.state === "read" && issuedOn.value > context.today)
    issuedOn = demote(issuedOn, "inconsistent_dates");
  if (
    issuedOn.state === "read" &&
    validUntil.state === "read" &&
    validUntil.value < issuedOn.value
  ) {
    issuedOn = demote(issuedOn, "inconsistent_dates");
    validUntil = demote(validUntil, "inconsistent_dates");
  }

  const raw = lines.map((l) => l.text).join("\n");
  const text = { raw, folded: foldForSearch(raw) };
  const holder = resolve(found.holder, "holder");

  return {
    fields: {
      identifier: resolve(found.identifier, "identifier"),
      issued_on: issuedOn,
      valid_until: validUntil,
      issuer_name: context.selected.issuerStatedOnDocument
        ? resolve(found.issuer_name, "issuer_name")
        : { state: "not_found" },
    },
    issuer: context.selected.issuerStatedOnDocument
      ? { state: "not_applicable" }
      : compare(
          text,
          context.selected.issuerNames,
          context.others.map((o) => ({ label: o.issuerLabel, names: o.issuerNames })),
        ),
    credentialType: compare(text, context.selected.names, context.others),
    holderName: compareHolder(holder.state === "read" ? holder.value : null, context.accountName),
    usedOcr: lines.some((l) => l.source === "ocr"),
    pageCount: document.pageCount,
    pagesRead: document.pagesRead,
  };
}
