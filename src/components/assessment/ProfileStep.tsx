// Pre-assessment "Current Situation" step (Public Career Assessment). This
// component collects and (for signed-in users) persists the Security Career
// Profile exactly as before, but its `currentStatus` choice is now lifted up
// to AssessmentApp via `onContinue`, which resolves it to an
// AssessmentProfileId (see src/lib/question-library/current-situation.ts)
// that determines which 8 profile questions are assembled alongside the 8
// Universal Core questions. This never affects scoring weights themselves —
// only which questions are asked.

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { SecurityCareerProfileForm } from "@/components/assessment/SecurityCareerProfileForm";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import {
  getMySecurityCareerProfile,
  upsertMySecurityCareerProfile,
} from "@/lib/security-career-profile/profile.functions";
import {
  EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  type CurrentStatus,
  type SecurityCareerProfileDraft,
} from "@/lib/security-career-profile/types";
import { CURRENT_SITUATION_OPTIONS } from "@/lib/question-library/current-situation";

export function ProfileStep({
  onContinue,
}: {
  onContinue: (currentStatus: CurrentStatus | null) => void;
}) {
  const { t } = useT();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<SecurityCareerProfileDraft>(
    EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  );
  const [saving, setSaving] = useState(false);
  const getProfile = useServerFn(getMySecurityCareerProfile);
  const upsertProfile = useServerFn(upsertMySecurityCareerProfile);

  useEffect(() => {
    let mounted = true;
    console.log("[SecurityCareerProfile][ProfileStep] mounted, checking session…");
    supabase.auth.getSession().then(({ data }) => {
      console.log("[SecurityCareerProfile][ProfileStep] getSession() resolved", {
        hasSession: !!data.session,
        userId: data.session?.user?.id,
      });
      if (mounted) setSignedIn(!!data.session);
    });
    // Mirrors the _authenticated layout guard's pattern (src/routes/_authenticated.tsx):
    // a one-shot getSession() check alone can resolve before a session finishes
    // settling/refreshing. Subscribing here means a late or corrected auth state
    // (e.g. after a token refresh) still flips `signedIn`, which re-triggers the
    // prefill effect below instead of getting stuck on a stale "signed out" read.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[SecurityCareerProfile][ProfileStep] onAuthStateChange", {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
      });
      if (mounted) setSignedIn(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    console.log("[SecurityCareerProfile][ProfileStep] signedIn effect fired", { signedIn });
    if (signedIn !== true) return;
    console.log("[SecurityCareerProfile][ProfileStep] calling getMySecurityCareerProfile()…");
    getProfile()
      .then((existing) => {
        console.log(
          "[SecurityCareerProfile][ProfileStep] getMySecurityCareerProfile() returned",
          existing,
        );
        if (!existing) {
          console.log(
            "[SecurityCareerProfile][ProfileStep] no saved profile row — leaving draft empty",
          );
          return;
        }
        const mapped: SecurityCareerProfileDraft = {
          currentStatus: existing.currentStatus,
          currentProfessionSlug: existing.currentProfessionSlug,
          currentProfessionOther: existing.currentProfessionOther,
          yearsOfExperience: existing.yearsOfExperience,
        };
        console.log(
          "[SecurityCareerProfile][ProfileStep] mapped into draft, calling setDraft()",
          mapped,
        );
        setDraft(mapped);
      })
      .catch((err) => {
        // Best-effort prefill only — an empty draft is a safe fallback.
        console.error("[SecurityCareerProfile] failed to load existing profile", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  useEffect(() => {
    console.log("[SecurityCareerProfile][ProfileStep] draft changed", draft);
  }, [draft]);

  const advance = async () => {
    if (signedIn) {
      setSaving(true);
      try {
        await upsertProfile({ data: draft });
      } catch (err) {
        // Non-blocking — the assessment must remain usable even if the
        // save fails (e.g. transient network issue).
        console.error("[SecurityCareerProfile] failed to save profile", err);
      } finally {
        setSaving(false);
      }
    }
    onContinue(draft.currentStatus);
  };

  return (
    <AssessmentLayout narrow>
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t("sca.scp.badge")}
      </span>
      <h1
        className="mt-6 text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("sca.scp.title")}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t("sca.scp.body")}</p>

      <div className="mt-10">
        <SecurityCareerProfileForm
          value={draft}
          onChange={setDraft}
          statusOptions={CURRENT_SITUATION_OPTIONS}
          statusBodyOverride={t("sca.cs.status.body")}
        />
      </div>

      <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
        <button
          type="button"
          onClick={() => onContinue(draft.currentStatus)}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("sca.scp.skip")}
        </button>
        <PrimaryButton onClick={advance} disabled={saving}>
          {t("sca.scp.continue")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </PrimaryButton>
      </div>
    </AssessmentLayout>
  );
}
