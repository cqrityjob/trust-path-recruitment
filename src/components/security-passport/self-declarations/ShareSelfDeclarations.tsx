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
//   * The choice belongs to the link's CREATION. The link and the choice are
//     one database operation under one request key; there is no call that
//     gives an existing link a statement. The choice is never given to the
//     social image, the card download or any other export.
//   * The screen says only what it knows (passport-bridge.ts,
//     settleShareOperation): created, refused, or UNCONFIRMED. A lost answer
//     is never described as "nothing was shared"; the operation is kept and
//     the holder is offered a retry of that same operation.
//   * Whether the list further down could be refreshed is a separate fact
//     from whether the statement is shared, and is said separately.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { L, Lf, type Lang } from "@/components/professional-identity/copy";
import { SHARE, SHIELD, SHIELD_SUBJECT } from "@/lib/self-declarations/copy";
import {
  CLOSED_PASSPORT_DECLARATIONS,
  confirmedChoices,
  settleShareOperation,
  type CommittedShareOperation,
  type CreatedShare,
  type DisclosedStatement,
  type DisclosureChoice,
  type PassportDeclarationsView,
  type ShareOperation,
  type ShareOperationOutcome,
  type SharedSelection,
} from "@/lib/self-declarations/passport-bridge";
import { PASSPORT_SELF_DECLARATIONS_QUERY_KEY } from "./PassportSelfDeclarations";
import { RecipientSelfDeclarationList } from "./RecipientSelfDeclarations";

const SHARED_QUERY_KEY = ["self-declarations", "shared"] as const;

/**
 * The six server calls of the share step. The ROUTE binds them and passes
 * them in, as every Passport component's read and write is owned by its route.
 */
export type SelfDeclarationShareApi = {
  readonly load: () => Promise<PassportDeclarationsView>;
  readonly preview: (input: {
    data: { choices: DisclosureChoice[] };
  }) => Promise<readonly DisclosedStatement[]>;
  /** Create the link together with the choice: one operation, repeatable. */
  readonly create: (input: {
    data: {
      requestKey: string;
      link: {
        claimIds: string[];
        permittedFields: ("holder_name" | "identifier" | "profile_title")[];
        expiresDays: number;
        locale: "sv" | "en";
      };
      choices: DisclosureChoice[];
    };
  }) => Promise<CreatedShare>;
  /** What the database has committed for one operation. Read-only. */
  readonly committed: (input: { data: { requestKey: string } }) => Promise<CommittedShareOperation>;
  readonly list: () => Promise<readonly SharedSelection[]>;
  readonly stop: (input: { data: { selectionId: string } }) => Promise<readonly SharedSelection[]>;
};

/** What the share step knows about the holder's choice right now. */
export type ShareSelfDeclarationOffer = {
  /** A choice was put to the holder: the link is then created through the
   *  bridge, which seals the choice -- also when nothing is ticked. */
  readonly offered: boolean;
  /** False while something is ticked that the holder has not yet been shown
   *  as a recipient will see it. A link is not created in that state. */
  readonly ready: boolean;
  /** Ticked AND previewed. */
  readonly choices: readonly DisclosureChoice[];
};

export const NO_SELF_DECLARATION_OFFER: ShareSelfDeclarationOffer = {
  offered: false,
  ready: true,
  choices: [],
};

