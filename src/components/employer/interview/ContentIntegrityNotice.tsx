import { useT } from "@/i18n/context";
import type { ContentIntegrity } from "@/lib/interview-intelligence/content-integrity";

export function ContentIntegrityNotice({
  integrity,
  frozen = false,
}: {
  readonly integrity: ContentIntegrity;
  readonly frozen?: boolean;
}) {
  const { t } = useT();
  const snapshotProvenance =
    integrity.observation === "frozen_case_content" ? integrity.freezeProvenance : undefined;
  const contentDescription =
    snapshotProvenance === "case_created"
      ? "ri.snapshot.created"
      : snapshotProvenance === "observed_now"
        ? "ri.snapshot.observed"
        : frozen
          ? "ri.content.frozen"
          : "ri.content.current";
  return (
    <details className="mt-4 rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{t("ri.content.title")}</summary>
      <p className="mt-2">{t(contentDescription)}</p>
      <p className="mt-2" role={integrity.packHashMatches ? undefined : "status"}>
        {t(integrity.packHashMatches ? "ri.content.match" : "ri.content.mismatch")}
      </p>
      <dl className="mt-2 space-y-1">
        <div>
          <dt className="inline font-medium">{t("ri.content.pack")}: </dt>
          <dd className="inline">
            {integrity.packContentStatus ?? "—"} · {integrity.packValidationLabel ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">{t("ri.content.method")}: </dt>
          <dd className="inline">{integrity.methodApprovalState ?? "—"}</dd>
        </div>
      </dl>
      <p className="mt-2 text-muted-foreground">{t("ri.content.boundary")}</p>
      <p className="mt-2 break-all font-mono text-xs">
        {integrity.algorithm} · {integrity.manifestHash}
      </p>
    </details>
  );
}
