// The Security Career Profile on /my-career — a summary with its canonical
// editor behind it. Passport may deep-link here to edit profession, but the
// Passport never receives a second profession writer.

import { useEffect, useRef, useState } from "react";
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

function readPassportProfessionIntent(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("edit") === "profession" && params.get("from") === "passport";
}

export function SecurityCareerProfileCard() {
  const { t, lang } = useT();
  const [draft, setDraft] = useState<SecurityCareerProfileDraft>(
    EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  );
  const [editDraft, setEditDraft] = useState<SecurityCareerProfileDraft>(
    EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  );
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [professions, setProfessions] = useState<CurrentProfessionOption[]>([]);
  const [passportEditIntent] = useState(readPassportProfessionIntent);
  const autoOpened = useRef(false);
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
        console.error("[SecurityCareerProfile] failed to load existing profile", err);
      })
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // A Passport edit intent opens the existing canonical editor exactly once,
  // only after the holder's saved profile has loaded. A normal /my-career visit
  // remains unchanged.
  useEffect(() => {
    if (!loaded || !passportEditIntent || autoOpened.current) return;
    autoOpened.current = true;
    setEditDraft(draft);
    setStatus("idle");
    setOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("career-profile")?.scrollIntoView({ block: "start" });
    });
  }, [draft, loaded, passportEditIntent]);

  // Once the dialog has mounted, put keyboard focus on the profession picker
  // when it exists. If current status does not expose profession yet, the
  // dialog still opens at the gating status question rather than inventing a
  // profession control.
  useEffect(() => {
    if (!open || !passportEditIntent) return;
    requestAnimationFrame(() => {
      const select = document.querySelector<HTMLSelectElement>('[role="dialog"] select');
      select?.focus();
    });
  }, [open, passportEditIntent]);

  useEffect(() => {
    if (status !== "saved" || !passportEditIntent) return;
    requestAnimationFrame(() => {
      document.getElementById("scp-return-passport")?.focus();
    });
  }, [status, passportEditIntent]);

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
    <div id="career-profile" className="scroll-mt-28">
      {rows.length > 0 ? (
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
        <p className="text-sm text-muted-foreground">{t("sca.scp.summary.empty")}</p>
      )}

      {passportEditIntent && status === "saved" ? (
        <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3">
          <p role="status" className="text-sm text-foreground">
            {lang === "sv"
              ? "Ditt yrke är sparat i din karriärprofil."
              : "Your profession is saved in your Career Profile."}
          </p>
          <a
            id="scp-return-passport"
            href="/passport/information"
            className="mt-3 inline-flex h-10 items-center rounded-md border border-input px-3.5 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {lang === "sv" ? "Tillbaka till Security Passport" : "Back to Security Passport"}
          </a>
        </div>
      ) : null}

      <button
        type="button"
        onClick={openEditor}
        className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md border border-input px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        {rows.length > 0 ? t("sca.scp.summary.edit") : t("sca.scp.summary.fillIn")}
      </button>

      <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        {t("sca.scp.notPassport")}
      </p>

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