export function ShareSelfDeclarationChoices({
  lang,
  shareLang,
  api,
  onOfferChange,
}: {
  readonly api: SelfDeclarationShareApi;
  /** The holder's own language, for the controls. */
  readonly lang: Lang;
  /** The language the link is created in, for the preview. */
  readonly shareLang: Lang;
  readonly onOfferChange: (offer: ShareSelfDeclarationOffer) => void;
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
  const offered = shareable.length > 0;
  const ready = confirmed.length === chosen.length;
  useEffect(() => {
    onOfferChange({ offered, ready, choices: confirmed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offered, ready, confirmedKey, onOfferChange]);
  // Leaving the step withdraws the offer: nothing chosen here outlives it.
  useEffect(() => () => onOfferChange(NO_SELF_DECLARATION_OFFER), [onOfferChange]);

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

/** One creation operation as the screen holds it. */
export type ShareOperationView = {
  /** Kept, unchanged, until the operation is settled: the retry is this. */
  readonly operation: ShareOperation | null;
  readonly outcome: ShareOperationOutcome | null;
  readonly settling: boolean;
  /** The operation IS persisted, but the list below could not be re-read. */
  readonly listStale: boolean;
};

const IDLE_OPERATION: ShareOperationView = {
  operation: null,
  outcome: null,
  settling: false,
  listStale: false,
};

/**
 * Runs one creation operation and keeps it until it is settled.
 *
 * `run` starts an operation; while one is unconfirmed, `run` and `retry` both
 * repeat THAT operation -- same key, same link, same choices -- so nothing a
 * holder does in between can create a second link or widen what is shared.
 * Re-reading the list afterwards is a separate step whose failure never
 * changes the outcome.
 */
export function useShareOperation(api: SelfDeclarationShareApi): {
  readonly view: ShareOperationView;
  readonly run: (operation: ShareOperation) => Promise<ShareOperationOutcome>;
  readonly retry: () => Promise<ShareOperationOutcome | null>;
  readonly refreshList: () => Promise<void>;
  readonly clear: () => void;
} {
  const { create, committed, list } = api;
  const queryClient = useQueryClient();
  const [view, setView] = useState<ShareOperationView>(IDLE_OPERATION);
  const kept = useRef<ShareOperation | null>(null);
  const unconfirmed = useRef(false);

  const refreshList = useCallback(async () => {
    try {
      await queryClient.fetchQuery({
        queryKey: SHARED_QUERY_KEY,
        queryFn: async () => (await list()) ?? [],
        staleTime: 0,
        retry: false,
      });
      setView((current) => ({ ...current, listStale: false }));
    } catch {
      setView((current) => ({ ...current, listStale: true }));
    }
  }, [list, queryClient]);

  const settle = useCallback(
    async (operation: ShareOperation) => {
      kept.current = operation;
      setView((current) => ({ ...current, operation, settling: true }));
      const outcome = await settleShareOperation(
        {
          create: (op) =>
            create({
              data: {
                requestKey: op.requestKey,
                link: {
                  claimIds: [...op.link.claimIds],
                  permittedFields: [...op.link.permittedFields],
                  expiresDays: op.link.expiresDays,
                  locale: op.link.locale,
                },
                choices: [...op.choices],
              },
            }),
          committed: (requestKey) => committed({ data: { requestKey } }),
        },
        operation,
      );
      unconfirmed.current = outcome.kind === "unconfirmed";
      setView((current) => ({ ...current, operation, outcome, settling: false }));
      // Persistence is settled above. The list is a convenience re-read.
      if (outcome.kind === "created" && outcome.declarations > 0) await refreshList();
      return outcome;
    },
    [create, committed, refreshList],
  );

  const run = useCallback(
    (operation: ShareOperation) =>
      settle(unconfirmed.current && kept.current ? kept.current : operation),
    [settle],
  );
  const retry = useCallback(async () => (kept.current ? settle(kept.current) : null), [settle]);
  const clear = useCallback(() => {
    kept.current = null;
    unconfirmed.current = false;
    setView(IDLE_OPERATION);
  }, []);

  return { view, run, retry, refreshList, clear };
}

function refusalCopy(code: string) {
  if (code === "VSD_STALE_REVISION") return SHARE.refusedChanged;
  if (code.startsWith("VSD_")) return SHARE.refusedNotShareable;
  return SHARE.refused;
}

/**
 * What is KNOWN about the operation, in words that claim no more than that.
 * Rendered for every outcome that involves a statement or leaves a doubt.
 */
export function ShareSelfDeclarationResult({
  view,
  lang,
  onRetry,
  onRefreshList,
}: {
  readonly view: ShareOperationView;
  readonly lang: Lang;
  readonly onRetry: () => void;
  readonly onRefreshList: () => void;
}) {
  const { outcome, operation, settling, listStale } = view;
  if (!outcome || !operation) return null;
  const withStatements = operation.choices.length > 0;

  if (outcome.kind === "unconfirmed") {
    return (
      <div
        role="alert"
        className="mt-3 rounded-lg border border-destructive/40 p-3 text-sm leading-relaxed text-foreground"
        data-share-vsd-result="unconfirmed"
      >
        <p>{L(withStatements ? SHARE.unconfirmed : SHARE.unconfirmedPlain, lang)}</p>
        <button
          type="button"
          disabled={settling}
          onClick={onRetry}
          className="mt-3 inline-flex min-h-11 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
          data-share-vsd-retry
        >
          {L(settling ? SHARE.settling : SHARE.retry, lang)}
        </button>
      </div>
    );
  }
  if (outcome.kind === "refused") {
    // Without a statement the Passport's own error line says it; with one,
    // the holder must be told that the statement was not shared either.
    if (!withStatements) return null;
    return (
      <p
        role="alert"
        className="mt-3 rounded-lg border border-destructive/40 p-3 text-sm leading-relaxed text-destructive"
        data-share-vsd-result="refused"
      >
        {L(refusalCopy(outcome.code), lang)}
      </p>
    );
  }
  if (outcome.kind === "created_without") {
    if (!withStatements) return null;
    return (
      <p
        role="alert"
        className="mt-3 rounded-lg border border-destructive/40 p-3 text-sm leading-relaxed text-foreground"
        data-share-vsd-result="created_without"
      >
        {L(SHARE.createdWithout, lang)}
      </p>
    );
  }
  if (outcome.declarations === 0) return null;
  return (
    <div
      role="status"
      className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
      data-share-vsd-result="created"
      data-share-vsd-address={outcome.token === null ? "lost" : "shown"}
    >
      <p>{L(outcome.token === null ? SHARE.attachedAddressLost : SHARE.attached, lang)}</p>
      {listStale ? (
        <p className="mt-2 text-muted-foreground" data-share-vsd-list-stale>
          {L(SHARE.listStale, lang)}{" "}
          <button
            type="button"
            onClick={onRefreshList}
            className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            data-share-vsd-refresh
          >
            {L(SHARE.refreshList, lang)}
          </button>
        </p>
      ) : null}
    </div>
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
      {query.isError ? (
        // The rows above are the last ones read; what is shared is unchanged.
        <p className="mt-2 text-sm text-muted-foreground" data-shared-vsd-stale>
          {L(SHARE.listStale, lang)}{" "}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {L(SHARE.refreshList, lang)}
          </button>
        </p>
      ) : null}
    </section>
  );
}
