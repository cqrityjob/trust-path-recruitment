import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListJobs } from "@/lib/job-intelligence/admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/jobs/")({
  ssr: false,
  component: AdminJobsList,
});

const STATUSES = [
  "all",
  "draft",
  "pending_review",
  "published",
  "expired",
  "rejected",
  "archived",
] as const;

function AdminJobsList() {
  const listFn = useServerFn(adminListJobs);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin", "jobs", status, appliedSearch],
    queryFn: () => listFn({ data: { status, search: appliedSearch || undefined } }),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1 text-xs border ${
                status === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {s.replace("_", " ")}
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
            placeholder="Search title, slug…"
            className="w-64"
          />
          <Button type="submit" variant="outline" size="sm">Search</Button>
        </form>
        <Link
          to="/admin/jobs/$id"
          params={{ id: "new" }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
        >
          + New job
        </Link>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading jobs…</p>}
      {q.isError && (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      )}

      {q.data && q.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No jobs match this filter.</p>
      )}

      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Title</th>
                <th className="p-3 font-medium">Employer</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Family</th>
                <th className="p-3 font-medium">Updated</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {q.data.map((j: any) => (
                <tr key={j.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">
                      {j.title_sv || j.title_en || <em className="text-muted-foreground">Untitled</em>}
                    </div>
                    <div className="text-xs text-muted-foreground">{j.slug}</div>
                  </td>
                  <td className="p-3">{j.employer?.name ?? "—"}</td>
                  <td className="p-3"><Badge variant="outline">{j.status}</Badge></td>
                  <td className="p-3 text-xs">{j.family_id ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(j.updated_at).toLocaleString()}
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      to="/admin/jobs/$id"
                      params={{ id: j.id }}
                      className="text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}