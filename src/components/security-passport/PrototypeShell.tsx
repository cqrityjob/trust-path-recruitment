// The review harness.
//
// Everything in this file is scaffolding for the owner review, not product:
// the banner, the screen switcher, the persona and jurisdiction selectors
// and the reset control exist so a reviewer can reach every state directly
// instead of trying to arrive at each one naturally.
//
// The language toggle deliberately drives the app's real global i18n
// context rather than a local flag, so the prototype exercises the actual
// language mechanism a production Passport would use — while every Passport
// string still resolves from the domain-local copy module.
//
// One dev route hosts all of this. No production route is created, the live
// /my-career experience is untouched, and /passport and /p/:token are not
// claimed — removal is a single file delete plus two package.json lines.

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  DISCLOSURE_FIXTURES,
  FIXTURE_EVALUATION_DATE,
  PERSONAS,
  VIEWING_JURISDICTIONS,
  personaById,
} from "@/lib/security-passport/fixtures/personas";
import { buildDisclosurePayload, shareStatus } from "@/lib/security-passport/disclosure";
import { buildPassportCard, type ShareOverlayState } from "@/lib/security-passport/card";
import { clearState, readState } from "@/lib/security-passport/prototype-state";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { CandidateHomeMock } from "./CandidateHomeMock";
import { CardStudio } from "./CardStudio";
import { CredentialFormFixture } from "./CredentialFormFixture";
import { CredentialHistoryFixture } from "./CredentialHistoryFixture";
import { LinkedInShareSection } from "./live/LinkedInShareSection";
import { SharePanel } from "./live/SharePanel";
import { RecipientCardFixture } from "./RecipientCardFixture";
import { EntryFixture } from "./EntryFixture";
import { MarketProfileFixture } from "./MarketProfileFixture";
import { FIXTURE_CREDENTIAL_TYPES } from "@/lib/security-passport/fixtures/credential-types";
import { buildSocialCard } from "@/lib/security-passport/social";
import { CredentialSymbolMatrix } from "./CredentialSymbolMatrix";
import { DisclosureHistory, PrivacyControls, type ShareHistoryEntry } from "./PrivacyControls";
import { DisclosurePackagePicker } from "./DisclosurePackagePicker";
import { ExperienceTimeline } from "./ExperienceTimeline";
import { Onboarding } from "./Onboarding";
import { PassportCard, PassportCardStateLabel } from "./PassportCard";
import { PassportOverview } from "./PassportOverview";
import { RecipientVerification } from "./RecipientVerification";
import { WelcomePurpose } from "./WelcomePurpose";

type ScreenId =
  | "home"
  | "marketProfiles"
  | "welcome"
  | "onboarding"
  | "overview"
  | "timeline"
  | "card"
  | "studio"
  | "symbols"
  | "credentialForm"
  | "credentialHistory"
  | "linkedin"
  | "recipientCard"
  | "entries"
  | "share"
  | "sharePanel"
  | "shareHistory"
  | "recipient"
  | "privacy";

const SCREENS: readonly { id: ScreenId; labelKey: PassportCopyKey }[] = [
  { id: "home", labelKey: "screen.home" },
  { id: "marketProfiles", labelKey: "screen.marketProfiles" },
  { id: "welcome", labelKey: "screen.welcome" },
  { id: "onboarding", labelKey: "screen.onboarding" },
  { id: "overview", labelKey: "screen.overview" },
  { id: "timeline", labelKey: "screen.timeline" },
  { id: "studio", labelKey: "screen.studio" },
  { id: "symbols", labelKey: "screen.symbols" },
  { id: "credentialForm", labelKey: "screen.credentialForm" },
  { id: "credentialHistory", labelKey: "screen.credentialHistory" },
  { id: "linkedin", labelKey: "screen.linkedin" },
  { id: "recipientCard", labelKey: "screen.recipientCard" },
  { id: "entries", labelKey: "screen.entries" },
  { id: "card", labelKey: "screen.card" },
  { id: "share", labelKey: "screen.share" },
  { id: "sharePanel", labelKey: "screen.sharePanel" },
  { id: "shareHistory", labelKey: "screen.shareHistory" },
  { id: "recipient", labelKey: "screen.recipient" },
  { id: "privacy", labelKey: "screen.privacy" },
];

