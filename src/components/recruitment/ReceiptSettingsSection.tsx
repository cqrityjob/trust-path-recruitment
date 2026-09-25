// "Kommunikation och autosvar": the automatic receipt a recruitment sends
// when an application has been received.
//
// One switch, a subject and a body in Swedish and in English, four
// placeholders, a preview with sample data, save, and "back to the standard
// text". The standard text comes from the database (rec_receipt_default),
// so what the preview shows is exactly what the trigger renders. The
// section also says, in words, which channels the receipt reaches: the
// candidate's inbox in CQrityjob always, e-mail only where mail is
// configured -- and that switching it on affects future applications only.
//
// Who may change it is the database's rule (rec_can_manage); the page only
// mirrors it, and a refused save is shown as the refusal it was.

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Inbox, Mail } from "lucide-react";
import { useT } from "@/i18n/context";
import { recruitmentErrorKey } from "@/components/recruitment/errors";
import { renderReceiptTemplate } from "@/lib/recruitment/receipt-template";
import { setReceiptSettings, type ReceiptSettings } from "@/lib/recruitment/recruitment.functions";

const PLACEHOLDERS = [
  { sv: "{namn}", en: "{name}", key: "rec.receipt.var.name" },
  { sv: "{tjänst}", en: "{job}", key: "rec.receipt.var.job" },
  { sv: "{företag}", en: "{company}", key: "rec.receipt.var.company" },
  { sv: "{länk}", en: "{link}", key: "rec.receipt.var.link" },
] as const;

const fieldCls =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";

