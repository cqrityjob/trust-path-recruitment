// The share step: optionally letting chosen self-declarations accompany ONE
// new Passport link.
//
// ── THE RULES THIS SCREEN KEEPS (scripts/self-declarations-check.ts) ─────
//
//   * Nothing is pre-selected. Every box starts unticked each time the step
//     is shown, and there is no "select all".
//   * Only a statement the database reports as shareable is offered. With
//     disclosure closed -- which is how production is until a disclosure
//     authorization is recorded -- this renders NOTHING: no heading, no
//     disabled box, no explanation inside the share flow.
//   * The holder sees exactly what a recipient will receive, from the
//     server's own preview, through the recipient's own component, BEFORE
//     the link exists. Only what was previewed can be attached
//     (confirmedChoices); a failed preview attaches nothing.
//   * The choice belongs to the link being created. It is never applied to
//     an existing link, and it is never given to the social image, the card
//     download or any other export: this component's state is passed to one
//     place, the attach call that follows the link's creation.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { L, Lf, type Lang } from "@/components/professional-identity/copy";
import { SHARE, SHIELD, SHIELD_SUBJECT } from "@/lib/self-declarations/copy";
import {
  CLOSED_PASSPORT_DECLARATIONS,
  confirmedChoices,
  type DisclosedStatement,
  type DisclosureChoice,
  type PassportDeclarationsView,
  type SharedSelection,
} from "@/lib/self-declarations/passport-bridge";
import { PASSPORT_SELF_DECLARATIONS_QUERY_KEY } from "./PassportSelfDeclarations";
import { RecipientSelfDeclarationList } from "./RecipientSelfDeclarations";

const SHARED_QUERY_KEY = ["self-declarations", "shared"] as const;

/**
 * The five server calls of the share step. The ROUTE binds them and passes
 * them in, as every Passport component's read and write is owned by its route.
 */
export type SelfDeclarationShareApi = {
  readonly load: () => Promise<PassportDeclarationsView>;
  readonly preview: (input: {
    data: { choices: DisclosureChoice[] };
  }) => Promise<readonly DisclosedStatement[]>;
  readonly attach: (input: {
    data: { disclosureId: string; choices: DisclosureChoice[] };
  }) => Promise<{ readonly attached: number }>;
  readonly list: () => Promise<readonly SharedSelection[]>;
  readonly stop: (input: { data: { selectionId: string } }) => Promise<readonly SharedSelection[]>;
};

