// These seven entries retain historical catalogue attribution, not a source check.
// A holder's document verification is a separate fact and must not be downgraded here.
const UNCHECKED_CODES = new Set([
  "AE_AZ_PSBD_LICENCE_GUARD",
  "AE_AZ_PSBD_LICENCE_CIT",
  "AE_AZ_PSBD_LICENCE_BANKS",
  "AE_AZ_PSBD_LICENCE_EVENT",
  "AE_AZ_PSBD_LICENCE_SUPERVISOR",
  "AE_AZ_PSBD_LICENCE_MANAGER",
  "AE_AZ_PSBD_LICENCE_TRAINER",
]);

export function AbuDhabiIssuerAttribution({
  code,
  lang,
}: {
  code: string | null | undefined;
  lang: string;
}) {
  if (!code || !UNCHECKED_CODES.has(code)) return null;
  return (
    <p data-abu-dhabi-issuer-attribution className="mt-2 text-xs text-muted-foreground">
      {lang === "sv"
        ? "Utfärdaren anges enligt tidigare katalogattribution. Myndighetskällan har inte kontrollerats och den juridiska granskningen är inte klar. Piloten ger ingen rätt att arbeta."
        : "The issuer follows earlier catalogue attribution. The authority source has not been checked and legal review is pending. The pilot gives no right to work."}
    </p>
  );
}