export function ReceiptSettingsSection({
  employerId,
  jobId,
  jobTitle,
  employerName,
  receipt,
  version,
  canManage,
  onChanged,
}: {
  employerId: string;
  jobId: string;
  jobTitle: string;
  employerName: string;
  receipt: ReceiptSettings;
  version: number;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { t, lang } = useT();
  const fn = useServerFn(setReceiptSettings);
  const [enabled, setEnabled] = useState(receipt.enabled);
  const [tab, setTab] = useState<"sv" | "en">(lang);
  const [subjectSv, setSubjectSv] = useState(receipt.subjectSv ?? receipt.defaults.subjectSv);
  const [bodySv, setBodySv] = useState(receipt.bodySv ?? receipt.defaults.bodySv);
  const [subjectEn, setSubjectEn] = useState(receipt.subjectEn ?? receipt.defaults.subjectEn);
  const [bodyEn, setBodyEn] = useState(receipt.bodyEn ?? receipt.defaults.bodyEn);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  // The saved state is the source: a refetch after a save (or a colleague's
  // save) re-seeds the fields.
  useEffect(() => {
    setEnabled(receipt.enabled);
    setSubjectSv(receipt.subjectSv ?? receipt.defaults.subjectSv);
    setBodySv(receipt.bodySv ?? receipt.defaults.bodySv);
    setSubjectEn(receipt.subjectEn ?? receipt.defaults.subjectEn);
    setBodyEn(receipt.bodyEn ?? receipt.defaults.bodyEn);
  }, [receipt]);

  const subject = tab === "sv" ? subjectSv : subjectEn;
  const body = tab === "sv" ? bodySv : bodyEn;
  const setSubject = tab === "sv" ? setSubjectSv : setSubjectEn;
  const setBody = tab === "sv" ? setBodySv : setBodyEn;
  const isStandard =
    tab === "sv"
      ? subjectSv === receipt.defaults.subjectSv && bodySv === receipt.defaults.bodySv
      : subjectEn === receipt.defaults.subjectEn && bodyEn === receipt.defaults.bodyEn;
  const dirty =
    enabled !== receipt.enabled ||
    subjectSv !== (receipt.subjectSv ?? receipt.defaults.subjectSv) ||
    bodySv !== (receipt.bodySv ?? receipt.defaults.bodySv) ||
    subjectEn !== (receipt.subjectEn ?? receipt.defaults.subjectEn) ||
    bodyEn !== (receipt.bodyEn ?? receipt.defaults.bodyEn);

  const sample = {
    name: tab === "sv" ? "Kim" : "Kim",
    job: jobTitle || (tab === "sv" ? "Väktare" : "Security officer"),
    company: employerName,
    link: "/my-career/applications?application=…",
  };

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await fn({
        data: {
          employerId,
          jobId,
          enabled,
          subjectSv: subjectSv.trim() || null,
          bodySv: bodySv.trim() || null,
          subjectEn: subjectEn.trim() || null,
          bodyEn: bodyEn.trim() || null,
          expectedVersion: version,
        },
      });
      setNotice({
        tone: "ok",
        text: enabled ? t("rec.receipt.savedOn") : t("rec.receipt.savedOff"),
      });
      onChanged();
    } catch (e) {
      setNotice({ tone: "warn", text: t(recruitmentErrorKey((e as Error).message)) });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  function resetToStandard() {
    if (tab === "sv") {
      setSubjectSv(receipt.defaults.subjectSv);
      setBodySv(receipt.defaults.bodySv);
    } else {
      setSubjectEn(receipt.defaults.subjectEn);
      setBodyEn(receipt.defaults.bodyEn);
    }
  }

  const tabCls = (active: boolean) =>
    "min-h-9 rounded-md px-3 text-sm font-medium " +
    (active ? "bg-accent text-accent-foreground" : "border border-border hover:bg-muted/40");

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 sm:p-5 lg:col-span-2"
      aria-labelledby="rec-receipt"
    >
      <h2 id="rec-receipt" className="text-base font-semibold">
        {t("rec.receipt.heading")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("rec.receipt.lede")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canManage || saving}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          {t("rec.receipt.toggle")}
        </label>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs font-medium " +
            (enabled
              ? "bg-emerald-600/10 text-emerald-800 dark:text-emerald-200"
              : "bg-muted text-muted-foreground")
          }
        >
          {enabled ? t("rec.receipt.on") : t("rec.receipt.off")}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("rec.receipt.futureOnly")}</p>
      {!canManage && (
        <p className="mt-2 text-sm text-muted-foreground">{t("rec.receipt.restricted")}</p>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <div
            className="flex items-center gap-2"
            role="tablist"
            aria-label={t("rec.receipt.language")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "sv"}
              className={tabCls(tab === "sv")}
              onClick={() => setTab("sv")}
            >
              {t("rec.receipt.lang.sv")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "en"}
              className={tabCls(tab === "en")}
              onClick={() => setTab("en")}
            >
              {t("rec.receipt.lang.en")}
            </button>
            {isStandard ? (
              <span className="text-xs text-muted-foreground">{t("rec.receipt.isStandard")}</span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("rec.receipt.isCustom")}</span>
            )}
          </div>
          <label className="mt-3 block text-sm font-medium">
            {t("rec.receipt.subject")}
            <input
              className={fieldCls}
              value={subject}
              maxLength={200}
              disabled={!canManage || saving}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="mt-3 block text-sm font-medium">
            {t("rec.receipt.body")}
            <textarea
              className={fieldCls + " min-h-44 font-[inherit]"}
              value={body}
              maxLength={4000}
              disabled={!canManage || saving}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("rec.receipt.variables")}{" "}
            {PLACEHOLDERS.map((p, i) => (
              <span key={p.key}>
                <code className="rounded bg-muted px-1">{tab === "sv" ? p.sv : p.en}</code>{" "}
                {t(p.key)}
                {i < PLACEHOLDERS.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("rec.receipt.noPromise")}</p>
          {canManage && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void save()}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                {saving ? t("rec.common.saving") : t("rec.receipt.save")}
              </button>
              <button
                type="button"
                disabled={saving || isStandard}
                onClick={resetToStandard}
                className="min-h-10 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
              >
                {t("rec.receipt.reset")}
              </button>
            </div>
          )}
          {notice && (
            <p
              role="status"
              className={
                "mt-3 rounded-md border px-3 py-2 text-sm " +
                (notice.tone === "ok"
                  ? "border-emerald-600/40 bg-emerald-600/10"
                  : "border-amber-500/40 bg-amber-500/10")
              }
            >
              {notice.text}
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold">{t("rec.receipt.previewHeading")}</h3>
          <p className="text-xs text-muted-foreground">{t("rec.receipt.previewLede")}</p>
          <div
            className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-sm"
            aria-live="polite"
            data-testid="receipt-preview"
          >
            <p className="font-medium">{renderReceiptTemplate(subject, sample)}</p>
            <pre className="mt-2 whitespace-pre-wrap font-[inherit] text-sm">
              {renderReceiptTemplate(body, sample)}
            </pre>
          </div>
          <h3 className="mt-4 text-sm font-semibold">{t("rec.receipt.channelsHeading")}</h3>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Inbox className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("rec.receipt.channel.inApp")}
            </li>
            <li className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("rec.receipt.channel.email")}
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{t("rec.receipt.history")}</p>
        </div>
      </div>
    </section>
  );
}
