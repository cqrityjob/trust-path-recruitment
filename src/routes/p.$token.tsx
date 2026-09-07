// Security Passport — the public recipient page.
//
// The only anonymous surface in the product, and the only page a stranger
// ever sees. Everything about it is shaped by two facts:
//
//   1. THE PAGE IS THE RECORD. An image can be cached, forwarded and kept
//      long after a credential lapses or a share is revoked. This page is
//      re-read on every open, so it is the thing that can be trusted — and
//      it says so, plainly, rather than assuming the reader knows.
//
//   2. IT MUST TELL A STRANGER NOTHING THEY DO NOT ALREADY HOLD. Revoked,
//      expired, never-existed and rate-limited all render identically, from
//      one `status: "unavailable"` payload. Any difference between them
//      would be an oracle: a way to learn that a token was once real, or
//      that a guess is getting warmer.
//
// ── WHAT THIS FILE IS, AND WHAT IT IS NOT ──────────────────────────────
//
// It is the anonymous TRANSPORT: the head, the fail-closed read, and the
// three states that read can be in. It is NOT the recipient experience —
// that lives in `RecipientPassportView`, because the holder must be able to
// see exactly what this page will show before they send the link, and the
// only way to guarantee that is for the preview and this page to be the same
// component reading the same model built by the same database function.
//
// ── noindex, AND WHY THE PREVIEW IS GENERIC ────────────────────────────
//
// A share link is addressed to one recipient. It is not published, so it is
// not indexed. The Open Graph metadata is deliberately BRANDED AND GENERIC:
// a per-holder preview image would have to live at a public, crawler-
// reachable URL, which means a personalised artifact that survives
// revocation — the exact failure this page exists to avoid. The holder gets
// their personalised image from the sharing centre, to attach deliberately.
//
// `noindex, nofollow` stays. A share link is private correspondence, and
// keeping it out of search indexes is a governance decision, not a tuning
// knob to trade away for a nicer preview.

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getPublicDisclosureFromCookie } from "@/lib/security-passport/public-disclosure.functions";
import type { RecipientPayload } from "@/lib/security-passport/packages";
import { formatWorkLocation } from "@/lib/security-passport/format";
import { buildRecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { RecipientPassportView } from "@/components/security-passport/live/RecipientPassportView";
import { CredentialVerificationPage } from "@/components/security-passport/live/CredentialVerificationPage";
import { PassportLangProvider } from "@/lib/security-passport/use-passport-copy";
import { publicShareOrigin } from "@/lib/security-passport/public-origin";

export const Route = createFileRoute("/p/$token")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: "Security Passport — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
      // Branded and generic on purpose — see the note above. A crawler that
      // follows this link learns what CQrityjob is, and nothing about the
      // person who shared it.
      { property: "og:title", content: "Security Passport — CQrityjob" },
      {
        property: "og:description",
        content:
          "Verifierade yrkesuppgifter, delade av innehavaren. / Verified professional records, shared by the holder.",
      },
      { property: "og:type", content: "website" },
      // The canonical address of THIS page, and the one piece of the Open
      // Graph set that was missing. It is built on the configured public
      // origin rather than the request's own host, so a preview deployment
      // cannot publish its own ephemeral hostname into a shared post even
      // when the page is reached through one.
      { property: "og:url", content: `${publicShareOrigin()}/p/${params.token}` },
      // A real branded card rather than no image at all — but GENERIC, and
      // identical for every share. A crawler caches what it fetches and
      // cannot be told to forget it, so a personalised preview would be a
      // public artifact outliving the share that produced it. Because this
      // one carries nothing about the holder, possessing it reveals not even
      // that a particular share exists, and revocation costs it nothing.
      // Absolute: crawlers resolve og:image poorly or not at all when it is
      // relative. Same canonical origin the sitemap route already uses.
      { property: "og:image", content: `${publicShareOrigin()}/og-security-passport.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "CQrityjob Security Passport",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecipientRoute,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function RecipientRoute() {
  const { pt, lang: readerLang } = usePassportCopy();
  // The param here is a NAVIGATION ID, never a token.
  //
  // src/server.ts answers `/p/<token>` with a 302 to `/p/<navigationId>` and
  // puts the token in an HttpOnly cookie named after that id, before any
  // document exists — because the host injects an analytics script that reports
  // window.location.href on every full page load, and the token is a bearer
  // capability. By the time this component runs, the address bar holds a
  // one-way hash that authorises nothing.
  //
  // It IS read, and must be: it names which share this tab is on. Two open
  // shares hold two differently-named cookies, and without the id the server
  // could not tell them apart — which is exactly the substitution bug the
  // single-cookie version had. See share-transport.ts.
  const { token: navigationId } = useParams({ from: "/p/$token" });
  const read = useServerFn(getPublicDisclosureFromCookie);

  const [payload, setPayload] = useState<RecipientPayload | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>("");

  // The payload is interpreted ONCE. The card, the detail list and every
  // other surface read this same model, so none of them can form a different
  // opinion about whether a credential is still current.
  const presentation = useMemo(
    () => (payload?.status === "active" ? buildRecipientPresentation(payload, today()) : null),
    [payload],
  );

  // The share's language when the holder chose one, the reader's otherwise.
  // Never inferred from the holder's jurisdiction: a Swedish guard sending a
  // licence to a London agency is exactly the case this exists for.
  const lang = presentation?.locale ?? readerLang;

  useEffect(() => {
    let alive = true;
    void read({ data: { navigationId } })
      .then((result) => {
        if (!alive) return;
        setPayload(result);
        setCheckedAt(new Date().toISOString().slice(0, 16).replace("T", " "));
      })
      .catch(() => {
        // A network or server failure must land in the SAME place as an
        // invalid token. Distinguishing them would leak the distinction.
        if (alive) setPayload({ status: "unavailable" });
      });
    return () => {
      alive = false;
    };
  }, [read, navigationId]);

  if (!payload) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{pt("rec.checking")}</p>
      </main>
    );
  }

  // Revoked, expired, never-existed, throttled and "the server did not
  // answer" all arrive here, and all render identically. The copy is written
  // for the ordinary case — a link that has done its job — and says what a
  // reader can actually DO about it, which is ask the person who sent it.
  if (payload.status === "unavailable") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("rec.brand")}
        </p>
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <ShieldAlert aria-hidden="true" className="h-5 w-5" />
            {pt("rec.unavailableTitle")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {pt("rec.unavailableBody")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {pt("rec.unavailableNext")}
          </p>
          <a
            href="/#passport"
            className="mt-4 inline-flex h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("rec.ctaAction")}
          </a>
        </div>
      </main>
    );
  }

  // `presentation` is non-null whenever the payload is active; the guard
  // keeps TypeScript honest without a cast.
  if (!presentation) return null;

  // The canonical site address, NOT this page's own URL.
  //
  // It used to be `window.location.href`, which was the share link itself —
  // and that link is a bearer capability, printed onto a card a recipient can
  // screenshot and forward. Since the token moved out of the URL it would now
  // read `/p/view`, which is worse than useless: it grants nothing AND leads a
  // reader who tries it to "this link is not available".
  //
  // So it names where the record lives. A recipient returns through the link
  // they were sent — the page is re-read on every open, which is the property
  // the footer is claiming — and nothing printed here is a credential.
  const shareUrl = publicShareOrigin();

  // A single-credential share is a different object from a Passport, so it
  // gets its own presentation rather than the Passport page with one row.
  //
  // Rendered through its own component so every word on it — including the
  // two sentences this file writes — resolves INSIDE the language provider.
  // Reading them from the route's own `pt`, which is bound before the
  // provider exists, is how a page ends up half in the reader's language and
  // half in the recipient's.
  if (presentation.focus === "credential" && presentation.credentials.length === 1) {
    return (
      <PassportLangProvider lang={lang}>
        <CredentialShare presentation={presentation} checkedAt={checkedAt} verifyUrl={shareUrl} />
      </PassportLangProvider>
    );
  }

  return (
    <main className="px-4 py-8 sm:py-10">
      <RecipientPassportView
        presentation={presentation}
        lang={lang}
        checkedAt={checkedAt}
        verifyUrl={shareUrl}
      />
    </main>
  );
}

function CredentialShare({
  presentation,
  checkedAt,
  verifyUrl,
}: {
  presentation: NonNullable<ReturnType<typeof buildRecipientPresentation>>;
  checkedAt: string;
  verifyUrl: string;
}) {
  const { pt, lang } = usePassportCopy();
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {pt("rec.brand")}
      </p>
      <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        {pt("rec.authoritative")}
      </p>
      <div className="mt-6">
        <CredentialVerificationPage
          credential={presentation.credentials[0]}
          holderLabel={presentation.holderLabel ?? pt("rec.anonymousHolder")}
          jurisdiction={formatWorkLocation(
            presentation.jurisdiction,
            presentation.subJurisdiction,
            lang,
          )}
          verifyUrl={verifyUrl}
        />
      </div>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        {pt("rec.checkedAt")}: {checkedAt}
      </p>
    </main>
  );
}
