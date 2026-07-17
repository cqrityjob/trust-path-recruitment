import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminListEmployers,
  adminUpsertEmployer,
} from "@/lib/job-intelligence/admin.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/employers")({
  ssr: false,
  component: AdminEmployers,
});

function AdminEmployers() {
  const listFn = useServerFn(adminListEmployers);
  const saveFn = useServerFn(adminUpsertEmployer);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "employers"], queryFn: () => listFn() });

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
      setForm({ name: "", slug: "", website: "", country: "", description_sv: "", description_en: "" });
      qc.invalidateQueries({ queryKey: ["admin", "employers"] });
    },
    onError: (e: Error) => {
      setMsg(null);
      setErr(e.message);
    },
  });

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h2 className="mb-3 text-lg font-medium">Employers</h2>
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {q.isError && (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        )}
        {q.data && (
          <div className="overflow-hidden rounded-lg border">
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
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label>Slug (auto if empty)</Label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} maxLength={2} />
            </div>
          </div>
          <div>
            <Label>Description (SV)</Label>
            <Textarea rows={3} value={form.description_sv} onChange={(e) => setForm({ ...form, description_sv: e.target.value })} />
          </div>
          <div>
            <Label>Description (EN)</Label>
            <Textarea rows={3} value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          {msg && <p className="text-sm text-green-700">{msg}</p>}
          <Button type="submit" disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? "Saving…" : "Save employer"}
          </Button>
        </form>
      </div>
    </div>
  );
}