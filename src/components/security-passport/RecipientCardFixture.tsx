// Dev-harness host for the recipient Passport card. Scaffolding, not product.
//
// Feeds `RecipientPassportCard` payloads shaped exactly like the ones
// `sp_get_disclosure` returns, so the shared surface can be reviewed offline
// in both languages and at 375px. The four cases below are the ones whose
// honesty matters most: a current appointment, a credential whose validity
// lapsed while still stored `active`, an anonymous share, and a package that
// disclosed nothing.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { buildRecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import type { RecipientPayloadActive } from "@/lib/security-passport/packages";
import { RecipientPassportCard } from "./live/RecipientPassportCard";

const EVAL = "2026-08-16";

function payload(over: Partial<RecipientPayloadActive>): RecipientPayloadActive {
  return {
    status: "active",
    package: "public_card",
    purpose: null,
    expires_at: "2026-12-31",
    last_updated: "2026-08-10T09:00:00Z",
    holder: "Stina Testsson",
    privacy_mode: "full_name",
    profession_slug: "vaktare",
    jurisdiction: "SE",
    verified_claims: [],
    verified_experience: [],
    verified_experience_days: 0,
    ...over,
  };
}

const CURRENT = payload({
  verified_experience_days: 1490,
  verified_claims: [
    {
      id: "r-ov",
      type: "licence",
      title: "Ordningsvaktsförordnande",
      credential_code: "OV",
      issuer: "Fiktiva Myndigheten",
      jurisdiction: "SE",
      issued_on: "2025-02-01",
      valid_until: "2028-01-31",
      assertion: "verified",
      lifecycle: "active",
      verified_at: "2025-02-03T10:00:00Z",
      verifier_organisation: "CQrityjob",
      verification_method: "document_review",
    },
    {
      id: "r-vu2",
      type: "training",
      title: "Väktarutbildning 2 (VU2)",
      credential_code: "VU2",
      issuer: "Väktarskolan Fiktiv AB",
      jurisdiction: "SE",
      issued_on: "2023-08-21",
      valid_until: null,
      assertion: "verified",
      lifecycle: "active",
      verified_at: "2023-09-01T10:00:00Z",
      verifier_organisation: "CQrityjob",
      verification_method: "issuer_confirmation",
    },
  ],
});

// Stored `active`, but the calendar has moved past valid_until. The page and
// the card must both call this expired.
const LAPSED = payload({
  holder: "Ingrid Testsson",
  verified_claims: [
    {
      id: "r-lapsed",
      type: "licence",
      title: "Ordningsvaktsförordnande",
      credential_code: "OV",
      issuer: "Fiktiva Myndigheten",
      jurisdiction: "SE",
      issued_on: "2023-06-01",
      valid_until: "2026-05-31",
      assertion: "verified",
      lifecycle: "active",
      verified_at: "2023-06-05T10:00:00Z",
      verifier_organisation: "CQrityjob",
      verification_method: "document_review",
    },
  ],
});

const ANONYMOUS = payload({
  holder: null,
  privacy_mode: "anonymous",
  verified_experience_days: 2100,
  verified_claims: [
    {
      id: "r-sv",
      type: "licence",
      title: "Skyddsvaktsförordnande",
      credential_code: "SV",
      issuer: "Fiktiva Myndigheten",
      jurisdiction: "SE",
      issued_on: "2026-01-16",
      valid_until: "2029-01-15",
      assertion: "verified",
      lifecycle: "active",
      verified_at: "2026-01-20T10:00:00Z",
      verifier_organisation: "CQrityjob",
      verification_method: "document_review",
    },
  ],
});

const NOTHING = payload({ holder: "Tom Provsson", package: "verified_qualifications" });

const CASES: readonly { id: string; label: string; data: RecipientPayloadActive }[] = [
  { id: "current", label: "Current OV + VU2", data: CURRENT },
  { id: "lapsed", label: "Stored active, validity lapsed", data: LAPSED },
  { id: "anonymous", label: "Anonymous holder", data: ANONYMOUS },
  { id: "nothing", label: "Package disclosed nothing", data: NOTHING },
];

export function RecipientCardFixture() {
  const { pt } = usePassportCopy();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("rec.cardTitle")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {pt("rec.authoritative")}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {CASES.map((c) => (
          <div key={c.id} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {c.label}
            </p>
            <RecipientPassportCard
              presentation={buildRecipientPresentation(c.data, EVAL)}
              verifyUrl={`cqrityjob.example/p/${c.id}`}
              className="min-h-[420px]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
