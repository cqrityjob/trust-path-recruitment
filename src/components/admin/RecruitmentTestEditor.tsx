import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  listRecruitmentContent,
  previewRecruitmentContent,
  saveRecruitmentDraft,
} from "@/lib/security-competency/assessment-authoring.functions";

/** Author-only composition over existing governed item versions. Every save
 * makes a new draft; the historical assessment and its items stay pinned. */
export function RecruitmentTestEditor() {
  const { lang } = useT();
  const sv = lang !== "en";
  const list = useServerFn(listRecruitmentContent);
  const preview = useServerFn(previewRecruitmentContent);
  const save = useServerFn(saveRecruitmentDraft);
  const qc = useQueryClient();
  const versions = useQuery({ queryKey: ["admin", "recruitment-content"], queryFn: () => list() });
  const [versionId, setVersionId] = useState("");
  const [notes, setNotes] = useState("");
  const [createNew, setCreateNew] = useState(false);
  const [slug, setSlug] = useState("");
  const [nameSv, setNameSv] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const content = useQuery({
    queryKey: ["admin", "recruitment-content", versionId],
    queryFn: () => preview({ data: { versionId } }),
    enabled: !!versionId,
  });
  const items = (content.data ?? [])
    .flatMap((f) => f.scp_form_items)
    .sort((a, b) => a.display_order - b.display_order);
  useEffect(() => {
    if (content.data)
      setSelected([
        ...new Set(content.data.flatMap((f) => f.scp_form_items.map((i) => i.item_version_id))),
      ]);
  }, [content.data]);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          sourceVersionId: versionId,
          notes,
          itemVersionIds: selected,
          newSlug: createNew ? slug : null,
          nameSv: createNew ? nameSv : null,
          nameEn: createNew ? nameEn : null,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "recruitment-content"] });
    },
  });
  return (
    <section className="my-8 rounded-xl border p-5" data-testid="recruitment-test-editor">
      <h2 className="text-xl font-semibold">
        {sv
          ? "Rekryteringstester – innehåll och versioner"
          : "Recruitment tests — content and versions"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {sv
          ? "Förhandsgranska innehåll, välj frågor och spara ett nytt utkast. Redan tilldelade tester behåller sin version. Nya utkast kräver separat innehållsgranskning och godkänd tillgänglighet innan de kan skickas."
          : "Preview content, select questions and save a new draft. Assigned tests retain their version. New drafts require separate content review and approved availability before assignment."}
      </p>
      {versions.isLoading && <p>{sv ? "Laddar…" : "Loading…"}</p>}
      {versions.isError && (
        <p role="alert">
          {sv
            ? "Innehållsbehörighet krävs, eller testbanken kunde inte läsas."
            : "Content author access is required, or the test library could not be loaded."}
        </p>
      )}
      <label className="mt-4 block">
        {sv ? "Test och version att utgå från" : "Source test and version"}
        <select
          className="mt-1 w-full rounded border p-2"
          value={versionId}
          disabled={mutation.isPending}
          onChange={(e) => {
            setVersionId(e.target.value);
            setSelected([]);
            mutation.reset();
          }}
        >
          <option value="">{sv ? "Välj testversion" : "Choose test version"}</option>
          {(versions.data ?? []).flatMap((d) =>
            d.scp_assessment_versions.map((v) => (
              <option key={v.id} value={v.id}>
                {sv ? d.name_sv : d.name_en} · v{v.version_number} · {v.content_status} ·{" "}
                {v.validation_status}
              </option>
            )),
          )}
        </select>
      </label>
      {content.isError && (
        <p role="alert">
          {sv ? "Förhandsgranskningen kunde inte läsas." : "The preview could not be loaded."}
        </p>
      )}
      {versionId && content.isSuccess && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!mutation.isPending) mutation.mutate();
          }}
          className="mt-4 space-y-4"
        >
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={createNew}
              onChange={(e) => setCreateNew(e.target.checked)}
            />
            {sv ? "Skapa ett nytt test från detta innehåll" : "Create a new test from this content"}
          </label>
          {createNew && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["slug", slug, setSlug],
                ["Namn (sv)", nameSv, setNameSv],
                ["Name (en)", nameEn, setNameEn],
              ].map(([label, value, setter]) => (
                <label key={String(label)}>
                  {String(label)}
                  <input
                    required
                    maxLength={label === "slug" ? 80 : 200}
                    pattern={label === "slug" ? "[a-z0-9][a-z0-9-]{2,79}" : undefined}
                    className="w-full rounded border p-2"
                    value={String(value)}
                    onChange={(e) => (setter as (s: string) => void)(e.target.value)}
                  />
                </label>
              ))}
            </div>
          )}
          <label className="block">
            {sv ? "Versionsanteckning" : "Version notes"}
            <textarea
              maxLength={10000}
              className="mt-1 w-full rounded border p-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <fieldset>
            <legend className="font-semibold">
              {sv ? "Frågor och förhandsgranskning" : "Questions and preview"}
            </legend>
            {items.map((i) => (
              <label
                key={i.item_version_id}
                className="my-2 flex items-start gap-3 rounded border p-3"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(i.item_version_id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, i.item_version_id]
                        : prev.filter((id) => id !== i.item_version_id),
                    )
                  }
                />
                <span>
                  {i.scp_item_versions?.scp_item_texts
                    .filter((text) => text.language === (sv ? "sv-SE" : "en-GB"))
                    .map((text) => (
                      <span key={text.language} className="block">
                        <span className="block text-sm text-muted-foreground">{text.scenario}</span>
                        {text.prompt}
                      </span>
                    ))}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-sm">
            {sv
              ? "Urvalet sparas som ett nytt utkast med befintliga, versionslåsta frågor. Ändra frågetexter i den styrda innehållsprocessen; tilldelat innehåll skrivs aldrig över här."
              : "The selection is saved as a new draft with existing versioned questions. Question text changes follow the governed content process; assigned content is never overwritten here."}
          </p>
          <button
            className="min-h-11 rounded bg-accent px-4 text-accent-foreground disabled:opacity-50"
            disabled={mutation.isPending || !selected.length}
          >
            {sv ? "Spara som ny utkastversion" : "Save as new draft version"}
          </button>
          {mutation.isError && (
            <p role="alert">
              {sv
                ? "Utkastet kunde inte sparas. Kontrollera innehållsbehörighet och att namnet är unikt."
                : "The draft could not be saved. Check author access and that the name is unique."}
            </p>
          )}
          {mutation.isSuccess && (
            <p role="status">
              {sv
                ? "Ny utkastversion sparad. Ingen publicering eller utökad tillgång har gjorts."
                : "New draft version saved. Nothing has been published or granted additional access."}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
