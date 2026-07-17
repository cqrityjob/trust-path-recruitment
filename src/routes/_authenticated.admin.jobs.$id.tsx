import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  adminGetJob,
  adminListEmployers,
  adminSaveJobDraft,
  adminTransitionJob,
} from "@/lib/job-intelligence/admin.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/jobs/$id")({
  ssr: false,
  component: AdminJobEditor,
});

const FAMILY_IDS = [
  "protective_operations",
  "public_safety_justice",
  "corrections_secure_transport",
  "defence_national_security",
  "corporate_security",
  "critical_infrastructure_security",
  "risk_management",
  "crisis_management",
  "business_continuity_resilience",
  "cyber_information_security",
  "financial_crime_compliance",
  "security_technology",
  "security_leadership_governance",
  "investigations_intelligence",
];

type FormState = {
  employer_id: string;
  title_sv: string;
  title_en: string;
  description_sv: string;
  description_en: string;
  family_id: string;
  profession_slug: string;
  location_text: string;
  country: string;
  application_method: "external" | "email" | "internal" | "unavailable";
  application_url: string;
  application_email: string;
  deadline_at: string;
  expires_at: string;
  moderation_notes: string;
};

const EMPTY: FormState = {
  employer_id: "",
  title_sv: "",
  title_en: "",
  description_sv: "",
  description_en: "",
  family_id: "",
  profession_slug: "",
  location_text: "",
  country: "",
  application_method: "external",
  application_url: "",
  application_email: "",
  deadline_at: "",
  expires_at: "",
  moderation_notes: "",
};

function AdminJobEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const getFn = useServerFn(adminGetJob);
  const empFn = useServerFn(adminListEmployers);
  const saveFn = useServerFn(adminSaveJobDraft);
  const transitionFn = useServerFn(adminTransitionJob);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const employers = useQuery({
    queryKey: ["admin", "employers"],
    queryFn: () => empFn(),
  });
  const jobQ = useQuery({
    queryKey: ["admin", "job", id],
    queryFn: () => getFn({ data: { id } }),
    enabled: !isNew,
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobQ.data) {
      const j = jobQ.data.job as any;
      const m = (jobQ.data.meta as any) ?? {};
      setForm({
        employer_id: j.employer_id ?? "",
        title_sv: j.title_sv ?? "",
        title_en: j.title_en ?? "",
        description_sv: j.description_sv ?? "",
        description_en: j.description_en ?? "",
        family_id: j.family_id ?? "",
        profession_slug: j.profession_slug ?? "",
        location_text: j.location_text ?? "",
        country: j.country ?? "",
        application_method: j.application_method ?? "external",
        application_url: j.application_url ?? "",
        application_email: j.application_email ?? "",
        deadline_at: j.deadline_at ? j.deadline_at.slice(0, 16) : "",
        expires_at: j.expires_at ? j.expires_at.slice(0, 16) : "",
        moderation_notes: m.moderation_notes ?? "",
      });
    }
  }, [jobQ.data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const buildPayload = () => ({
    id: isNew ? undefined : id,
    employer_id: form.employer_id,
    title_sv: form.title_sv.trim() || null,
    title_en: form.title_en.trim() || null,
    description_sv: form.description_sv || null,
    description_en: form.description_en || null,
    family_id: form.family_id || null,
    profession_slug: form.profession_slug.trim() || null,
    location_text: form.location_text.trim() || null,
    country: form.country.trim() || null,
    application_method: form.application_method,
    application_url: form.application_url.trim() || null,
    application_email: form.application_email.trim() || null,
    deadline_at: form.deadline_at ? new Date(form.deadline_at).toISOString() : null,
    expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    moderation_notes: form.moderation_notes || null,
  });

  const save = useMutation({
    mutationFn: async () => saveFn({ data: buildPayload() as any }),
    onSuccess: (res) => {
      setError(null);
      setMessage("Saved.");
      qc.invalidateQueries({ queryKey: ["admin", "jobs"] });
      qc.invalidateQueries({ queryKey: ["admin", "job"] });
      if (isNew) navigate({ to: "/admin/jobs/$id", params: { id: res.id } });
    },
    onError: (e: Error) => {
      setMessage(null);
      setError(e.message);
    },
  });

  const transition = useMutation({
    mutationFn: async (action: "submit" | "publish" | "reject" | "archive" | "unpublish") =>
      transitionFn({ data: { id, action, moderation_notes: form.moderation_notes || null } }),
    onSuccess: () => {
      setError(null);
      setMessage("Status updated.");
      qc.invalidateQueries({ queryKey: ["admin", "jobs"] });
      qc.invalidateQueries({ queryKey: ["admin", "job", id] });
    },
    onError: (e: Error) => {
      setMessage(null);
      setError(e.message);
    },
  });

  const currentStatus = (jobQ.data?.job as any)?.status ?? "draft";

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Link to="/admin/jobs" className="text-sm text-primary hover:underline">
          ← Back to jobs
        </Link>
        {!isNew && <Badge variant="outline">{currentStatus}</Badge>}
      </div>

      {!isNew && jobQ.isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {!isNew && jobQ.isError && (
        <p className="text-sm text-destructive">{(jobQ.error as Error).message}</p>
      )}

      {(isNew || jobQ.data) && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div>
            <Label>Employer *</Label>
            <Select value={form.employer_id} onValueChange={(v) => set("employer_id", v)}>
              <SelectTrigger><SelectValue placeholder="Choose employer" /></SelectTrigger>
              <SelectContent>
                {(employers.data ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Title (SV)</Label>
              <Input value={form.title_sv} onChange={(e) => set("title_sv", e.target.value)} />
            </div>
            <div>
              <Label>Title (EN)</Label>
              <Input value={form.title_en} onChange={(e) => set("title_en", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Family</Label>
              <Select value={form.family_id} onValueChange={(v) => set("family_id", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {FAMILY_IDS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profession slug</Label>
              <Input
                value={form.profession_slug}
                onChange={(e) => set("profession_slug", e.target.value)}
                placeholder="e.g. security-officer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Location</Label>
              <Input value={form.location_text} onChange={(e) => set("location_text", e.target.value)} />
            </div>
            <div>
              <Label>Country (ISO 2)</Label>
              <Input value={form.country} onChange={(e) => set("country", e.target.value.toUpperCase())} maxLength={2} />
            </div>
          </div>

          <div>
            <Label>Description (SV)</Label>
            <Textarea rows={5} value={form.description_sv} onChange={(e) => set("description_sv", e.target.value)} />
          </div>
          <div>
            <Label>Description (EN)</Label>
            <Textarea rows={5} value={form.description_en} onChange={(e) => set("description_en", e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>Application method</Label>
              <Select
                value={form.application_method}
                onValueChange={(v) => set("application_method", v as any)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">external</SelectItem>
                  <SelectItem value="email">email</SelectItem>
                  <SelectItem value="unavailable">unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Application URL</Label>
              <Input value={form.application_url} onChange={(e) => set("application_url", e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <Label>Application email</Label>
              <Input value={form.application_email} onChange={(e) => set("application_email", e.target.value)} placeholder="apply@…" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Deadline</Label>
              <Input type="datetime-local" value={form.deadline_at} onChange={(e) => set("deadline_at", e.target.value)} />
            </div>
            <div>
              <Label>Expires</Label>
              <Input type="datetime-local" value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Moderation notes (internal only)</Label>
            <Textarea
              rows={3}
              value={form.moderation_notes}
              onChange={(e) => set("moderation_notes", e.target.value)}
              placeholder="Never shown to candidates or employers."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-green-700">{message}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending || !form.employer_id}>
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
            {!isNew && (
              <>
                {currentStatus === "draft" && (
                  <Button type="button" variant="secondary"
                    onClick={() => transition.mutate("submit")} disabled={transition.isPending}>
                    Submit for review
                  </Button>
                )}
                {(currentStatus === "draft" || currentStatus === "pending_review") && (
                  <Button type="button"
                    onClick={() => transition.mutate("publish")} disabled={transition.isPending}>
                    Publish
                  </Button>
                )}
                {(currentStatus === "pending_review" || currentStatus === "draft") && (
                  <Button type="button" variant="destructive"
                    onClick={() => transition.mutate("reject")} disabled={transition.isPending}>
                    Reject
                  </Button>
                )}
                {currentStatus === "published" && (
                  <Button type="button" variant="outline"
                    onClick={() => transition.mutate("unpublish")} disabled={transition.isPending}>
                    Unpublish (to draft)
                  </Button>
                )}
                {currentStatus !== "archived" && (
                  <Button type="button" variant="outline"
                    onClick={() => transition.mutate("archive")} disabled={transition.isPending}>
                    Archive
                  </Button>
                )}
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}