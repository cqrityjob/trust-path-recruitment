import { uploadEvidence } from "@/lib/security-passport/evidence.functions";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { InternationalCredentialForm } from "@/components/security-passport/InternationalCredentialForm";
import {
  getInternationalPassportMetadata,
  saveInternationalCredential,
  readApprovedCredentialDraft,
  type InternationalCredentialInput,
  type InternationalPassportMetadata,
} from "@/lib/security-passport/international.functions";
import {
  assessCredentialEvidence,
  assessSavedCredential,
  getHayatAvailability,
} from "@/lib/security-passport/hayat/hayat.functions";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export const Route = createFileRoute("/_authenticated/passport/credentials/new")({
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): { draft?: string; code?: string; country?: string } => ({
    draft: typeof search.draft === "string" ? search.draft : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
    // A starting filter only (the India setup passes "IN"). Two capital letters
    // or nothing: it never becomes a credential's territory.
    country:
      typeof search.country === "string" && /^[A-Z]{2}$/.test(search.country)
        ? search.country
        : undefined,
  }),
  component: NewCredentialRoute,
});
function NewCredentialRoute() {
  const { pt } = usePassportCopy();
  const search = Route.useSearch();
  const load = useServerFn(getInternationalPassportMetadata);
  const save = useServerFn(saveInternationalCredential);
  const upload = useServerFn(uploadEvidence);
  const readDraft = useServerFn(readApprovedCredentialDraft);
  const assess = useServerFn(assessCredentialEvidence);
  const hayatAvailability = useServerFn(getHayatAvailability);
  const assessSaved = useServerFn(assessSavedCredential);
  const [draft, setDraft] = useState<InternationalCredentialInput | undefined>();
  const [metadata, setMetadata] = useState<InternationalPassportMetadata | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      load(),
      search.draft ? readDraft({ data: { id: search.draft } }) : Promise.resolve(null),
    ])
      .then(([value, initial]) => {
        if (!active) return;
        if (search.draft && !initial) {
          setFailed(true);
          return;
        }
        setDraft(initial ?? undefined);
        setMetadata(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [load, readDraft, search.draft, attempt]);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Link
        to="/passport"
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
      >
        {pt("claim.back")}
      </Link>
      {failed ? (
        <div role="alert" className="space-y-3">
          <p>{pt("common.error")}</p>
          {!search.draft && (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              {pt("common.retry")}
            </button>
          )}
        </div>
      ) : !metadata ? (
        <p role="status">{pt("common.loading")}</p>
      ) : (
        <InternationalCredentialForm
          initial={draft}
          preselectCode={search.code}
          preselectCountry={search.country}
          metadata={metadata}
          onSave={(data) => save({ data })}
          onUpload={(claimId, file) => upload({ data: { ...file, claimId, periodId: null } })}
          onAssess={(data) => assess({ data })}
          onLoadAvailability={hayatAvailability}
          onAssessSaved={(data) => assessSaved({ data })}
        />
      )}
    </div>
  );
}
