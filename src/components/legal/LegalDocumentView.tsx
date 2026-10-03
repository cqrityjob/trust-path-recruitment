import { Fragment, type ReactNode } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { useT } from "@/i18n/context";
import type { LegalBlock, LegalDocument } from "@/lib/legal/documents";

// ── A PUBLISHED LEGAL DOCUMENT ──────────────────────────────────────────
//
// Renders the owner's text exactly as written (src/lib/legal/documents.ts).
// The only markup is **bold**, e-mail addresses and the two public
// authorities' sites, which become links.
//
// A bracketed "[Ange …]" / "[Länk …]" / "[publiceringsdatum]" is a decision
// the owner has not made yet. It is shown as what it is, a visibly marked
// gap (data-legal-placeholder), and never filled in or hidden here: a gap
// that reads like a finished sentence would be worse than the gap.

const PLACEHOLDER = /(\[(?:Ange|ange|Länk|länk|publiceringsdatum)[^\]]*\])/;
const LINKS = /(\*\*[^*]+\*\*|[\w.+-]+@[\w-]+\.[\w.]+|www\.(?:imy|arn)\.se|www\.cqrityjob\.com)/;

function Gap({ text }: { text: string }) {
  return (
    <span
      data-legal-placeholder=""
      className="rounded border border-dashed border-amber-500/70 bg-amber-500/10 px-1 text-foreground"
    >
      {text}
    </span>
  );
}

function linked(text: string, keyBase: string): ReactNode[] {
  return text.split(LINKS).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {inline(part.slice(2, -2), key)}
        </strong>
      );
    }
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(part)) {
      return (
        <a key={key} href={`mailto:${part}`} className="text-accent underline underline-offset-4">
          {part}
        </a>
      );
    }
    if (/^www\./.test(part)) {
      return (
        <a
          key={key}
          href={`https://${part}`}
          className="text-accent underline underline-offset-4"
          rel="noopener noreferrer"
        >
          {part}
        </a>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function inline(text: string, keyBase = "t"): ReactNode[] {
  return text
    .split(PLACEHOLDER)
    .map((part, i) =>
      PLACEHOLDER.test(part) ? (
        <Gap key={`${keyBase}-g${i}`} text={part} />
      ) : (
        <Fragment key={`${keyBase}-f${i}`}>{linked(part, `${keyBase}-l${i}`)}</Fragment>
      ),
    );
}

function Block({ block, id }: { block: LegalBlock; id: string }) {
  switch (block.type) {
    case "p":
      return <p>{inline(block.text, id)}</p>;
    case "placeholder":
      return (
        <p>
          <Gap text={block.text} />
        </p>
      );
    case "list":
      return (
        <ul className="list-disc space-y-1.5 pl-5">
          {block.items.map((item, i) => (
            <li key={`${id}-${i}`}>{inline(item, `${id}-${i}`)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        // Scrolls inside itself at phone width; the page never does.
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {block.head.map((h, i) => (
                  <th
                    key={`${id}-h${i}`}
                    scope="col"
                    className="py-2 pr-4 font-semibold text-foreground"
                  >
                    {inline(h, `${id}-h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={`${id}-r${r}`} className="border-b border-border/60 align-top">
                  {row.map((cell, c) => (
                    <td key={`${id}-r${r}c${c}`} className="py-2 pr-4">
                      {inline(cell, `${id}-r${r}c${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function LegalDocumentView({
  doc,
  testId,
  final,
}: {
  doc: LegalDocument;
  testId: string;
  /** False while the document still has open points (src/lib/legal/status.ts). */
  final: boolean;
}) {
  const { t } = useT();
  const swedishOnly = t("legal.swedishOnly");
  return (
    <SiteLayout>
      <Container className="py-12 md:py-16">
        <article data-testid={testId} lang="sv" className="mx-auto max-w-3xl">
          <h1
            className="text-balance text-[2rem] font-semibold leading-tight tracking-tight text-foreground md:text-[2.5rem]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {doc.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {doc.dateLabel}: {PLACEHOLDER.test(doc.date) ? <Gap text={doc.date} /> : doc.date}
            {" · "}
            {t("legal.provider")}
          </p>
          {!final && (
            // A draft says so first, before a single clause is read.
            <p
              data-testid="legal-draft-banner"
              role="note"
              className="mt-4 rounded-md border border-amber-500/70 bg-amber-500/10 p-3 text-sm font-medium text-foreground"
            >
              {t("legal.draft")}
            </p>
          )}
          {swedishOnly && (
            <p lang="en" className="mt-3 text-sm text-muted-foreground">
              {swedishOnly}
            </p>
          )}

          <div className="mt-8 space-y-4 leading-relaxed text-muted-foreground">
            {doc.intro.map((b, i) => (
              <Block key={`intro-${i}`} block={b} id={`intro-${i}`} />
            ))}
          </div>

          <nav
            aria-label={t("legal.contents")}
            className="mt-8 rounded-md border border-border p-4"
          >
            <p className="text-sm font-semibold text-foreground">{t("legal.contents")}</p>
            <ol className="mt-2 grid gap-x-6 text-sm sm:grid-cols-2">
              {doc.sections.map((s, i) => (
                <li key={`toc-${i}`}>
                  <a
                    href={`#avsnitt-${i + 1}`}
                    className="inline-flex min-h-[44px] items-center text-accent underline-offset-4 hover:underline"
                  >
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map((s, i) => (
            <section key={`s-${i}`} id={`avsnitt-${i + 1}`} className="mt-10 scroll-mt-24">
              <h2
                className="text-[1.35rem] font-semibold leading-snug tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {s.heading}
              </h2>
              <div className="mt-3 space-y-4 leading-relaxed text-muted-foreground">
                {s.blocks.map((b, j) => (
                  <Block key={`s-${i}-${j}`} block={b} id={`s-${i}-${j}`} />
                ))}
              </div>
            </section>
          ))}
        </article>
      </Container>
    </SiteLayout>
  );
}
