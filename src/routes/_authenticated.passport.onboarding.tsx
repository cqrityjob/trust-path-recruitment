import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { getMyPassport } from "@/lib/security-passport/passport.functions";
import { ensureFirstRunPassport } from "@/lib/security-passport/first-run.functions";
import {
  CreatePassportScreen,
  FirstRunLoading,
  FirstRunLoadError,
} from "@/components/security-passport/FirstRunJourney";
import { invalidatePassportAndCareer } from "@/lib/security-passport/refresh";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export const Route = createFileRoute("/_authenticated/passport/onboarding")({
  ssr: false,
  component: FirstRunRoute,
});
function FirstRunRoute() {
  const { lang, pt } = usePassportCopy();
  const load = useServerFn(getMyPassport);
  const create = useServerFn(ensureFirstRunPassport);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [state, setState] = useState<"loading" | "error" | "create" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void load()
      .then((result) => {
        if (active) setState(result.profile ? "ready" : "create");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [load, attempt]);
  async function createPassport() {
    if (busy) return;
    if (creating.current) return;
    creating.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await create({ data: undefined });
      await invalidatePassportAndCareer(qc);
      await navigate({ to: "/passport/credentials/new" });
    } catch {
      setFailed(true);
    } finally {
      creating.current = false;
      setBusy(false);
    }
  }
  if (state === "loading") return <FirstRunLoading />;
  if (state === "error")
    return (
      <FirstRunLoadError
        onRetry={() => {
          setState("loading");
          setAttempt((v) => v + 1);
        }}
      />
    );
  if (state === "create")
    return (
      <CreatePassportScreen
        busy={busy}
        error={failed ? pt("fr.error.createFailed") : null}
        onCreate={() => void createPassport()}
      />
    );
  return (
    <section className="mx-auto max-w-2xl space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">
        {lang === "sv" ? "Lägg till ett godkänt yrkesbevis" : "Add an approved credential"}
      </h2>
      <p>
        {lang === "sv"
          ? "Välj ur CQrityjobs katalog och ange dina personliga bevisuppgifter."
          : "Choose from CQrityjob’s catalogue and enter your personal credential details."}
      </p>
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground"
        to="/passport/credentials/new"
      >
        {lang === "sv" ? "Öppna katalogen" : "Open catalogue"}
      </Link>
    </section>
  );
}
