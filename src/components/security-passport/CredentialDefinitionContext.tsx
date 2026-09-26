import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { credentialDate } from "@/lib/security-passport/international";

const ROLE = {
  issuer: { sv: "Utfärdare", en: "Issuer" },
  regulator: { sv: "Tillsyn och föreskrifter", en: "Regulator" },
  training_provider: { sv: "Utbildare", en: "Training provider" },
  verification_authority: { sv: "Källa för kontroll", en: "Verification authority" },
};
export function CredentialDefinitionContext({
  code,
  claimId,
  metadata,
}: {
  code: string | null;
  /** The holder's own claim, for the version THEY stated (20261214090000). */
  claimId?: string;
  metadata: InternationalPassportMetadata | null;
}) {
  const { lang } = usePassportCopy();
  const review = metadata?.definitionReviews?.find((r) => r.credential_code === code);
  const roles = metadata?.organisationRoles?.filter((r) => r.credential_code === code) ?? [];
  const versions = metadata?.definitionVersions?.filter((v) => v.credential_code === code) ?? [];
  const statedKey = claimId
    ? (metadata?.statedVersions?.find((v) => v.claim_id === claimId)?.definition_version ?? null)
    : null;
  const stated = versions.find((v) => v.version_key === statedKey) ?? null;
  return (
    <section
      data-definition-context
      className="rounded-2xl border border-border bg-secondary/30 p-5"
    >
      <h2 className="text-lg font-semibold">
        {lang === "sv" ? "Om meriten" : "About this credential"}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {lang === "sv"
          ? "Officiella kataloguppgifter. Detta verifierar inte ditt personliga bevis."
          : "Official catalogue information. This does not verify your personal credential."}
      </p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        {versions.length > 0 && (
          <div data-definition-version={statedKey ?? "none"}>
            <dt className="text-xs text-muted-foreground">
              {lang === "sv" ? "Version enligt ditt intyg" : "Version on your certificate"}
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {stated
                ? [
                    stated.official_title,
                    stated.qualification_code,
                    stated.qualification_version ? `v${stated.qualification_version}` : null,
                    stated.framework_level != null ? `NSQF ${stated.framework_level}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : lang === "sv"
                  ? "Inte angiven"
                  : "Not stated"}
            </dd>
            {stated?.catalogue_status === "superseded" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {lang === "sv"
                  ? "En tidigare version av standarden. Det gör inte ditt intyg ogiltigt."
                  : "An earlier version of the standard. That does not make your certificate invalid."}
              </p>
            )}
          </div>
        )}
        {versions.length > 0 && (
          <div>
            <dt className="text-xs text-muted-foreground">
              {lang === "sv" ? "Examinerande organ" : "Awarding body"}
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {[...new Set(versions.map((v) => v.awarding_body))].join(", ")}
            </dd>
          </div>
        )}
        {roles.map((r) => (
          <div key={r.role}>
            <dt className="text-xs text-muted-foreground">{ROLE[r.role][lang]}</dt>
            <dd className="mt-1 text-sm font-medium">
              {r.document_specific
                ? lang === "sv"
                  ? "Fastställs från det enskilda dokumentet"
                  : "Established from the individual document"
                : metadata?.issuers.find(
                    (i) => i.id === (r.authority_id ?? r.certification_issuer_id),
                  )?.name || (lang === "sv" ? "Inte tillgängligt" : "Unavailable")}
            </dd>
          </div>
        ))}
      </dl>
      {review ? (
        <>
          <p className="mt-5 text-sm leading-relaxed">
            {review[lang === "sv" ? "validity_sv" : "validity_en"]}
          </p>
          <a
            href={review.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center text-sm text-accent underline"
          >
            {lang === "sv" ? "Officiell källa" : "Official source"}
          </a>
          <p className="text-xs text-muted-foreground">
            {lang === "sv" ? "Källan kontrollerad" : "Source checked"}:{" "}
            {credentialDate(review.checked_on, lang)}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm">
          {lang === "sv"
            ? "Officiella organisationsuppgifter behöver bekräftas. Äldre egna uppgifter är inte katalogfakta."
            : "Official organisation details need confirmation. Legacy holder-provided information is not catalogue data."}
        </p>
      )}
    </section>
  );
}
