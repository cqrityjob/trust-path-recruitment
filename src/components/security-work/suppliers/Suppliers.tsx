import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { saveSecuritySupplierProfile } from "@/lib/security-work/suppliers/functions";
import { useSecurityWorkspace } from "../context";
import {
  EmptyState,
  Field,
  LoadingState,
  PageHeading,
  TextField,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
} from "../ui";
import { useSupplierText, useSupplierWrite, useSuppliers } from "./supplier-ui";

export function SecuritySuppliers() {
  const query = useSuppliers();
  const { l, error } = useSupplierText();
  const { workspace, canEdit, user } = useSecurityWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [existing, setExisting] = useState("");
  const [owner, setOwner] = useState(user.id);
  const save = useSupplierWrite(useServerFn(saveSecuritySupplierProfile));
  if (query.isPending) return <LoadingState />;
  if (!query.data) return <WorkError code={query.error?.message ?? "SAVE_FAILED"} />;
  const data = query.data;
  const withoutProfile = data.suppliers.filter((s) => !s.profile);
  const listed = data.suppliers.filter((s) => s.profile);
  return (
    <div className="space-y-6" data-testid="sw-suppliers">
      <PageHeading
        title={l("Leverantörer", "Suppliers")}
        body={l(
          "Leverantörer som påverkar er säkerhet: vem som ansvarar internt, vad de levererar, vilka krav som gäller och vad som väntar på svar eller verifiering.",
          "Suppliers that affect your security: who is responsible internally, what they deliver, which requirements apply and what awaits a response or verification.",
        )}
      />
      {listed.length === 0 ? (
        <EmptyState
          title={l("Ingen leverantör registrerad ännu", "No supplier registered yet")}
          body={l(
            "Lägg till en leverantör nedan. Sedan kan ni koppla avtal och krav, och skicka begäranden från era åtgärder.",
            "Add a supplier below. Then you can link contracts and requirements, and send requests from your actions.",
          )}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="sw-supplier-list">
          {listed.map((s) => (
            <li key={s.asset.id} className={`${panelClass} space-y-2`} data-testid="sw-supplier">
              <Link
                to="/security-work/$workspaceId/suppliers/$assetId"
                params={{ workspaceId: workspace.id, assetId: s.asset.id }}
                className="font-display text-lg font-semibold text-primary underline"
              >
                {s.asset.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {l("Ansvarig", "Owner")}:{" "}
                {data.members.find((m) => m.user_id === s.profile?.internal_owner_id)?.label ??
                  l("ingen utsedd", "none assigned")}
                {s.profile?.status === "ended" && ` · ${l("avslutad", "ended")}`}
              </p>
              <dl className="grid grid-cols-2 gap-1 text-sm">
                <dt className="text-muted-foreground">{l("Öppna begäranden", "Open requests")}</dt>
                <dd>{s.open}</dd>
                <dt className="text-muted-foreground">
                  {l("Försenade svar", "Overdue responses")}
                </dt>
                <dd
                  className={s.overdue ? "font-semibold text-destructive" : ""}
                  data-testid="sw-supplier-overdue"
                >
                  {s.overdue}
                </dd>
                <dt className="text-muted-foreground">
                  {l("Väntar på er verifiering", "Awaiting your verification")}
                </dt>
                <dd>{s.awaitingVerification}</dd>
                <dt className="text-muted-foreground">{l("Invändningar", "Objections")}</dt>
                <dd>{s.objections}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className={`${panelClass} space-y-3`}
          data-testid="sw-add-supplier"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                workspaceId: workspace.id,
                assetId: existing || null,
                name: existing ? "" : name,
                internalOwnerId: owner,
                contactRoute: "",
                services: "",
                status: "active",
              },
              {
                onSuccess: (profile) =>
                  void navigate({
                    to: "/security-work/$workspaceId/suppliers/$assetId",
                    params: {
                      workspaceId: workspace.id,
                      assetId: (profile as { asset_id: string }).asset_id,
                    },
                  }),
              },
            );
          }}
        >
          <h2 className="font-display text-lg font-semibold">
            {l("Lägg till leverantör", "Add a supplier")}
          </h2>
          {withoutProfile.length > 0 && (
            <Field
              label={l("Befintligt skyddsvärde av typen leverantör", "Existing supplier asset")}
            >
              {(id) => (
                <select
                  id={id}
                  className={selectClass}
                  value={existing}
                  onChange={(e) => setExisting(e.target.value)}
                >
                  <option value="">{l("— Ny leverantör —", "— New supplier —")}</option>
                  {withoutProfile.map((s) => (
                    <option key={s.asset.id} value={s.asset.id}>
                      {s.asset.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {!existing && (
            <TextField
              label={l("Leverantörens namn", "Supplier name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <Field label={l("Intern ansvarig", "Internal owner")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                {data.members
                  .filter((m) => m.role !== "viewer")
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.label}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <WorkError code={save.error?.message} message={error(save.error?.message)} />
          <WorkButton type="submit" disabled={save.isPending}>
            {l("Lägg till", "Add")}
          </WorkButton>
        </form>
      )}
    </div>
  );
}
