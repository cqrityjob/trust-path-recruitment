import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { setSecurityMemberSharing } from "@/lib/security-work/suppliers/functions";
import { useT } from "@/i18n/context";
import {
  createSecurityInvitation,
  getSecurityTeam,
  revokeSecurityInvitation,
  setSecurityMemberRole,
} from "@/lib/security-work/collaboration/functions";
import type { Team } from "@/lib/security-work/collaboration/services";
import {
  getOperatingContext,
  saveOperatingProfile,
  saveRoleFocus,
} from "@/lib/security-work/operating-context/functions";
import {
  confirmedOnly,
  decisionCriticalGaps,
  emptyProfile,
  type OperatingProfile,
  type Provenance,
} from "@/lib/security-work/operating-context/schema";
import type { OperatingContext } from "@/lib/security-work/operating-context/services";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useSecurityWorkspace } from "../context";
import { useWorkText } from "../analysis-ui";
import {
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  selectClass,
  splitLines,
} from "../ui";

const contextKey = (userId: string, workspaceId: string) =>
  [...securityWorkKeys.workspace(userId, workspaceId), "operating-context"] as const;
export const teamKey = (userId: string, workspaceId: string) =>
  [...securityWorkKeys.workspace(userId, workspaceId), "team"] as const;

export function useTeam() {
  const { user, workspace } = useSecurityWorkspace();
  const read = useServerFn(getSecurityTeam);
  return useQuery({
    queryKey: teamKey(user.id, workspace.id),
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data as Team;
    },
  });
}

export function SecurityOrganisation() {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  return (
    <div className="space-y-8" data-testid="sw-organisation">
      <PageHeading
        title={l("Er verksamhet", "Your organisation")}
        body={l(
          "Det som gör analyserna relevanta för just er: verksamhet, platser, kritiska tjänster, metod och vem som beslutar. Fyll i det som behövs nu – resten frågar uppdragen efter när det spelar roll.",
          "What makes the analyses relevant to you: activities, places, critical services, method and who decides. Fill in what is needed now – missions ask for the rest when it matters.",
        )}
      />
      <OperatingProfileSection />
      <RoleFocusSection />
      <TeamSection />
      <section className={`${panelClass} space-y-3`}>
        <h2 className="font-display text-lg font-semibold">
          {l("Säkerhetsprogram", "Security programme")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {l(
            "Mandat, skyddsvärda tillgångar och nuläge finns kvar som grund för arbetet.",
            "Mandate, protected assets and baseline remain the foundation of the work.",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["/mandate", l("Mandat", "Mandate")],
              ["/assets", l("Skyddsvärda tillgångar", "Protected assets")],
              ["/baseline", l("Nuläge", "Baseline")],
              ["/plan", l("90-dagarsplan", "90-day plan")],
              ["/settings", l("Bevakningsprofil", "Monitoring profile")],
            ] as const
          ).map(([segment, label]) => (
            <WorkButton key={segment} asChild variant="outline">
              <Link
                to={`/security-work/$workspaceId${segment}`}
                params={{ workspaceId: workspace.id }}
              >
                {label}
              </Link>
            </WorkButton>
          ))}
        </div>
      </section>
    </div>
  );
}

const listFields = [
  "sectors",
  "activities",
  "criticalServices",
  "technologies",
  "suppliers",
] as const;

