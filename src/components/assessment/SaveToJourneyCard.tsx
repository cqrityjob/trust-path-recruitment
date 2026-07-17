import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { saveAssessmentRun, setTargetProfession } from "@/lib/journey/journey.functions";

interface Props {
  professionId: string;
  professionTitle: string;
  resultSummary: Record<string, unknown>;
  lang: "sv" | "en";
}

export function SaveToJourneyCard({ professionId, professionTitle, resultSummary, lang }: Props) {
  const saveRun = useServerFn(saveAssessmentRun);
  const setTarget = useServerFn(setTargetProfession);
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useState(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    return 0;
  });

  const mut = useMutation({
    mutationFn: async () => {
      const run = await saveRun({ data: { locale: lang, resultSummary } });
      const target = await setTarget({ data: { professionId, isPrimary: true, sourceRunId: run.runId } });
      return target.targetId;
    },
    onSuccess: (targetId) => {
      navigate({ to: "/journey/$targetId", params: { targetId } });
    },
    onError: (e: any) => setErr(e?.message ?? "Failed to save"),
  });

  if (signedIn === false) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-5">
        <p className="text-sm font-semibold text-foreground">
          {lang === "sv" ? "Spara resultatet i Career Journey" : "Save your result in Career Journey"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {lang === "sv"
            ? "Logga in för att spara resultatet, välja målyrke och skapa en handlingsplan."
            : "Sign in to save your result, set a target profession and build a plan."}
        </p>
        <Link
          to="/auth"
          className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {lang === "sv" ? "Logga in" : "Sign in"}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/40 p-5">
      <p className="text-sm font-semibold text-foreground">
        {lang === "sv" ? "Sätt som mål och spara" : "Set as target and save"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {lang === "sv"
          ? `Vi sparar det här resultatet och sätter ${professionTitle} som ditt målyrke.`
          : `We save this result and set ${professionTitle} as your target profession.`}
      </p>
      <button
        type="button"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {mut.isPending
          ? lang === "sv" ? "Sparar…" : "Saving…"
          : lang === "sv" ? "Spara och öppna plan" : "Save and open plan"}
      </button>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
