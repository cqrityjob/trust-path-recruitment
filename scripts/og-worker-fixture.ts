// Synthetic public-share payloads for the Worker-runtime evidence job, shaped
// exactly like `sp_get_social_share`'s answer. Invented people and merits only.

export const ACTIVE_ID = "AbCdEfGhIjKlMnOpQrStUvWx";
export const LONG_ID = "LongLongLongLongLongLong1";
export const ARABIC_ID = "ArabicArabicArabicArabic1";
export const FOUNDER_ID = "FounderFounderFounderFo01";

const claim = (n: number, title: string, assertion = "self_declared") => ({
  key: `c${n}`,
  type: "certification",
  title,
  credential_code: null,
  jurisdiction: "SE",
  sub_jurisdiction: null,
  scope_code: null,
  no_expiry: true,
  valid_until: null,
  assertion,
  lifecycle: "active",
  verified_at: null,
  verifier_organisation: null,
  verification_method: null,
});

export function payloadFor(id: string): Record<string, unknown> | null {
  const base = {
    status: "active",
    locale: "sv",
    snapshot_at: "2026-10-01T10:00:00Z",
    expires_at: "2027-01-01T10:00:00Z",
    holder: "Selma Dahlberg (fiktiv)",
    holder_label: "full_name",
    jurisdiction: "SE",
    passport_number: 17,
    designation: null,
  };
  switch (id) {
    case ACTIVE_ID:
      return {
        ...base,
        claims: [
          claim(1, "Ordningsvaktsutbildning (grundutbildning)"),
          claim(2, "Certified Protection Professional (CPP)"),
          claim(3, "Första hjälpen och HLR"),
        ],
      };
    case LONG_ID:
      return {
        ...base,
        claims: Array.from({ length: 40 }, (_, i) =>
          claim(i + 1, `Merit nummer ${i + 1} med ett ganska långt och detaljerat namn åäö`),
        ),
      };
    case ARABIC_ID:
      return { ...base, holder: "محمد الشاوي", claims: [claim(1, "Brandskydd grund")] };
    case FOUNDER_ID:
      return {
        ...base,
        locale: "en",
        holder: "Founder Example (fiktiv)",
        passport_number: 1,
        designation: "founder",
        claims: [claim(1, "Brandskydd grund")],
      };
    default:
      return null;
  }
}
