// Security Passport — add a supported credential, live.
//
// The one place a VU1, VU2, ordningsvaktsförordnande or skyddsvakts-
// förordnande enters the Passport. The form itself is a pure component;
// this route gives it the real taxonomy (from sp_credential_types via the
// server), the holder's saved drafts, and the real write path.
//
// ── DRAFTS ARE OFFERED, NEVER FORCED ───────────────────────────────────
//
// Arriving with unfinished drafts shows them first, each resumable or
// discardable, with a fresh form below. Arriving with ?draft=<id> resumes
// that draft directly. Nothing is deleted without a confirmation, and
// nothing is resumed silently.
//
// ── JURISDICTION FIRST ─────────────────────────────────────────────────
//
// The country is asked before the credential, and the credential list is
// fetched FOR that country. Previously this route loaded
// `listCredentialTypes` — every active credential in the database, unfiltered
// — and handed the whole list to the form, which then asked for a country
// underneath it. With Sweden the only active market that list was the Swedish
// one, so a holder in the UK was offered VU1, VU2, Ordningsvakt and
// Skyddsvakt and could file any of them under any country the select offered.
//
// Now: pick a market, fetch that market's catalogue, render the form. An
// unsupported or unreviewed market renders its own state and no credential
// list at all — never Sweden's as a fallback.
//
// ── WHERE THE FLOW GOES NEXT ───────────────────────────────────────────
//
// Adding the entry navigates to its detail page, where documentation
// upload and submission for review already live. The form has already said
// in words that documentation is not approval; the detail page is where
// both actually happen.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { CredentialDraft, CredentialType } from "@/lib/security-passport/credentials";
import type {
  CredentialCatalogue,
  JurisdictionChoice,
} from "@/lib/security-passport/credentials.functions";
import {
  discardCredentialDraft,
  listCredentialCatalogue,
  listJurisdictionChoices,
  listMyCredentialDrafts,
  saveCredential,
  type DraftCredential,
} from "@/lib/security-passport/credentials.functions";
import { CredentialForm } from "@/components/security-passport/CredentialForm";
import {
  JurisdictionPicker,
  type MarketChoice,
} from "@/components/security-passport/JurisdictionPicker";
import { CredentialSymbol } from "@/components/security-passport/CredentialSymbol";

interface NewCredentialSearch {
  readonly draft?: string;
  readonly code?: string;
}

export const Route = createFileRoute("/_authenticated/passport/credentials/new")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): NewCredentialSearch => ({
    draft: typeof search.draft === "string" ? search.draft : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  component: NewCredentialRoute,
});