function Selector<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="min-w-[10rem]">
      <label
        htmlFor={id}
        className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 block h-11 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PrototypeShell() {
  const { pt } = usePassportCopy();
  const { lang, setLang } = useT();

  const [screen, setScreen] = useState<ScreenId>("home");
  const [personaId, setPersonaId] = useState<string>("five-verified-years");
  const [viewingJurisdiction, setViewingJurisdiction] = useState<string>("SE");
  const [shareOverlay, setShareOverlay] = useState<ShareOverlayState>("none");
  const [disclosureFixtureId, setDisclosureFixtureId] = useState<string>("valid");
  const [revokedIds, setRevokedIds] = useState<readonly string[]>([]);
  const [hasProgress, setHasProgress] = useState(false);
  const [resetFlash, setResetFlash] = useState(false);

  const holder = personaById(personaId);

  useEffect(() => {
    setHasProgress(readState() !== null);
  }, [screen]);

  const card = useMemo(() => buildPassportCard(holder, FIXTURE_EVALUATION_DATE), [holder]);

  const historyEntries: readonly ShareHistoryEntry[] = useMemo(
    () =>
      DISCLOSURE_FIXTURES.map((f, i) => ({
        id: f.id,
        request: { ...f.request, revoked: f.request.revoked || revokedIds.includes(f.id) },
        openedCount: (i * 3) % 5,
      })),
    [revokedIds],
  );

  const recipientFixture =
    DISCLOSURE_FIXTURES.find((f) => f.id === disclosureFixtureId) ?? DISCLOSURE_FIXTURES[0];
  const recipientPayload = useMemo(
    () =>
      buildDisclosurePayload(
        personaById(recipientFixture.personaId),
        recipientFixture.request,
        FIXTURE_EVALUATION_DATE,
      ),
    [recipientFixture],
  );

  function onReset() {
    clearState();
    setRevokedIds([]);
    setHasProgress(false);
    setResetFlash(true);
    window.setTimeout(() => setResetFlash(false), 2000);
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Prototype status, on every screen, never dismissible. */}
      <div className="border-b border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40">
        <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3">
          <FlaskConical
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {pt("proto.banner.title")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              {pt("proto.banner.body")}
            </p>
          </div>
        </div>
      </div>

      {/* Harness controls. Chrome, not product. */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <Selector
              id="sp-screen"
              label={pt("proto.screen")}
              value={screen}
              options={SCREENS.map((s) => ({ value: s.id, label: pt(s.labelKey) }))}
              onChange={setScreen}
            />
            <Selector
              id="sp-persona"
              label={pt("proto.persona")}
              value={personaId}
              options={PERSONAS.map((p) => ({ value: p.id, label: `${p.displayName} — ${p.id}` }))}
              onChange={setPersonaId}
            />
            <Selector
              id="sp-lang"
              label={pt("proto.language")}
              value={lang === "en" ? "en" : "sv"}
              options={[
                { value: "sv", label: "Svenska" },
                { value: "en", label: "English" },
              ]}
              onChange={(v) => setLang(v as "sv" | "en")}
            />
            <Selector
              id="sp-jurisdiction"
              label={pt("jurisdiction.viewingFrom")}
              value={viewingJurisdiction}
              options={VIEWING_JURISDICTIONS.map((j) => ({ value: j, label: j }))}
              onChange={setViewingJurisdiction}
            />

            {screen === "card" ? (
              <Selector
                id="sp-overlay"
                label={pt("card.state")}
                value={shareOverlay}
                options={[
                  { value: "none", label: "—" },
                  { value: "share_expired", label: pt("card.shareExpired") },
                  { value: "share_revoked", label: pt("card.shareRevoked") },
                ]}
                onChange={setShareOverlay}
              />
            ) : null}

            {screen === "recipient" ? (
              <Selector
                id="sp-disclosure"
                label={pt("disclosure.package")}
                value={disclosureFixtureId}
                options={DISCLOSURE_FIXTURES.map((f) => ({
                  value: f.id,
                  label: `${f.id} — ${shareStatus(f.request, FIXTURE_EVALUATION_DATE)}`,
                }))}
                onChange={setDisclosureFixtureId}
              />
            ) : null}

            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              {pt("proto.reset")}
            </button>
          </div>

          <p
            role="status"
            className={cn(
              "mt-2 text-xs text-emerald-700 transition-opacity dark:text-emerald-400",
              resetFlash ? "opacity-100" : "opacity-0",
            )}
          >
            {pt("proto.resetDone")}
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        {screen === "home" ? (
          <CandidateHomeMock holder={holder} onOpenPassport={() => setScreen("welcome")} />
        ) : null}

        {screen === "welcome" ? (
          <WelcomePurpose hasProgress={hasProgress} onStart={() => setScreen("onboarding")} />
        ) : null}

        {screen === "onboarding" ? <Onboarding onFinish={() => setScreen("overview")} /> : null}

        {screen === "overview" ? (
          <PassportOverview
            holder={holder}
            evaluationOn={FIXTURE_EVALUATION_DATE}
            viewingJurisdiction={viewingJurisdiction}
            onContinue={() => setScreen("onboarding")}
            onOpenCard={() => setScreen("card")}
            onShare={() => setScreen("share")}
            onAddCredential={() => setScreen("credentialForm")}
            onResumeDraft={() => setScreen("credentialForm")}
            // The fixture personas all work in Sweden, whose pack is the one
            // that is ACTIVE — so "open" plus the Swedish catalogue is what the
            // governed call would return for them, not a shortcut around it.
            marketCredentials={{
              state: "open",
              options: FIXTURE_CREDENTIAL_TYPES.filter((t) =>
                ["VU1", "VU2", "OV", "SV"].includes(t.code),
              ).map((t) => ({
                code: t.code,
                nameSv: t.nameSv,
                nameEn: t.nameEn,
                symbolLabel: t.symbolLabel,
              })),
            }}
          />
        ) : null}

        {screen === "timeline" ? (
          <div className="mx-auto max-w-3xl">
            <ExperienceTimeline periods={holder.periods} evaluationOn={FIXTURE_EVALUATION_DATE} />
          </div>
        ) : null}

        {screen === "studio" ? <CardStudio personaId={personaId} /> : null}

        {screen === "symbols" ? <CredentialSymbolMatrix /> : null}

        {screen === "credentialForm" ? <CredentialFormFixture /> : null}

        {screen === "credentialHistory" ? <CredentialHistoryFixture /> : null}

        {screen === "recipientCard" ? <RecipientCardFixture /> : null}

        {screen === "entries" ? <EntryFixture /> : null}

        {screen === "marketProfiles" ? <MarketProfileFixture /> : null}

        {screen === "linkedin" ? (
          <div className="mx-auto w-full max-w-2xl">
            <LinkedInShareSection
              shareUrl={`https://cqrityjob.example/p/${personaId}`}
              model={buildSocialCard(holder, FIXTURE_EVALUATION_DATE, {
                privacyMode: "full_name",
                anonymousLabel: pt("share.anonymousLabel"),
                verifyUrl: `cqrityjob.example/p/fixture-${personaId}`,
              })}
              qrDataUrl={null}
            />
          </div>
        ) : null}

        {screen === "card" ? (
          <div className="mx-auto max-w-md space-y-4">
            <PassportCard card={card} shareOverlay={shareOverlay} />
            <PassportCardStateLabel card={card} shareOverlay={shareOverlay} />
          </div>
        ) : null}

        {screen === "share" ? (
          <DisclosurePackagePicker
            holder={holder}
            evaluationOn={FIXTURE_EVALUATION_DATE}
            viewingJurisdiction={viewingJurisdiction}
          />
        ) : null}

        {/* The live share panel, on fixture data. It is the same component
            /passport/share renders; only the URL is fictional, which is what
            makes the restructured layout reviewable without a session. */}
        {screen === "sharePanel" ? (
          <div className="mx-auto w-full max-w-2xl">
            <SharePanel
              shareUrl={`https://cqrityjob.example/p/${personaId}`}
              holder={holder}
              model={buildSocialCard(holder, FIXTURE_EVALUATION_DATE, {
                privacyMode: "full_name",
                anonymousLabel: pt("share.anonymousLabel"),
                verifyUrl: `cqrityjob.example/p/fixture-${personaId}`,
              })}
              qrDataUrl={null}
            />
          </div>
        ) : null}

        {screen === "shareHistory" ? (
          <div className="mx-auto max-w-3xl">
            <DisclosureHistory
              entries={historyEntries}
              viewedOn={FIXTURE_EVALUATION_DATE}
              onRevoke={(id) => setRevokedIds((cur) => (cur.includes(id) ? cur : [...cur, id]))}
            />
          </div>
        ) : null}

        {screen === "recipient" ? (
          <RecipientVerification
            payload={recipientPayload}
            viewingJurisdiction={viewingJurisdiction}
            card={buildPassportCard(
              personaById(recipientFixture.personaId),
              FIXTURE_EVALUATION_DATE,
            )}
            verifyUrl={`cqrityjob.example/p/${recipientFixture.id}`}
          />
        ) : null}

        {screen === "privacy" ? <PrivacyControls /> : null}
      </main>
    </div>
  );
}
