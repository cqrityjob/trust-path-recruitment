// Talent discovery — the contact requests a person has received.
//
// Each request says who (the organisation), about what (the vacancy, its
// place and whether it is still open), what they wrote, and what accepting
// means -- before the person decides, with the advert one click away BEFORE
// the decision (workshop 2026-10-15, package C). Accepting shares the
// person's name and nothing else; applying, and any Passport sharing with the
// application, stays the person's own act on the job page. Stopping a company
// names the company: it covers every position there, not this one request.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, MapPin } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { ReceivedContact } from "@/lib/talent/discoverability.functions";

const STATUS_KEY: Record<ReceivedContact["status"], PassportCopyKey> = {
  pending: "disc.contacts.status.pending",
  accepted: "disc.contacts.status.accepted",
  declined: "disc.contacts.status.declined",
  withdrawn: "disc.contacts.status.withdrawn",
};

export function ContactRequestList({
  items,
  onRespond,
}: {
  readonly items: readonly ReceivedContact[];
  readonly onRespond: (contactId: string, accept: boolean, block: boolean) => Promise<void>;
}) {
  const { pt, lang } = usePassportCopy();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function respond(id: string, accept: boolean, block: boolean, company: string) {
    if (busy) return;
    if (
      block &&
      !window.confirm(pt("disc.contacts.declineBlockConfirm").replace("{company}", company))
    )
      return;
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      await onRespond(id, accept, block);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      const key = (
        code === "TALENT_JOB_CLOSED" || code === "TALENT_CONTACT_ALREADY_ANSWERED"
          ? `disc.contacts.error.${code}`
          : "disc.contacts.error.generic"
      ) as PassportCopyKey;
      setErrors((e) => ({ ...e, [id]: pt(key) }));
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">{pt("disc.contacts.empty")}</p>;
  const btn =
    "inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <ul className="space-y-4">
      {items.map((c) => {
        const title =
          (lang === "sv" ? c.job.titleSv || c.job.titleEn : c.job.titleEn || c.job.titleSv) ?? "";
        const place = [c.job.city, c.job.country].filter(Boolean).join(", ");
        return (
          <li
            key={c.id}
            data-contact-request={c.status}
            className="rounded-xl border border-border bg-card p-4"
            aria-labelledby={`contact-${c.id}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
                  {pt("disc.contacts.from")}{" "}
                  <span className="font-semibold text-foreground">{c.employer.name}</span>
                </p>
                <h3 id={`contact-${c.id}`} className="mt-1 text-base font-semibold text-foreground">
                  {title}
                </h3>
                {place ? (
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                    {place}
                  </p>
                ) : null}
              </div>
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground">
                {pt(STATUS_KEY[c.status])}
              </span>
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {pt("disc.contacts.message")}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {c.message}
              </p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {pt("disc.contacts.received")} {c.createdAt.slice(0, 10)}
              </p>
            </div>
            {!c.job.open ? (
              <p className="mt-2 text-sm text-muted-foreground">{pt("disc.contacts.jobClosed")}</p>
            ) : null}
            {c.status === "pending" ? (
              <>
                {c.job.open ? (
                  <Link
                    to="/jobs/$slug"
                    params={{ slug: c.job.slug }}
                    aria-label={`${pt("disc.contacts.readAdvert")}: ${title}`}
                    data-contact-advert
                    className={`${btn} mt-3 border border-input text-foreground hover:bg-secondary`}
                  >
                    {pt("disc.contacts.readAdvert")}
                  </Link>
                ) : null}
                <p
                  id={`contact-consequence-${c.id}`}
                  className="mt-3 rounded-md bg-secondary/50 p-3 text-sm leading-relaxed text-foreground"
                >
                  {pt("disc.contacts.whatAccept")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null || !c.job.open}
                    onClick={() => void respond(c.id, true, false, c.employer.name)}
                    aria-describedby={`contact-consequence-${c.id}`}
                    className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}
                  >
                    {pt("disc.contacts.accept")}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void respond(c.id, false, false, c.employer.name)}
                    className={`${btn} border border-input text-foreground hover:bg-secondary`}
                  >
                    {pt("disc.contacts.decline")}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void respond(c.id, false, true, c.employer.name)}
                    aria-describedby={`contact-block-${c.id}`}
                    className={`${btn} text-muted-foreground underline-offset-4 hover:text-foreground hover:underline`}
                  >
                    {pt("disc.contacts.declineBlock").replace("{company}", c.employer.name)}
                  </button>
                </div>
                <p id={`contact-block-${c.id}`} className="mt-2 text-xs text-muted-foreground">
                  {pt("disc.contacts.declineHelp").replace("{company}", c.employer.name)}
                </p>
              </>
            ) : null}
            {c.status === "accepted" ? (
              <div className="mt-3 space-y-2">
                {c.applicationId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-foreground">{pt("disc.contacts.applied")}</p>
                    <Link
                      to="/my-career/applications"
                      className={`${btn} border border-input text-foreground hover:bg-secondary`}
                    >
                      {pt("disc.contacts.openApplications")}
                    </Link>
                  </div>
                ) : c.job.open && c.job.acceptsApplications ? (
                  <>
                    <p
                      className="text-sm leading-relaxed text-foreground"
                      data-contact-next="apply"
                    >
                      {pt("disc.contacts.acceptedApplyLeft")}
                    </p>
                    <Link
                      to="/jobs/$slug"
                      params={{ slug: c.job.slug }}
                      className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}
                    >
                      {pt("disc.contacts.apply")}
                    </Link>
                  </>
                ) : c.job.open ? (
                  <>
                    <p
                      className="text-sm leading-relaxed text-foreground"
                      data-contact-next="external"
                    >
                      {pt("disc.contacts.acceptedExternal")}
                    </p>
                    <Link
                      to="/jobs/$slug"
                      params={{ slug: c.job.slug }}
                      aria-label={`${pt("disc.contacts.readAdvert")}: ${title}`}
                      className={`${btn} border border-input text-foreground hover:bg-secondary`}
                    >
                      {pt("disc.contacts.readAdvert")}
                    </Link>
                  </>
                ) : null}
              </div>
            ) : null}
            {errors[c.id] ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {errors[c.id]}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
