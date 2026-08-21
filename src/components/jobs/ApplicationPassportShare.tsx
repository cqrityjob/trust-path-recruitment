// The candidate's control, inside the application it belongs to.
//
// ── WHY IT LIVES ON THE APPLICATION ROW ─────────────────────────────────
//
// The decision "should this employer see my verified record" is made while
// looking at that employer, not while looking at a sharing centre. Putting
// it anywhere else means the alternative is pasting a Passport link into a
// cover note — which turns a scoped, revocable disclosure into a string
// living in the employer's own records forever.
//
// It lives in the jobs tree rather than the Passport tree because it calls
// server functions, which only src/lib/security-passport/*.functions.ts may
// do (scripts/passport-separation-check.ts, rule 2). The packages, the copy
// and the contract all still come from the Passport domain.
//
// ── IT SAYS WHAT IS ALREADY TRUE ────────────────────────────────────────
//
// The first line states that applying shared nothing. That is not
// reassurance copy: it is the database's actual behaviour, and the candidate
// has no way to know it unless the product says so. Everything the panel
// offers afterwards is the same package contract the sharing centre offers,
// rendered from LIVE_PACKAGES, so the two surfaces cannot describe the same
// package differently.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { LIVE_PACKAGES, type DisclosurePackageCode } from "@/lib/security-passport/packages";
import {
  listMyApplicationDisclosures,
  sharePassportWithApplication,
  type ApplicationDisclosureRecord,
} from "@/lib/security-passport/application-disclosure.functions";
import { revokeDisclosure } from "@/lib/security-passport/disclosure.functions";
import { getMyPassport } from "@/lib/security-passport/passport.functions";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

const STATE_KEY: Readonly<Record<ApplicationDisclosureRecord["state"], PassportCopyKey>> = {
  active: "sc.state.active",
  expired: "sc.state.expired",
  revoked: "sc.state.revoked",
};

const EXPIRY_CHOICES: readonly { readonly days: number | null; readonly key: PassportCopyKey }[] = [
  { days: 7, key: "sc.expiry.7" },
  { days: 30, key: "sc.expiry.30" },
  { days: 90, key: "sc.expiry.90" },
  { days: null, key: "sc.expiry.never" },
];

export function ApplicationPassportShare({ applicationId }: { applicationId: string }) {
  const { pt } = usePassportCopy();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyApplicationDisclosures);
  const shareFn = useServerFn(sharePassportWithApplication);
  const revokeFn = useServerFn(revokeDisclosure);
  const passportFn = useServerFn(getMyPassport);

  const [open, setOpen] = useState(false);
  const [packageCode, setPackageCode] = useState<DisclosurePackageCode>("employer_review");
  const [expiryDays, setExpiryDays] = useState<number | null>(30);
  const [error, setError] = useState<string | null>(null);

  const shares = useQuery({
    queryKey: ["passport", "application-disclosures"],
    queryFn: () => listFn(),
  });

  const passport = useQuery({
    queryKey: ["passport", "profile"],
    queryFn: () => passportFn(),
  });

  const current = (shares.data ?? []).find(
    (s) => s.applicationId === applicationId && s.state === "active",
  );

  const share = useMutation({
    mutationFn: () => shareFn({ data: { applicationId, packageCode, expiresDays: expiryDays } }),
    onSuccess: () => {
      setError(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["passport", "application-disclosures"] });
    },
    onError: () => setError(pt("ad.error")),
  });

  const revoke = useMutation({
    mutationFn: (disclosureId: string) => revokeFn({ data: { disclosureId } }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["passport", "application-disclosures"] });
    },
    onError: () => setError(pt("ad.revokeError")),
  });

  const hasPassport = Boolean(passport.data?.profile);
  const currentMeta = current
    ? LIVE_PACKAGES.find((p) => p.code === current.packageCode)
    : undefined;

  return (
    <section className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{pt("ad.title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{pt("ad.lead")}</p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {!passport.isLoading && !hasPassport ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {pt("ad.needPassport")}{" "}
          <Link to="/passport" className="font-medium text-accent hover:underline">
            {pt("ad.openPassport")}
          </Link>
        </p>
      ) : current ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium text-foreground">
            {currentMeta ? pt(currentMeta.nameKey) : current.packageCode}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {pt(STATE_KEY[current.state])} · {pt("sc.created")} {current.createdAt.slice(0, 10)}
            {current.expiresAt
              ? ` · ${pt("sc.expiresOn")} ${current.expiresAt.slice(0, 10)}`
              : ""}{" "}
            · {current.accessCount} {pt("sc.timesShort")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
            >
              {open ? pt("ad.cancel") : pt("ad.change")}
            </button>
            <button
              type="button"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(current.disclosureId)}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              {revoke.isPending ? pt("sc.revoking") : pt("sc.revoke")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">{pt("ad.nothingShared")}</p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
          >
            {open ? pt("ad.cancel") : pt("ad.share")}
          </button>
        </div>
      )}

      {open && hasPassport && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-foreground">{pt("sc.choosePackage")}</p>
          <p className="text-xs text-muted-foreground">{pt("sc.packagesAreFixed")}</p>
          <div className="space-y-2">
            {LIVE_PACKAGES.map((p) => (
              <label
                key={p.code}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-2 hover:bg-accent/5"
              >
                <input
                  type="radio"
                  name={`ad-package-${applicationId}`}
                  value={p.code}
                  checked={packageCode === p.code}
                  onChange={() => setPackageCode(p.code)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">{pt(p.nameKey)}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {pt(p.purposeKey)}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div>
            <label
              htmlFor={`ad-expiry-${applicationId}`}
              className="block text-xs font-medium text-foreground"
            >
              {pt("sc.expiry")}
            </label>
            <select
              id={`ad-expiry-${applicationId}`}
              value={String(expiryDays)}
              onChange={(e) =>
                setExpiryDays(e.target.value === "null" ? null : Number(e.target.value))
              }
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground sm:w-56"
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={String(c.days)} value={String(c.days)}>
                  {pt(c.key)}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted-foreground">{pt("ad.replacesPrevious")}</p>
          <p className="text-xs text-muted-foreground">{pt("sc.verifiedOnlyNote")}</p>

          <button
            type="button"
            disabled={share.isPending}
            onClick={() => share.mutate()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60"
          >
            {share.isPending ? pt("ad.sharing") : pt("ad.share")}
          </button>
        </div>
      )}
    </section>
  );
}
