import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { acceptSecurityInvitation } from "@/lib/security-work/collaboration/functions";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useSecurityIdentity } from "../context";
import { TextField, WorkButton, panelClass } from "../ui";

/** The code is typed in, never carried in a URL, so it cannot reach page analytics. */
export function AcceptInvitation() {
  const { lang } = useT();
  const l = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const user = useSecurityIdentity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accept = useServerFn(acceptSecurityInvitation);
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={`${panelClass} space-y-3`}
      data-testid="sw-accept-invitation"
      onSubmit={async (event) => {
        event.preventDefault();
        setFailed(false);
        setBusy(true);
        try {
          const result = await accept({ data: { code: code.trim() } });
          if (!result.ok) return setFailed(true);
          await queryClient.invalidateQueries({ queryKey: securityWorkKeys.entry(user.id) });
          await navigate({
            to: "/security-work/$workspaceId",
            params: { workspaceId: result.data.workspaceId },
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-display text-lg font-semibold">
        {l("Har du fått en inbjudningskod?", "Have you been given an invitation code?")}
      </h2>
      <TextField
        label={l("Inbjudningskod", "Invitation code")}
        value={code}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setCode(event.target.value)}
        hint={l(
          "Koden gäller bara för den e-postadress du är inloggad med.",
          "The code works only for the e-mail address you are signed in with.",
        )}
      />
      {failed && (
        <p role="alert" className="text-sm">
          {l(
            "Koden kunde inte användas. Den kan vara fel, ha gått ut, ha återkallats eller gälla en annan e-postadress.",
            "The code could not be used. It may be wrong, expired, revoked or meant for another e-mail address.",
          )}
        </p>
      )}
      <WorkButton type="submit" disabled={busy || !/^[0-9a-f]{64}$/i.test(code.trim())}>
        {l("Gå med i arbetsytan", "Join the workspace")}
      </WorkButton>
    </form>
  );
}
