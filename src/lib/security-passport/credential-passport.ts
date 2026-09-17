import type { Claim, PassportHolder } from "./types";

export interface PassportProfileIdentity {
  readonly displayName: string | null;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
}

/** Product ownership, independent of storage. CV rows keep their existing
 * evidence and writer. Governed training certificates (e.g. VU1) are credentials;
 * generic courses, degrees, memberships and skills belong to CV. */
export function isPassportCredential(claim: Pick<Claim, "claimType" | "credentialCode">): boolean {
  return (
    claim.claimType === "certification" ||
    claim.claimType === "licence" ||
    (Boolean(claim.credentialCode) &&
      (claim.claimType === "training" || claim.claimType === "specialisation"))
  );
}

/**
 * The DOM anchor of one credential's row on the Passport overview.
 *
 * One function, so the row that carries the id and the side panel that links
 * to it cannot spell it differently. Namespaced, so a claim id can never
 * collide with a section id on the page (`merits`, `attention`); and reduced
 * to the characters an id and a URL fragment share, so no claim id — a uuid
 * today, anything tomorrow — can produce a fragment that fails to resolve.
 */
export function credentialRowAnchor(claimId: string): string {
  return `sp-credential-${claimId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** A projection, never a second editable record or a change to the v1 reader. */
export function credentialPassportHolder(holder: PassportHolder): PassportHolder {
  return { ...holder, claims: holder.claims.filter(isPassportCredential), periods: [] };
}

export const PASSPORT_OWNERSHIP = {
  sv: {
    profile: "Profil: vem du är, kontaktuppgifter och aktuell yrkestitel.",
    cv: "CV: anställningar, utbildning, språk och färdigheter.",
    passport: "Security Passport: certifieringar, licenser och yrkesbehörigheter med underlag.",
    private:
      "Privat tills du väljer vilka meriter du vill dela. Du bestämmer giltighetstiden och kan återkalla länken.",
    noTitle: "Lägg till din aktuella yrkestitel i Profil.",
    titleSource: "Aktuell yrkestitel från Profil — egen uppgift, inte en verifierad behörighet.",
  },
  en: {
    profile: "Profile: who you are, contact details and current professional title.",
    cv: "CV: employment, education, languages and skills.",
    passport:
      "Security Passport: certifications, licences and professional authorisations with evidence.",
    private:
      "Private until you choose which credentials to share. You set the expiry and can revoke the link.",
    noTitle: "Add your current professional title in Profile.",
    titleSource: "Current title from Profile — self-reported, not a verified authorisation.",
  },
} as const;
