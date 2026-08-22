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
import { useT } from "@/i18n/context";
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
  const { t } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyApplicationDisclosures);
  const shareFn = useServerFn(sharePassportWithApplication);
  const revokeFn = useServerFn(revokeDisclosure);
  const passportFn = useServerFn(getMyPassport);

  const [error, setError] = useState<string | null>(null);

  // Fixed, and deliberately the same package and expiry the submission path
  // uses. Attaching a Passport to an application the candidate already sent
  // must produce the SAME disclosure they would have got by ticking the box
  // when they applied — otherwise "what did I share with this employer" has
  // two different answers depending on when they decided.
  const APPLICATION_PACKAGE: DisclosurePackageCode = "employer_review";
  const APPLICATION_EXPIRY_DAYS = 30;

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
    mutationFn: () =>
      shareFn({
        data: {
          applicationId,
          packageCode: APPLICATION_PACKAGE,
          expiresDays: APPLICATION_EXPIRY_DAYS,
        },
      }),
    onSuccess: () => {
      setError(null);
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
            {t("myapps.passport.included")}
            <span className="font-normal text-muted-foreground">
              {" · "}
              {currentMeta ? pt(currentMeta.nameKey) : current.packageCode}
            </span>
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
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(current.disclosureId)}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              {revoke.isPending ? pt("sc.revoking") : pt("sc.revoke")}
            </button>
          </div>
        </div>
      ) : (
        /* One action, not a wizard. The package is fixed and stated, so the
           candidate is choosing WHETHER to share, never re-learning the
           disclosure taxonomy to attach a Passport to an application they
           have already sent. */
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">{pt("ad.nothingShared")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{pt("sc.verifiedOnlyNote")}</p>
          <button
            type="button"
            disabled={share.isPending}
            onClick={() => share.mutate()}
            className="mt-2 inline-flex min-h-[44px] items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {share.isPending ? pt("ad.sharing") : t("myapps.passport.attach")}
          </button>
        </div>
      )}
    </section>
  );
}
