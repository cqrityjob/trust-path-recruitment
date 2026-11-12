// What a recipient is shown of a holder's self-declarations.
//
// Two things live here, and they render through ONE component so the holder's
// preview and the recipient's page cannot differ:
//
//   * RecipientSelfDeclarationList -- the section itself, given statements;
//   * RecipientSelfDeclarations    -- the recipient page's own read.
//
// ── WHO SEES ANYTHING ───────────────────────────────────────────────────
//
// A recipient who is SIGNED IN and whose browser holds the link's share
// session. The read is a separate, authenticated server call
// (readSharedSelfDeclarations, owned by the route and passed in as `read`);
// the anonymous Passport payload never carries a statement. A visitor who is not signed in triggers no call and sees the
// ordinary Passport -- with no placeholder, count or hint, because whether a
// statement accompanies a link is itself not for an anonymous reader.
//
// Nothing is rendered when there is nothing: no "none declared", no adverse
// wording, no empty heading.

import { useEffect, useState } from "react";
import { L, type Lang } from "@/components/professional-identity/copy";
import { useSignedIn } from "@/hooks/useSignedIn";
import { RECIPIENT } from "@/lib/self-declarations/copy";
import type { DisclosedStatement } from "@/lib/self-declarations/passport-bridge";
import { SelfDeclarationShieldList } from "./SelfDeclarationShield";

export function RecipientSelfDeclarationList({
  statements,
  lang,
  headingId = "recipient-self-declarations-heading",
}: {
  readonly statements: readonly DisclosedStatement[];
  readonly lang: Lang;
  readonly headingId?: string;
}) {
  if (statements.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-card p-4 sm:p-5"
      data-recipient-self-declarations
    >
      <h2 id={headingId} className="text-base font-semibold tracking-tight text-foreground">
        {L(RECIPIENT.heading, lang)}
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
        {L(RECIPIENT.lede, lang)}
      </p>
      <div className="mt-3">
        {/* Open by default: a recipient is here to read the exact statement. */}
        <SelfDeclarationShieldList statements={statements} lang={lang} defaultOpen />
      </div>
    </section>
  );
}

export function RecipientSelfDeclarations({
  navigationId,
  lang,
  read,
}: {
  readonly navigationId: string;
  readonly lang: Lang;
  readonly read: (input: {
    data: { navigationId: string };
  }) => Promise<readonly DisclosedStatement[]>;
}) {
  const signedIn = useSignedIn();
  const [statements, setStatements] = useState<readonly DisclosedStatement[]>([]);

  useEffect(() => {
    // Only a signed-in recipient asks. "Not known yet" is not signed in.
    if (signedIn !== true) {
      setStatements([]);
      return;
    }
    let alive = true;
    void read({ data: { navigationId } })
      .then((result) => {
        if (alive) setStatements(result);
      })
      .catch(() => {
        // A refusal renders exactly as a link that carries no statement.
        if (alive) setStatements([]);
      });
    return () => {
      alive = false;
    };
  }, [signedIn, read, navigationId]);

  return (
    <div className="mt-6 empty:hidden">
      <RecipientSelfDeclarationList statements={statements} lang={lang} />
    </div>
  );
}
