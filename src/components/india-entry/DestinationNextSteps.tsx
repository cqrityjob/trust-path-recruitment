import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { readIndiaSetup, type IndiaSetupState } from "@/lib/india-entry/setup.functions";
import { DestinationChecklist } from "./DestinationChecklist";

/**
 * The destination checklist on the career home — for a holder who CHOSE a
 * destination and already holds a current credential, and for nobody else.
 *
 * Renders nothing while loading, on a failed read, with no destination
 * chosen, or with no current credential: it is an offer, not a section, like
 * LinkEarlierResult beside it. Reads the holder's own rows only.
 */
export function DestinationNextSteps() {
  const { lang } = useT();
  const read = useServerFn(readIndiaSetup);
  const [state, setState] = useState<IndiaSetupState | null>(null);
  useEffect(() => {
    let active = true;
    read()
      .then((s) => active && setState(s))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [read]);
  const destinations = state?.preferences?.destinations ?? [];
  if (!state || state.credentials.length === 0) return null;
  if (!destinations.some((d) => d === "AE-DU" || d === "AE" || d === "GB")) return null;
  return (
    <div className="mt-8" data-career-destination-next-steps>
      <DestinationChecklist
        lang={lang === "sv" ? "sv" : "en"}
        destinations={destinations}
        credentials={state.credentials}
      />
    </div>
  );
}
