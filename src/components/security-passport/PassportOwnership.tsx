import { Link } from "@tanstack/react-router";
import { PASSPORT_OWNERSHIP } from "@/lib/security-passport/credential-passport";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export function PassportOwnership() {
  const { lang } = usePassportCopy();
  const copy = PASSPORT_OWNERSHIP[lang];
  return (
    <section
      aria-label={lang === "sv" ? "Profil, CV och Passport" : "Profile, CV and Passport"}
      className="mb-6 rounded-xl border border-border bg-card p-4 text-sm leading-relaxed"
    >
      <p className="font-medium">{copy.passport}</p>
      <p className="mt-1 text-muted-foreground">{copy.private}</p>
      <div className="mt-3 flex flex-col gap-2">
        <Link to="/my-career/profile" className="underline underline-offset-4">
          {copy.profile}
        </Link>
        <Link to="/my-career/cv" className="underline underline-offset-4">
          {copy.cv}
        </Link>
      </div>
    </section>
  );
}