function NewCredentialRoute() {
  const { pt } = usePassportCopy();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const loadCatalogue = useServerFn(listCredentialCatalogue);
  const loadJurisdictions = useServerFn(listJurisdictionChoices);
  const loadDrafts = useServerFn(listMyCredentialDrafts);
  const doSave = useServerFn(saveCredential);
  const doDiscard = useServerFn(discardCredentialDraft);

  const [jurisdictions, setJurisdictions] = useState<readonly JurisdictionChoice[]>([]);
  const [market, setMarket] = useState<MarketChoice | null>(null);
  const [catalogue, setCatalogue] = useState<CredentialCatalogue | null>(null);
  const [catalogueBusy, setCatalogueBusy] = useState(false);
  const [drafts, setDrafts] = useState<readonly DraftCredential[]>([]);
  const [claimId, setClaimId] = useState<string | null>(search.draft ?? null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [j, d] = await Promise.all([
        loadJurisdictions({ data: undefined }),
        loadDrafts({ data: undefined }),
      ]);
      setJurisdictions(j);
      setDrafts(d);
    } catch (err) {
      console.error("[passport] credential form load failed", err);
      setError(pt("common.error"));
    } finally {
      setLoaded(true);
    }
  }, [loadJurisdictions, loadDrafts, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The catalogue is fetched FOR the chosen market, every time it changes.
  //
  // Deliberately a round trip rather than a client-side filter over one big
  // list: the list is what must not exist. If the browser never receives the
  // Swedish catalogue while the holder is recording a British credential,
  // there is nothing for a filter bug to leak.
  useEffect(() => {
    if (!market) {
      setCatalogue(null);
      return;
    }
    let cancelled = false;
    setCatalogueBusy(true);
    void (async () => {
      try {
        const c = await loadCatalogue({
          data: {
            jurisdictionCode: market.jurisdictionCode,
            subJurisdictionCode: market.subJurisdictionCode,
          },
        });
        if (!cancelled) setCatalogue(c);
      } catch (err) {
        console.error("[passport] catalogue load failed", err);
        if (!cancelled) {
          setCatalogue(null);
          setError(pt("common.error"));
        }
      } finally {
        if (!cancelled) setCatalogueBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [market, loadCatalogue, pt]);

  const resumed = useMemo(
    () => (claimId ? (drafts.find((d) => d.id === claimId) ?? null) : null),
    [drafts, claimId],
  );

  // Resuming a draft resumes its market too. A draft saved against Dubai must
  // come back as a Dubai draft, not as whatever the picker happens to be
  // showing — otherwise resuming silently refiles somebody's credential.
  useEffect(() => {
    if (!resumed) return;
    if (!resumed.jurisdictionCode) return;
    setMarket((current) =>
      current &&
      current.jurisdictionCode === resumed.jurisdictionCode &&
      current.subJurisdictionCode === resumed.subJurisdictionCode
        ? current
        : {
            jurisdictionCode: resumed.jurisdictionCode,
            subJurisdictionCode: resumed.subJurisdictionCode,
          },
    );
  }, [resumed]);

  async function submit(draft: CredentialDraft, activate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const saved = await doSave({
        data: {
          claimId,
          credentialCode: draft.credentialCode,
          title: draft.title,
          issuerName: draft.issuerName,
          jurisdictionCode: draft.jurisdictionCode,
          subJurisdictionCode: draft.subJurisdictionCode,
          issuedOn: draft.issuedOn,
          validFrom: draft.validFrom,
          validUntil: draft.validUntil,
          credentialReference: draft.credentialReference,
          holderNote: draft.holderNote,
          // Was omitted entirely. `draftInput` requires it, so every save from
          // this route failed Zod validation before it reached the database —
          // including every Swedish one. Found while rewiring this call.
          authorisationScope: draft.authorisationScope,
          activate,
        },
      });
      if (activate) {
        void navigate({
          to: "/passport/entry/$kind/$entryId",
          params: { kind: "claim", entryId: saved.id },
        });
        return;
      }
      setClaimId(saved.id);
      setSavedAt(saved.updatedAt);
    } catch (err) {
      console.error("[passport] credential save failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function discard(id: string) {
    if (!window.confirm(pt("cred.discardConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await doDiscard({ data: { claimId: id } });
      if (claimId === id) {
        setClaimId(null);
        setSavedAt(null);
      }
      await refresh();
    } catch (err) {
      console.error("[passport] draft discard failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <button
        type="button"
        onClick={() => void navigate({ to: "/passport" })}
        className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {pt("claim.back")}
      </button>

      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("cred.add.title")}
        </h2>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* ── Unfinished drafts, offered before a fresh form ──────────── */}
      {drafts.length > 0 && !resumed ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {pt("cred.drafts.title")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{pt("cred.drafts.lead")}</p>
          <ul className="mt-3 space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <CredentialSymbol
                    code={d.credentialCode}
                    state="draft"
                    name={d.title || pt("cred.drafts.untitled")}
                    size={36}
                    className="shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {d.title || pt("cred.drafts.untitled")}
                    </span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {pt("cred.drafts.updated")} {d.updatedAt.slice(0, 10)}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setClaimId(d.id);
                      setSavedAt(null);
                    }}
                    className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {pt("cred.action.resume")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void discard(d.id)}
                    className="inline-flex h-11 items-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {pt("cred.action.discard")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">{pt("cred.new.resumeOr")}</p>
        </section>
      ) : null}

      {/* ── Step 1 and 2: where does this credential come from ─────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <JurisdictionPicker
          jurisdictions={jurisdictions}
          value={market}
          resolvedState={catalogue?.supportState ?? null}
          busy={busy || catalogueBusy}
          onChange={setMarket}
        />
      </section>

      {/* ── Step 3 and 4: the catalogue for THAT market, and nothing
             else. There is deliberately no branch here that renders a
             credential list without a supported market above it. ─────── */}
      {market && catalogueBusy ? (
        <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>
      ) : catalogue && catalogue.supportState === "supported" ? (
        catalogue.credentials.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {pt("cred.market.noCredentials")}
          </p>
        ) : (
          <section className="rounded-xl border border-border bg-card p-5">
            <CredentialForm
              // Remount on a market change as well as on resume: the form
              // stamps the market onto its draft at construction, so keeping
              // the old instance alive would leave a Swedish jurisdiction on a
              // British credential.
              key={`${catalogue.marketPackCode}:${resumed?.id ?? "new"}`}
              types={catalogue.credentials}
              market={{
                marketPackCode: catalogue.marketPackCode ?? "",
                jurisdictionCode: market?.jurisdictionCode ?? "",
                subJurisdictionCode: market?.subJurisdictionCode ?? null,
                nameSv: catalogue.nameSv ?? "",
                nameEn: catalogue.nameEn ?? "",
              }}
              initial={resumed ? { ...toFormDraft(resumed), id: resumed.id } : null}
              preselectCode={search.code ?? null}
              busy={busy}
              serverError={null}
              savedAt={savedAt}
              onSaveDraft={(d) => void submit(d, false)}
              onActivate={(d) => void submit(d, true)}
              onDiscard={resumed ? () => void discard(resumed.id) : undefined}
              onCancel={() => void navigate({ to: "/passport" })}
              onChangeMarket={() => setMarket(null)}
            />
          </section>
        )
      ) : null}
    </div>
  );
}

/** A stored draft row, as the form's value shape. */
function toFormDraft(d: DraftCredential): CredentialDraft {
  return {
    credentialCode: d.credentialCode,
    title: d.title,
    issuerName: d.issuerName,
    jurisdictionCode: d.jurisdictionCode,
    subJurisdictionCode: d.subJurisdictionCode,
    issuedOn: d.issuedOn,
    validFrom: d.validFrom,
    validUntil: d.validUntil,
    credentialReference: d.credentialReference,
    holderNote: d.holderNote,
    authorisationScope: d.authorisationScope,
  };
}