function OperatingProfileSection() {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const queryClient = useQueryClient();
  const read = useServerFn(getOperatingContext);
  const save = useServerFn(saveOperatingProfile);
  const query = useQuery({
    queryKey: contextKey(user.id, workspace.id),
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data as OperatingContext;
    },
  });
  const [profile, setProfile] = useState<OperatingProfile>(emptyProfile);
  const [provenance, setProvenance] = useState<Provenance>({});
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    const version = data.current?.version ?? 0;
    if (loadedVersion === version) return;
    setLoadedVersion(version);
    if (data.current) {
      setProfile(data.current.profile);
      setProvenance(data.current.provenance);
    } else {
      // Offered, not adopted: each prefilled value waits for a person's confirmation.
      setProfile({ ...emptyProfile(), ...data.prefill.profile });
      setProvenance(data.prefill.provenance);
    }
  }, [query.data, loadedVersion]);
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return <WorkError code={query.error.message} onRetry={() => void query.refetch()} />;
  const data = query.data;
  const label: Record<string, string> = {
    organisationDescription: l("Beskrivning av verksamheten", "Description of the organisation"),
    sectors: l("Sektorer", "Sectors"),
    activities: l("Verksamheter", "Business activities"),
    countries: l("Länder (ISO-kod, t.ex. SE)", "Countries (ISO code, e.g. SE)"),
    criticalServices: l("Kritiska tjänster", "Critical services"),
    technologies: l("Viktiga tekniker och system", "Key technologies and systems"),
    suppliers: l("Viktiga leverantörer och beroenden", "Key suppliers and dependencies"),
    riskMethod: l("Vem som får acceptera risker", "Who may accept risks"),
    monitoring: l("Bevakningsämnen", "Monitoring topics"),
  };
  const origin = (field: string) => {
    const entry = provenance[field];
    if (!entry || entry.origin === "user") return null;
    const from =
      entry.origin === "mandate"
        ? l("mandatet", "the mandate")
        : entry.origin === "assets"
          ? l("tillgångsregistret", "the asset register")
          : l("bevakningsprofilen", "the monitoring profile");
    return { from, confirmed: entry.confirmed };
  };
  const touch = (field: string) =>
    setProvenance((old) =>
      old[field] && old[field].origin !== "user" && old[field].confirmed
        ? old
        : { ...old, [field]: { origin: "user", confirmed: true } },
    );
  const confirm = (field: string, value: boolean) =>
    setProvenance((old) => ({ ...old, [field]: { ...old[field], confirmed: value } }));
  const gaps = decisionCriticalGaps(confirmedOnly(profile, provenance).profile);
  const submit = async () => {
    setError(null);
    setSaved(false);
    const result = await save({
      data: {
        workspaceId: workspace.id,
        expectedVersion: data.current?.version ?? 0,
        profile,
        provenance,
        changeNote: "",
      },
    });
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setSaved(true);
    setLoadedVersion(null);
    await queryClient.invalidateQueries({ queryKey: contextKey(user.id, workspace.id) });
  };
  const provenanceNote = (field: string) => {
    const note = origin(field);
    if (!note) return null;
    return (
      <label
        className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground"
        data-testid={`sw-prefill-${field}`}
      >
        <input
          type="checkbox"
          className="size-4"
          checked={note.confirmed}
          disabled={!canEdit}
          onChange={(event) => confirm(field, event.target.checked)}
        />
        {l("Hämtat från ", "Taken from ")}
        {note.from}
        {" – "}
        {note.confirmed
          ? l("bekräftat", "confirmed")
          : l("bekräfta för att spara", "confirm to keep it")}
      </label>
    );
  };
  return (
    <section
      className={`${panelClass} space-y-5`}
      data-testid="sw-operating-profile"
      aria-labelledby="sw-op-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sw-op-heading" className="font-display text-lg font-semibold">
          {l("Verksamhetsprofil", "Operating profile")}
        </h2>
        <span className="text-xs text-muted-foreground" data-testid="sw-profile-version">
          {data.current
            ? `${l("Version", "Version")} ${data.current.version} · ${formatDate(data.current.createdAt, lang)}`
            : l("Inte sparad ännu", "Not saved yet")}
        </span>
      </div>
      {data.unreadable && (
        <p role="alert" className="text-sm">
          {l(
            "Den senaste versionen är sparad i ett format som den här versionen av tjänsten inte kan läsa. Den visas inte och skrivs inte över utan att du sparar en ny version.",
            "The latest version is stored in a format this version of the service cannot read. It is not shown and is not overwritten unless you save a new version.",
          )}
        </p>
      )}
      {gaps.length > 0 && (
        <p className="text-sm" data-testid="sw-profile-gaps">
          {l("Viktigast att fylla i: ", "Most important to fill in: ")}
          {gaps.map((gap) => label[gap].toLowerCase()).join(", ")}
        </p>
      )}
      <div className="space-y-1">
        <TextAreaField
          label={label.organisationDescription}
          value={profile.organisationDescription}
          disabled={!canEdit}
          maxLength={4000}
          onChange={(event) => {
            setProfile({ ...profile, organisationDescription: event.target.value });
            touch("organisationDescription");
          }}
        />
        {provenanceNote("organisationDescription")}
      </div>
      <div className="space-y-1">
        <TextField
          label={label.countries}
          value={profile.countries.join(", ")}
          disabled={!canEdit}
          onChange={(event) => {
            setProfile({
              ...profile,
              countries: event.target.value
                .split(/[,\s]+/)
                .map((value) => value.trim().toUpperCase())
                .filter((value) => /^[A-Z]{2}$/.test(value)),
            });
            touch("countries");
          }}
        />
        {provenanceNote("countries")}
      </div>
      {listFields.map((field) => (
        <div key={field} className="space-y-1">
          <TextAreaField
            label={label[field]}
            hint={l("En per rad.", "One per line.")}
            value={profile[field].join("\n")}
            disabled={!canEdit}
            onChange={(event) => {
              setProfile({ ...profile, [field]: splitLines(event.target.value) });
              touch(field);
            }}
          />
          {provenanceNote(field)}
        </div>
      ))}
      <TextField
        label={label.riskMethod}
        value={profile.riskMethod?.acceptanceAuthority ?? ""}
        disabled={!canEdit}
        onChange={(event) => {
          setProfile({
            ...profile,
            riskMethod: {
              method: profile.riskMethod?.method ?? "rsa",
              likelihoodScale: profile.riskMethod?.likelihoodScale ?? "",
              consequenceScale: profile.riskMethod?.consequenceScale ?? "",
              horizon: profile.riskMethod?.horizon ?? "",
              acceptanceAuthority: event.target.value,
            },
          });
          touch("riskMethod");
        }}
      />
      <WorkError code={error} />
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <WorkButton onClick={() => void submit()} data-testid="sw-profile-save">
            {l("Spara ny version", "Save a new version")}
          </WorkButton>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              {l("Sparat som ny version.", "Saved as a new version.")}
            </span>
          )}
        </div>
      )}
      {data.history.length > 1 && (
        <details>
          <summary className="min-h-11 cursor-pointer text-sm">
            {l("Tidigare versioner", "Earlier versions")}
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {data.history.map((entry) => (
              <li key={entry.version}>
                {l("Version", "Version")} {entry.version} ·{" "}
                {formatDate(entry.createdAt, lang, true)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RoleFocusSection() {
  const l = useWorkText();
  const { workspace, user } = useSecurityWorkspace();
  const read = useServerFn(getOperatingContext);
  const save = useServerFn(saveRoleFocus);
  const query = useQuery({
    queryKey: contextKey(user.id, workspace.id),
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data as OperatingContext;
    },
  });
  const [focus, setFocus] = useState<string | null>(null);
  const value = focus ?? query.data?.roleFocus ?? "combined";
  return (
    <section className={`${panelClass} space-y-3`} data-testid="sw-role-focus">
      <h2 className="font-display text-lg font-semibold">{l("Din vy", "Your view")}</h2>
      <p className="text-sm text-muted-foreground">
        {l(
          "Styr bara vad som visas först för dig. Det ger inga behörigheter.",
          "Only changes what you see first. It grants no permissions.",
        )}
      </p>
      <select
        aria-label={l("Rollfokus", "Role focus")}
        className={selectClass}
        value={value}
        onChange={async (event) => {
          const roleFocus = event.target.value as "combined";
          setFocus(roleFocus);
          await save({ data: { workspaceId: workspace.id, roleFocus } });
        }}
      >
        <option value="combined">{l("Kombinerad", "Combined")}</option>
        <option value="corporate_security">{l("Företagssäkerhet", "Corporate security")}</option>
        <option value="ciso">{l("CISO", "CISO")}</option>
        <option value="coordinator">{l("Säkerhetssamordnare", "Security coordinator")}</option>
        <option value="event_lead">{l("Evenemangsansvarig", "Event lead")}</option>
      </select>
    </section>
  );
}

function TeamSection() {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace, user } = useSecurityWorkspace();
  const queryClient = useQueryClient();
  const team = useTeam();
  const invite = useServerFn(createSecurityInvitation);
  const revoke = useServerFn(revokeSecurityInvitation);
  const setRole = useServerFn(setSecurityMemberRole);
  const setSharing = useServerFn(setSecurityMemberSharing);
  const [email, setEmail] = useState("");
  const [role, setRoleChoice] = useState<"editor" | "viewer">("viewer");
  const [code, setCode] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: teamKey(user.id, workspace.id) });
  if (team.isPending) return <LoadingState />;
  if (team.isError)
    return <WorkError code={team.error.message} onRetry={() => void team.refetch()} />;
  const data = team.data;
  return (
    <section
      className={`${panelClass} space-y-4`}
      data-testid="sw-team"
      aria-labelledby="sw-team-heading"
    >
      <h2 id="sw-team-heading" className="font-display text-lg font-semibold">
        {l("Team", "Team")}
      </h2>
      <ul className="space-y-2 text-sm">
        {data.members.map((member) => (
          <li
            key={member.user_id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2"
            data-testid="sw-team-member"
          >
            <span className="min-w-0 break-all">
              {member.email}
              {member.user_id === user.id ? l(" (du)", " (you)") : ""}
              <span className="text-muted-foreground">
                {" · "}
                {member.role === "owner"
                  ? l("Ägare", "Owner")
                  : member.role === "editor"
                    ? l("Redigerare", "Editor")
                    : l("Läsare", "Viewer")}
                {member.can_approve ? l(" · får godkänna", " · may approve") : ""}
                {member.can_share_external
                  ? l(" · får dela externt", " · may share externally")
                  : ""}
                {!member.active ? l(" · inaktiv", " · inactive") : ""}
              </span>
            </span>
            {data.canManage && member.user_id !== user.id && (
              <WorkButton
                variant="ghost"
                onClick={async () => {
                  setError(null);
                  const result = await setRole({
                    data: {
                      workspaceId: workspace.id,
                      userId: member.user_id,
                      role: member.role as "viewer",
                      canApprove: member.active ? false : member.can_approve,
                      active: !member.active,
                    },
                  });
                  if (!result.ok) setError(result.code);
                  await refresh();
                }}
              >
                {member.active ? l("Inaktivera", "Deactivate") : l("Återaktivera", "Reactivate")}
              </WorkButton>
            )}
            {data.canManage && member.active && member.role !== "viewer" && (
              <WorkButton
                variant="ghost"
                data-testid="sw-team-sharing"
                onClick={async () => {
                  setError(null);
                  const result = await setSharing({
                    data: {
                      workspaceId: workspace.id,
                      userId: member.user_id,
                      allowed: !member.can_share_external,
                    },
                  });
                  if (!result.ok) setError(result.code);
                  await refresh();
                }}
              >
                {member.can_share_external
                  ? l("Ta bort rätt att dela externt", "Remove external sharing right")
                  : l("Ge rätt att dela externt", "Grant external sharing right")}
              </WorkButton>
            )}
          </li>
        ))}
      </ul>
      {data.canManage && (
        <form
          className="space-y-3"
          data-testid="sw-invite"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setCode(null);
            const result = await invite({
              data: { workspaceId: workspace.id, requestId, email, role, canApprove: false },
            });
            if (!result.ok) return setError(result.code);
            setCode(result.data.code);
            setEmail("");
            setRequestId(crypto.randomUUID());
            await refresh();
          }}
        >
          <h3 className="text-sm font-semibold">{l("Bjud in en kollega", "Invite a colleague")}</h3>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <TextField
              label={l("E-postadress", "E-mail address")}
              type="email"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="space-y-2">
              <label htmlFor="sw-invite-role" className="block text-sm font-semibold">
                {l("Roll", "Role")}
              </label>
              <select
                id="sw-invite-role"
                className={selectClass}
                value={role}
                onChange={(event) => setRoleChoice(event.target.value as "viewer")}
              >
                <option value="viewer">{l("Läsare", "Viewer")}</option>
                <option value="editor">{l("Redigerare", "Editor")}</option>
              </select>
            </div>
          </div>
          <WorkButton type="submit">{l("Skapa inbjudan", "Create invitation")}</WorkButton>
          {code && (
            <div
              role="status"
              className="rounded-lg border border-border bg-secondary p-4 text-sm"
              data-testid="sw-invite-code"
            >
              <p className="font-semibold">
                {l("Inbjudningskod – visas bara nu", "Invitation code – shown only now")}
              </p>
              <p className="mt-1 break-all font-mono">{code}</p>
              <p className="mt-2 text-muted-foreground">
                {l(
                  "Ge koden till personen själv. Inget skickas från tjänsten. Personen loggar in med just den e-postadressen och anger koden under Mitt säkerhetsarbete.",
                  "Give the code to the person yourself. Nothing is sent by the service. They sign in with exactly that e-mail address and enter the code under My Security Work.",
                )}
              </p>
            </div>
          )}
          {(data.invitations ?? []).filter((entry) => !entry.accepted_at && !entry.revoked_at)
            .length > 0 && (
            <ul className="space-y-1 text-sm">
              {(data.invitations ?? [])
                .filter((entry) => !entry.accepted_at && !entry.revoked_at)
                .map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all">
                      {entry.email} · {l("gäller till", "valid until")}{" "}
                      {formatDate(entry.expires_at, lang)}
                    </span>
                    <WorkButton
                      variant="ghost"
                      onClick={async () => {
                        await revoke({
                          data: { workspaceId: workspace.id, invitationId: entry.id },
                        });
                        await refresh();
                      }}
                    >
                      {l("Återkalla", "Revoke")}
                    </WorkButton>
                  </li>
                ))}
            </ul>
          )}
        </form>
      )}
      <WorkError code={error} />
    </section>
  );
}
