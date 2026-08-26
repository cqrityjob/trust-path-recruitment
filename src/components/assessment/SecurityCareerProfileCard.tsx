// The Security Career Profile on /my-career — a SUMMARY, with the editor
// behind it.
//
// ── WHY THIS IS NO LONGER A FORM ───────────────────────────────────────
//
// This card used to render the whole editor inline: six status options, a
// profession select and five experience options, all permanently expanded on
// the dashboard. Three costs, none of them cosmetic.
//
// The page became a form. /my-career is a career dashboard whose job is to
// answer "where do I stand" in seconds; opening it on a half-filled
// questionnaire answered a question nobody had asked.
//
// It broke the row. The three cards sit in one CSS grid, and grid items
// stretch to the tallest sibling. An editor roughly 900px tall therefore
// dragged the Passport and Jobs cards to 900px each, which is where the
// dashboard's large empty panels came from. They were never a spacing bug —
// they were this form, measured from two cards away.
//
// It buried Career Discovery. Everything below the first row started a full
// screen further down than it needed to.
//
// So the default state is what the holder has already told us, and editing is
// a deliberate act. The editor itself is unchanged — same form component, same
// draft shape, same save call — it simply now opens in a dialog.
//
// ── THE BOUNDARY STAYS ON THIS FILE ────────────────────────────────────
//
// `sca.scp.notPassport` is pinned here by scripts/passport-separation-check.ts
// and it is pinned for a reason: this card sits beside a Passport full of
// verified credentials, and self-reported career information must never
// borrow that credibility. It is stated on the summary — the surface a
// candidate actually reads — not only inside the dialog they may never open.

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SecurityCareerProfileForm } from "@/components/assessment/SecurityCareerProfileForm";
import { useT } from "@/i18n/context";
import { pickText } from "@/lib/assessment-content";
import {
  getMySecurityCareerProfile,
  upsertMySecurityCareerProfile,
} from "@/lib/security-career-profile/profile.functions";
import {
  currentStatusOptions,
  yearsOfExperienceOptions,
} from "@/lib/security-career-profile/options";
import {
  listCurrentProfessionOptions,
  type CurrentProfessionOption,
} from "@/lib/security-career-profile/profession-options";
import {
  EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  type SecurityCareerProfileDraft,
} from "@/lib/security-career-profile/types";

export function SecurityCareerProfileCard() {
  const { t, lang } = useT();
  const [draft, setDraft] = useState<SecurityCareerProfileDraft>(
    EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  );
  // The editor edits a COPY. A candidate who opens the dialog, changes three
  // answers and closes it without saving has changed nothing — the summary
  // behind them must not have silently followed along.
  const [editDraft, setEditDraft] = useState<SecurityCareerProfileDraft>(
    EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  );
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [professions, setProfessions] = useState<CurrentProfessionOption[]>([]);
  const getProfile = useServerFn(getMySecurityCareerProfile);
  const upsertProfile = useServerFn(upsertMySecurityCareerProfile);

  useEffect(() => {
    getProfile()
      .then((existing) => {
        if (existing) {
          setDraft({
            currentStatus: existing.currentStatus,
            currentProfessionSlug: existing.currentProfessionSlug,
            currentProfessionOther: existing.currentProfessionOther,
            yearsOfExperience: existing.yearsOfExperience,
          });
        }
      })
      .catch((err) => {
        // Best-effort prefill only — an empty draft is a safe fallback.
        console.error("[SecurityCareerProfile] failed to load existing profile", err);
      })
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only to turn a stored slug into a readable title. The dialog's form loads
  // the same catalogue for its picker; this is the summary's read of it, and
  // a failure degrades one line to the raw slug rather than the card.
  useEffect(() => {
    if (!draft.currentProfessionSlug || professions.length > 0) return;
    let alive = true;
    listCurrentProfessionOptions()
      .then((opts) => {
        if (alive) setProfessions(opts);
      })
      .catch(() => {
        /* summary falls back to the slug */
      });
    return () => {
      alive = false;
    };
  }, [draft.currentProfessionSlug, professions.length]);

  const save = async () => {
    setStatus("saving");
    try {
      await upsertProfile({ data: editDraft });
      setDraft(editDraft);
      setStatus("saved");
      setOpen(false);
    } catch (err) {
      console.error("[SecurityCareerProfile] failed to save profile", err);
      setStatus("error");
    }
  };

  function openEditor() {
    setEditDraft(draft);
    setStatus("idle");
    setOpen(true);
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">{t("sca.scp.loading")}</p>;
  }

  const statusLabel = draft.currentStatus
    ? pickText(currentStatusOptions.find((o) => o.id === draft.currentStatus)!.label, lang)
    : null;
  const professionLabel = draft.currentProfessionSlug
    ? ((p) => (p ? (lang === "sv" ? p.title_sv : p.title_en) : draft.currentProfessionSlug))(
        professions.find((p) => p.slug === draft.currentProfessionSlug),
      )
    : (draft.currentProfessionOther ?? null);
  const yearsLabel = draft.yearsOfExperience
    ? pickText(yearsOfExperienceOptions.find((o) => o.id === draft.yearsOfExperience)!.label, lang)
    : null;

  const rows: { label: string; value: string }[] = [
    ...(statusLabel ? [{ label: t("sca.scp.summary.status"), value: statusLabel }] : []),
    ...(professionLabel
      ? [{ label: t("sca.scp.summary.profession"), value: professionLabel }]
      : []),
    ...(yearsLabel ? [{ label: t("sca.scp.summary.experience"), value: yearsLabel }] : []),
  ];

  return (
    <div>
      {rows.length > 0 ? (
        // Stacked, not label-left/value-right. This is the narrowest column on
        // the dashboard and the values are free text — "Arbetar inom
        // säkerhetsbranschen" against a right-aligned edge wrapped mid-phrase
        // and read as ragged. Label above value survives any width.
        <dl className="space-y-3">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {r.label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-balance text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        // Nothing filled in yet. A statement of what the profile is for, not a
        // completion meter: there is no governed definition of a "complete"
        // career profile, so any percentage here would be invented.
        <p className="text-sm text-muted-foreground">{t("sca.scp.summary.empty")}</p>
      )}

      <button
        type="button"
        onClick={openEditor}
        className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md border border-input px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        {rows.length > 0 ? t("sca.scp.summary.edit") : t("sca.scp.summary.fillIn")}
      </button>

      {/* The Career Profile / Security Passport boundary — pinned to this file
          by scripts/passport-separation-check.ts.

          It is a FOOTNOTE, not the opening line. Leading with it meant the
          narrowest column on the dashboard spent five lines explaining what
          this card is not, before showing a single thing the candidate had
          actually told us. The claim is unchanged and still sits on the
          surface a candidate reads; it simply no longer outranks their own
          information. */}
      <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        {t("sca.scp.notPassport")}
      </p>

      {/* The editor, unchanged, in a dialog that is allowed to be tall. The
          shared DialogContent caps itself against the viewport and scrolls, so
          a long form is reachable on a phone instead of overflowing it. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("sca.scp.summary.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("sca.scp.notPassport")}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <SecurityCareerProfileForm
              value={editDraft}
              onChange={setEditDraft}
              statesBoundary={false}
            />
          </div>

          <DialogFooter className="mt-4 shrink-0 flex-row items-center gap-3 border-t border-border pt-4 sm:justify-end">
            {status === "error" && (
              <span className="mr-auto text-sm text-destructive">{t("sca.scp.errorNote")}</span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent"
            >
              {t("sca.scp.summary.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={status === "saving"}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "saving" ? t("sca.scp.saving") : t("sca.scp.save")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
