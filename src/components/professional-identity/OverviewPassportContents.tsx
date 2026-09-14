// What is actually IN the Security Passport, shown on Överskt.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// The Passport column already carried the card and a row of status
// totals. The owner's correction was that totals describe the STATE of
// the Passport — how many are registered, documented, source-confirmed —
// and never say what is in it. A person should be able to look at this
// column and recognise their own merits, not read a scoreboard about
// them.
//
// ── THE READER IS THE CANONICAL ONE ────────────────────────────────────
//
// `listMyEntries` is the same server function the Passport information
// page and GeneralProfileClaims already read, for the same signed-in
// user. No new server function, no parallel query, no second
// transformation, no new table, and nothing static: every row here is a
// real `sp_claims` row.
//
// ── WHAT IS DELIBERATELY NOT SHOWN ─────────────────────────────────────
//
// Issuer, jurisdiction, dates, verifier name, verification method,
// evidence documents and reviewer decisions are all available on the
// entry and none of them is rendered. Överskt is a summary surface; the
// provenance belongs to the Passport, which is one link away. What IS
// shown is the title, the existing category, and the existing assertion
// level through AssertionChip — which is read-only by construction and
// distinguishes its levels on four channels before colour.
//
// ── NO INVENTED TAXONOMY ───────────────────────────────────────────────
//
// The category label is `claims.type.<claimType>` where that key already
// exists, and the raw type is never printed as a fallback — an entry
// whose type has no label simply shows its title. Nothing here names a
// category the product does not already have.

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMyEntries, type ClaimEntry } from "@/lib/security-passport/entries.functions";
import { AssertionChip } from "@/components/security-passport/AssertionChip";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { AssertionLevel } from "@/lib/security-passport/types";
import { L, Lp, type Lang } from "./copy";
import { PASSPORT } from "./home-copy";
import { Failed } from "./home-primitives";

/** How many rows before the rest becomes a count. Restrained on purpose:
 *  this is a preview beside a card, not the Passport's own list. */
const MAX_ROWS = 5;

type State =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; claims: readonly ClaimEntry[] };

export function OverviewPassportContents({
  lang,
  className = "",
}: {
  lang: Lang;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const load = useServerFn(listMyEntries);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void load()
      .then((entries) => {
        if (alive) setState({ status: "ready", claims: entries.claims });
      })
      .catch(() => {
        if (alive) setState({ status: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [load]);

  const heading = (
    <h2
      id="overview-passport-contents-heading"
      className="text-sm font-semibold tracking-tight text-foreground"
    >
      {L(PASSPORT.contentsHeading, lang)}
    </h2>
  );

  if (state.status === "loading") {
    return (
      <section className={className} data-overview-passport-contents="loading" aria-busy="true">
        {heading}
        {/* Same height as a populated preview, so the column does not jump
            when the read lands. */}
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-md bg-muted/50 motion-reduce:animate-none"
            />
          ))}
        </div>
      </section>
    );
  }

  if (state.status === "failed") {
    return (
      <section className={className} data-overview-passport-contents="failed">
        {heading}
        <div className="mt-3">
          <Failed message={L(PASSPORT.contentsUnreadable, lang)} />
        </div>
      </section>
    );
  }

  // Truthful empty state. The one canonical way in is the Open Passport
  // action this column already carries, so nothing is offered twice here.
  if (state.claims.length === 0) {
    return (
      <section className={className} data-overview-passport-contents="empty">
        {heading}
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {L(PASSPORT.contentsEmpty, lang)}
        </p>
      </section>
    );
  }

  const shown = state.claims.slice(0, MAX_ROWS);
  const remaining = state.claims.length - shown.length;

  return (
    <section className={className} data-overview-passport-contents="ready">
      {heading}
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {shown.map((claim) => {
          // Only a label the product already has. No raw claimType is
          // printed, because a database value is not a category name.
          const key = `claims.type.${claim.claimType}` as PassportCopyKey;
          const category = safeCopy(pt, key);
          return (
            <li
              key={claim.id}
              className="flex items-start justify-between gap-3 py-2.5"
              data-passport-content-row
              data-claim-type={claim.claimType}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{claim.title}</p>
                {category && <p className="mt-0.5 text-xs text-muted-foreground">{category}</p>}
              </div>
              <AssertionChip
                level={claim.assertionLevel as AssertionLevel}
                lifecycleState={claim.lifecycleState}
                size="sm"
                className="shrink-0"
              />
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <p className="mt-2 text-xs text-muted-foreground" data-passport-contents-more>
          {Lp(PASSPORT.contentsMore, lang, remaining)}
        </p>
      )}
    </section>
  );
}

/** A missing key must not print itself. `pt` returns the key when it has
 *  no entry, which would put `claims.type.something` on screen. */
function safeCopy(pt: (k: PassportCopyKey) => string, key: PassportCopyKey): string | null {
  const value = pt(key);
  return value === (key as string) ? null : value;
}
