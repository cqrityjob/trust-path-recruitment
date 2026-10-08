import { useCallback, useEffect, useRef, useState } from "react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type {
  EvidenceRecoveryResult,
  EvidenceUploadAttempt,
} from "@/lib/security-passport/evidence-upload-recovery";

import { EvidenceUploadRecoveryView } from "./EvidenceUploadRecoveryView";

export function EvidenceUploadRecoveryPanel({
  claimId = null,
  periodId = null,
  generation = 0,
  load,
  resume,
  cleanup,
  onResolved,
  onPendingChange,
}: {
  readonly claimId?: string | null;
  readonly periodId?: string | null;
  readonly generation?: number;
  readonly load: (input: {
    data: { claimId: string | null; periodId: string | null };
  }) => Promise<readonly EvidenceUploadAttempt[]>;
  readonly resume: (input: { data: { attemptId: string } }) => Promise<EvidenceRecoveryResult>;
  readonly cleanup: (input: { data: { attemptId: string } }) => Promise<EvidenceRecoveryResult>;
  readonly onResolved?: () => Promise<void>;
  readonly onPendingChange?: (pending: boolean) => void;
}) {
  const { lang } = usePassportCopy();
  const [attempts, setAttempts] = useState<readonly EvidenceUploadAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<EvidenceRecoveryResult["status"] | null>(null);
  const latest = useRef({ request: 0 });
  const reload = useCallback(async () => {
    const request = ++latest.current.request;
    setLoading(true);
    setFailed(false);
    onPendingChange?.(true);
    try {
      const rows = await load({ data: { claimId, periodId } });
      if (request !== latest.current.request) return;
      setAttempts(rows);
      onPendingChange?.(rows.length > 0);
    } catch {
      if (request !== latest.current.request) return;
      setFailed(true);
      onPendingChange?.(true);
    } finally {
      if (request === latest.current.request) setLoading(false);
    }
  }, [load, claimId, periodId, onPendingChange]);
  useEffect(() => {
    const counter = latest.current;
    void reload();
    return () => {
      counter.request++;
    };
  }, [reload, generation]);
  const act = async (id: string, kind: "resume" | "cleanup") => {
    if (busy !== null) return;
    setBusy(id);
    setMessage(null);
    onPendingChange?.(true);
    try {
      const r = await (kind === "resume" ? resume : cleanup)({ data: { attemptId: id } });
      setMessage(r.status);
      await reload();
      // Refresh the existing evidence read even when a response was lost.
      // A successful read does not turn an unknown action into a success claim.
      await onResolved?.();
    } catch {
      setMessage("unknown");
      onPendingChange?.(true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <EvidenceUploadRecoveryView
      attempts={attempts}
      loading={loading}
      failed={failed}
      busy={busy}
      message={message}
      lang={lang}
      onReload={() => void reload()}
      onResume={(id) => void act(id, "resume")}
      onCleanup={(id) => void act(id, "cleanup")}
    />
  );
}
