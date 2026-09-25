// Assign an existing test to the selected candidates, from the list.
//
// The same act as the "Skicka bedömning" button on one application, run for
// each selected application in turn and reported per candidate. The tests
// offered are the ones the organisation may already run for recruitment
// (scp_employer_content_library, assignable, designed for recruitment
// support); nothing is invented here. A second click, a retry or a colleague
// assigning the same test at the same moment all land on the ONE existing
// attempt: scp_employer_assign locks the application row and returns the
// attempt it already has (migration 20261209090000), so "assigned" below
// means "this candidate now has this test", whether or not this click created
// it.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/i18n/context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assignFromApplication,
  listContentLibrary,
} from "@/lib/security-competency/academy-employer.functions";

export type AssignCandidate = { applicationId: string; name: string | null };

const ASSIGN_ERROR_KEY: Record<string, string> = {
  SCP_APPLICATION_ASSIGNMENT_CONTEXT_MISMATCH: "rec.assignTest.error.mismatch",
  SCP_APPLICANT_HAS_NO_ADDRESS: "rec.assignTest.error.noAddress",
};

export function AssignTestDialog({
  employerId,
  candidates,
  onClose,
}: {
  employerId: string;
  candidates: AssignCandidate[];
  /** `assigned` is how many candidates now hold the test. */
  onClose: (assigned: number) => void;
}) {
  const { t, lang } = useT();
  const libraryFn = useServerFn(listContentLibrary);
  const assignFn = useServerFn(assignFromApplication);
  const library = useQuery({
    queryKey: ["employer", employerId, "library", "recruitment"],
    queryFn: () => libraryFn({ data: { employerId } }),
    select: (rows) =>
      rows.filter(
        (r) =>
          r.libraryKind === "assessment" && r.designedFor === "recruitment_support" && r.assignable,
      ),
  });
  const [versionId, setVersionId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    { applicationId: string; name: string | null; ok: boolean; code: string | null }[] | null
  >(null);
  const anonymous = t("employer.applications.anonymousCandidate");
  const options = library.data ?? [];
  const chosen = versionId || options[0]?.itemId || "";

  async function run() {
    if (!chosen) return;
    setBusy(true);
    const out: NonNullable<typeof results> = [];
    for (const c of candidates) {
      try {
        await assignFn({
          data: { employerId, applicationId: c.applicationId, assessmentVersionId: chosen },
        });
        out.push({ applicationId: c.applicationId, name: c.name, ok: true, code: null });
      } catch (e) {
        const err = e as { code?: string; message?: string };
        out.push({
          applicationId: c.applicationId,
          name: c.name,
          ok: false,
          code: err.code ?? err.message ?? null,
        });
      }
    }
    setBusy(false);
    setResults(out);
  }

  const assigned = results?.filter((r) => r.ok).length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(assigned)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("rec.assignTest.title")}</DialogTitle>
          <DialogDescription>
            {t("rec.assignTest.lede").replace("{n}", String(candidates.length))}
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div>
            <p className="text-sm font-medium" role="status">
              {t("rec.assignTest.result")
                .replace("{ok}", String(assigned))
                .replace("{total}", String(results.length))}
            </p>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
              {results.map((r) => (
                <li
                  key={r.applicationId}
                  className="flex flex-wrap justify-between gap-2 px-3 py-2"
                >
                  <span className="font-medium">{r.name ?? anonymous}</span>
                  <span
                    className={r.ok ? "text-emerald-800 dark:text-emerald-200" : "text-destructive"}
                  >
                    {r.ok
                      ? t("rec.assignTest.assigned")
                      : t(
                          (ASSIGN_ERROR_KEY[r.code ?? ""] ??
                            "rec.assignTest.error.failed") as Parameters<typeof t>[0],
                        )}
                  </span>
                </li>
              ))}
            </ul>
            <DialogFooter className="mt-4">
              <button
                type="button"
                onClick={() => onClose(assigned)}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground"
              >
                {t("rec.common.close")}
              </button>
            </DialogFooter>
          </div>
        ) : library.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : library.isError ? (
          <p role="alert" className="text-sm text-amber-900 dark:text-amber-200">
            {t("rec.assignTest.libraryUnavailable")}
          </p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("rec.assignTest.none")}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label className="block text-sm font-medium">
              {t("rec.assignTest.pick")}
              <select
                className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={chosen}
                onChange={(e) => setVersionId(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.itemId} value={o.itemId}>
                    {lang === "en" ? o.nameEn : o.nameSv}
                  </option>
                ))}
              </select>
            </label>
            <ul className="mt-3 max-h-40 overflow-y-auto rounded-md border border-border px-3 py-2 text-sm">
              {candidates.map((c) => (
                <li key={c.applicationId}>{c.name ?? anonymous}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{t("rec.assignTest.note")}</p>
            <DialogFooter className="mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => onClose(0)}
                className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {t("rec.common.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy || !chosen}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                {busy ? t("rec.common.saving") : t("rec.assignTest.confirm")}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