export function ShareSelfDeclarationChoices({
  lang,
  shareLang,
  api,
  onConfirmedChange,
}: {
  readonly api: SelfDeclarationShareApi;
  /** The holder's own language, for the controls. */
  readonly lang: Lang;
  /** The language the link is created in, for the preview. */
  readonly shareLang: Lang;
  /** The choices that were ticked AND previewed. Empty until both are true. */
  readonly onConfirmedChange: (choices: readonly DisclosureChoice[]) => void;
}) {
  const { load, preview } = api;
  const query = useQuery({
    queryKey: PASSPORT_SELF_DECLARATIONS_QUERY_KEY,
    // An aborted or redirected call resolves to nothing: nothing is offered.
    queryFn: async () => (await load()) ?? CLOSED_PASSPORT_DECLARATIONS,
    retry: false,
  });
  // Never pre-selected.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [previewed, setPreviewed] = useState<readonly DisclosedStatement[]>([]);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  const shareable = useMemo(
    () => (query.data?.declarations ?? []).filter((d) => d.shareable),
    [query.data],
  );
  const chosen = useMemo(() => shareable.filter((d) => ticked.has(d.id)), [shareable, ticked]);
  const chosenKey = chosen.map((d) => `${d.id}:${d.revision}`).join(",");

  useEffect(() => {
    if (chosen.length === 0) {
      setPreviewed([]);
      setPreviewState("idle");
      return;
    }
    let alive = true;
    setPreviewState("loading");
    setPreviewed([]);
    void preview({
      data: { choices: chosen.map((d) => ({ declarationId: d.id, revision: d.revision })) },
    })
      .then((items) => {
        if (!alive) return;
        setPreviewed(items);
        setPreviewState("ready");
      })
      .catch(() => {
        if (!alive) return;
        setPreviewed([]);
        setPreviewState("failed");
      });
    return () => {
      alive = false;
    };
    // `chosenKey` is the identity of the choice; `chosen` is rebuilt per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey, preview]);

  const confirmed = useMemo(() => confirmedChoices(chosen, previewed), [chosen, previewed]);
  const confirmedKey = confirmed.map((c) => `${c.declarationId}:${c.revision}`).join(",");
  useEffect(() => {
    onConfirmedChange(confirmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedKey, onConfirmedChange]);

  // Closed, loading, failed or nothing shareable: the share flow is unchanged.
  if (shareable.length === 0) return null;

  return (
    <fieldset
      className="mt-6 min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
      data-share-self-declarations
    >
      <legend className="px-1 text-sm font-semibold text-foreground">
        {L(SHARE.heading, lang)}
      </legend>
      <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
        {L(SHARE.lede, lang)}
      </p>
      <ul className="mt-3 space-y-2">
        {shareable.map((declaration) => {
          const id = `share-vsd-${declaration.id}`;
          return (
            <li key={declaration.id}>
              <label
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
              >
                <input
                  id={id}
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0"
                  checked={ticked.has(declaration.id)}
                  onChange={(event) =>
                    setTicked((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(declaration.id);
                      else next.delete(declaration.id);
                      return next;
                    })
                  }
                  data-share-vsd-choice={declaration.statement.kind}
                />
                <span className="min-w-0">
                  <span className="block break-words font-medium">
                    {Lf(
                      SHARE.include,
                      lang,
                      `${L(SHIELD_SUBJECT[declaration.statement.kind], lang)} · ${L(SHIELD.selfDeclared, lang)}`,
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {Lf(SHIELD.about, lang, declaration.statement.asOfDate)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 max-w-[65ch] text-xs leading-relaxed text-muted-foreground">
        {L(SHARE.fixed, lang)} {L(SHARE.notElsewhere, lang)}
      </p>

      {chosen.length > 0 ? (
        <div className="mt-4" data-share-vsd-preview={previewState} aria-live="polite">
          <h3 className="text-sm font-semibold text-foreground">{L(SHARE.previewHeading, lang)}</h3>
          {previewState === "loading" ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              {L(SHARE.previewLoading, lang)}
            </p>
          ) : previewState === "failed" ? (
            <p role="alert" className="mt-2 text-sm leading-relaxed text-destructive">
              {L(SHARE.previewFailed, lang)}
            </p>
          ) : (
            <div className="mt-2">
              <RecipientSelfDeclarationList
                statements={previewed}
                lang={shareLang}
                headingId="share-vsd-preview-heading"
              />
            </div>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}

export type ShareSelfDeclarationOutcome = "attached" | "failed";

/**
 * Attach the confirmed choices to the link that was just created. Returns
 * what really happened, so the screen never says a statement accompanies a
 * link when it does not.
 */
export function useAttachSelfDeclarations(
  attach: SelfDeclarationShareApi["attach"],
): (
  disclosureId: string,
  choices: readonly DisclosureChoice[],
) => Promise<ShareSelfDeclarationOutcome> {
  const queryClient = useQueryClient();
  return useCallback(
    async (disclosureId, choices) => {
      try {
        await attach({ data: { disclosureId, choices: [...choices] } });
        await queryClient.invalidateQueries({ queryKey: SHARED_QUERY_KEY });
        return "attached";
      } catch {
        return "failed";
      }
    },
    [attach, queryClient],
  );
}

export function ShareSelfDeclarationResult({
  outcome,
  lang,
}: {
  readonly outcome: ShareSelfDeclarationOutcome | null;
  readonly lang: Lang;
}) {
  if (!outcome) return null;
  return (
    <p
      role={outcome === "failed" ? "alert" : "status"}
      className={`mt-3 rounded-lg border p-3 text-sm leading-relaxed ${
        outcome === "failed"
          ? "border-destructive/40 text-destructive"
          : "border-border bg-secondary/40 text-foreground"
      }`}
      data-share-vsd-result={outcome}
    >
      {L(outcome === "failed" ? SHARE.attachFailed : SHARE.attached, lang)}
    </p>
  );
}

/** The holder's statements on their links, each with a way to stop sharing. */
export function SharedSelfDeclarations({
  lang,
  api,
}: {
  readonly lang: Lang;
  readonly api: SelfDeclarationShareApi;
}) {
  const { list: load, stop } = api;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SHARED_QUERY_KEY,
    queryFn: async () => (await load()) ?? [],
    retry: false,
  });
  const [stopping, setStopping] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const rows: readonly SharedSelection[] = query.data ?? [];
  if (rows.length === 0) return null;

  async function onStop(id: string) {
    setStopping(id);
    setFailed(false);
    try {
      queryClient.setQueryData(SHARED_QUERY_KEY, await stop({ data: { selectionId: id } }));
    } catch {
      setFailed(true);
    } finally {
      setStopping(null);
    }
  }

  return (
    <section
      aria-labelledby="shared-self-declarations-heading"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      data-shared-self-declarations
    >
      <h2
        id="shared-self-declarations-heading"
        className="text-base font-semibold tracking-tight text-foreground"
      >
        {L(SHARE.listHeading, lang)}
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
        {L(SHARE.listLede, lang)}
      </p>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
            data-shared-vsd={row.disclosable ? "active" : "ended"}
          >
            <div className="min-w-0 text-sm">
              <p className="break-words font-medium text-foreground">
                {L(SHIELD_SUBJECT[row.kind], lang)} · {L(SHIELD.selfDeclared, lang)}
              </p>
              <p className="text-xs text-muted-foreground">
                {Lf(SHARE.linkCreated, lang, row.createdAt.slice(0, 10))}
                {" · "}
                {L(row.disclosable ? SHARE.active : SHARE.ended, lang)}
                {row.accessCount > 0 ? ` · ${Lf(SHARE.opened, lang, row.accessCount)}` : ""}
              </p>
            </div>
            {row.disclosable ? (
              <button
                type="button"
                disabled={stopping !== null}
                onClick={() => void onStop(row.id)}
                className="inline-flex min-h-11 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                data-shared-vsd-stop
              >
                {L(stopping === row.id ? SHARE.stopping : SHARE.stop, lang)}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {L(SHARE.stopFailed, lang)}
        </p>
      ) : null}
    </section>
  );
}
