// Phase H3.3 — /admin/employers: employer moderation list. Replaces the
// previous minimal "manually create an employer" tool (name/slug/country
// only, no status, no moderation) with the real moderation surface the
// brief asks for: status filters (defaulting to pending, per the brief's
// explicit "default view should prioritise pending employers"), search,
// and per-row counts/owner/last-activity. The original manual-create
// capability is preserved, not deleted, as a secondary collapsible
// section below the list -- still occasionally useful (e.g. onboarding a
// company directly without the self-service flow) and unrelated to the
// moderation workflow itself.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  adminListEmployersForModeration,
  type AdminEmployerListRow,
} from "@/lib/job-intelligence/admin-employer-moderation.functions";
import { adminListEmployers, adminUpsertEmployer } from "@/lib/job-intelligence/admin.functions";
import { formatDate } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/employers")({
  ssr: false,
  component: AdminEmployersPage,
});

type StatusFilter = "pending" | "active" | "rejected" | "suspended" | "all";

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  pending: "secondary",
  draft: "secondary",
  rejected: "destructive",
  suspended: "destructive",
  archived: "outline",
};

const STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  draft: "admin.employers.status.draft",
  pending: "admin.employers.status.pending",
  active: "admin.employers.status.active",
  rejected: "admin.employers.status.rejected",
  suspended: "admin.employers.status.suspended",
  archived: "admin.employers.status.archived",
};

function AdminEmployersPage() {
  const { t, lang } = useT();
  const listFn = useServerFn(adminListEmployersForModeration);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin", "employers-moderation", status, appliedSearch],
    queryFn: () => listFn({ data: { status, search: appliedSearch || undefined } }),
  });

  const rows: AdminEmployerListRow[] = q.data ?? [];
  const filters: StatusFilter[] = ["pending", "active", "rejected", "suspended", "all"];

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="employers">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.employers.list.heading")}
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatus(f)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  status === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {t(`admin.employers.list.filter.${f}` as TranslationKey)}
              </button>
            ))}
          </div>
          <form
            className="ml-auto flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedSearch(search.trim());
            }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.employers.list.search.placeholder")}
              className="w-72"
            />
            <Button type="submit" variant="outline" size="sm">
              {t("admin.employers.list.searchButton")}
            </Button>
          </form>
        </div>

        <div className="mt-6">
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>}
          {q.isError && (
            <p className="text-sm text-destructive">{t("admin.employers.list.loadError")}</p>
          )}
          {q.isSuccess && rows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("admin.employers.list.empty")}
            </div>
          )}
          {q.isSuccess && rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("admin.employers.list.column.name")}</th>
                    <th className="px-4 py-3">{t("admin.employers.list.column.status")}</th>
                    <th className="px-4 py-3">{t("admin.employers.list.column.country")}</th>
                    <th className="px-4 py-3">
                      {t("admin.employers.list.column.registrationNumber")}
                    </th>
                    <th className="px-4 py-3">{t("admin.employers.list.column.owner")}</th>
                    <th className="px-4 py-3">{t("admin.employers.list.column.members")}</th>
                    <th className="px-4 py-3">{t("admin.employers.list.column.drafts")}</th>
                    <th className="px-4 py-3">{t("admin.employers.list.column.created")}</th>
                    <th className="px-4 py-3 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE_VARIANT[r.status] ?? "outline"}>
                          {t(STATUS_LABEL_KEY[r.status] ?? "admin.employers.status.draft")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.country ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.registrationNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.ownerDisplayName ?? t("admin.employers.list.ownerUnknown")}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.memberCount}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.draftJobCount}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(r.createdAt, lang)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/admin/employers/$employerId"
                          params={{ employerId: r.id }}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                        >
                          {t("admin.employers.list.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ManualCreateEmployerSection />
      </AdminShellChrome>
    </SiteLayout>
  );
}

// Preserved from the pre-H3.3 admin tool -- manual employer creation is
// unrelated to the moderation workflow above. Creation-only: it can never
// change an existing employer's status (adminUpsertEmployer rejects that
// outright), and a newly created employer always starts 'pending' (H3.3
// integrity fix) -- it must pass through the moderation workflow above to
// become active, exactly like a self-service-created employer. Kept as a
// collapsible secondary section
// rather than deleted.
function ManualCreateEmployerSection() {
  const listFn = useServerFn(adminListEmployers);
  const saveFn = useServerFn(adminUpsertEmployer);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["admin", "employers"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const [form, setForm] = useState({
    name: "",
    slug: "",
    website: "",
    country: "",
    description_sv: "",
    description_en: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () =>
      saveFn({
        data: {
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          website: form.website.trim() || null,
          country: form.country.trim() || null,
          description_sv: form.description_sv || null,
          description_en: form.description_en || null,
        } as any,
      }),
    onSuccess: () => {
      setErr(null);
      setMsg("Employer saved.");
      setForm({
        name: "",
        slug: "",
        website: "",
        country: "",
        description_sv: "",
        description_en: "",
      });
      qc.invalidateQueries({ queryKey: ["admin", "employers"] });
      qc.invalidateQueries({ queryKey: ["admin", "employers-moderation"] });
    },
    onError: (e: Error) => {
      setMsg(null);
      setErr(e.message);
    },
  });

  return (
    <div className="mt-12 border-t border-border pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? "▾" : "▸"} Manually create an employer (admin tool, outside moderation workflow)
      </button>
      {open && (
        <div className="mt-4 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-lg font-medium">Existing employers</h2>
            {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
            {q.data && (
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-2 font-medium">Name</th>
                      <th className="p-2 font-medium">Slug</th>
                      <th className="p-2 font-medium">Country</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.map((e: any) => (
                      <tr key={e.id} className="border-t">
                        <td className="p-2">{e.name}</td>
                        <td className="p-2 text-xs text-muted-foreground">{e.slug}</td>
                        <td className="p-2">{e.country ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-lg font-medium">Add employer</h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div>
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Slug (auto if empty)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Website</Label>
                  <Input
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
                    maxLength={2}
                  />
                </div>
              </div>
              <div>
                <Label>Description (SV)</Label>
                <Textarea
                  rows={3}
                  value={form.description_sv}
                  onChange={(e) => setForm({ ...form, description_sv: e.target.value })}
                />
              </div>
              <div>
                <Label>Description (EN)</Label>
                <Textarea
                  rows={3}
                  value={form.description_en}
                  onChange={(e) => setForm({ ...form, description_en: e.target.value })}
                />
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              {msg && <p className="text-sm text-green-700">{msg}</p>}
              <Button type="submit" disabled={save.isPending || !form.name.trim()}>
                {save.isPending ? "Saving…" : "Save employer"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
