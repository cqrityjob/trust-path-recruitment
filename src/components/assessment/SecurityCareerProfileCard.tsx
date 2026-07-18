// Editable Security Career Profile card for /my-career. Always behind
// _authenticated, so no anonymous branch is needed here (unlike
// ProfileStep, which also renders for anonymous assessment-takers).

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SecurityCareerProfileForm } from "@/components/assessment/SecurityCareerProfileForm";
import { useT } from "@/i18n/context";
import {
  getMySecurityCareerProfile,
  upsertMySecurityCareerProfile,
} from "@/lib/security-career-profile/profile.functions";
import {
  EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  type SecurityCareerProfileDraft,
} from "@/lib/security-career-profile/types";

export function SecurityCareerProfileCard() {
  const { t } = useT();
  const [draft, setDraft] = useState<SecurityCareerProfileDraft>(
    EMPTY_SECURITY_CAREER_PROFILE_DRAFT,
  );
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
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

  const save = async () => {
    setStatus("saving");
    try {
      await upsertProfile({ data: draft });
      setStatus("saved");
    } catch (err) {
      console.error("[SecurityCareerProfile] failed to save profile", err);
      setStatus("error");
    }
  };

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">{t("sca.scp.loading")}</p>;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">{t("sca.scp.card.body")}</p>
      <div className="mt-5">
        <SecurityCareerProfileForm value={draft} onChange={setDraft} />
      </div>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? t("sca.scp.saving") : t("sca.scp.save")}
        </button>
        {status === "saved" && (
          <span className="text-sm text-muted-foreground">{t("sca.scp.savedNote")}</span>
        )}
        {status === "error" && (
          <span className="text-sm text-destructive">{t("sca.scp.errorNote")}</span>
        )}
      </div>
    </div>
  );
}
