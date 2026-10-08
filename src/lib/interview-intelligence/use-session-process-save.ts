import { useEffect, useRef, useState } from "react";
import {
  SessionProcessSave,
  type SessionProcessRecord,
  type SessionProcessWriter,
} from "./session-process-save";

export function useSessionProcessSave(
  record: SessionProcessRecord | null,
  write: SessionProcessWriter,
  enabled: boolean,
) {
  const [, render] = useState(0);
  const mounted = useRef(true);
  const writer = useRef(write);
  writer.current = write;
  const state = useRef<SessionProcessSave | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (record && state.current?.sessionId !== record.id) {
    state.current = new SessionProcessSave(
      record,
      (input) => writer.current(input),
      () => {
        if (mounted.current) render((n) => n + 1);
      },
    );
  }
  const process = state.current;

  useEffect(() => {
    if (record) state.current?.reconcile(record);
  }, [record]);

  useEffect(() => {
    if (!enabled || !process?.dirty || process.conflict) return;
    timer.current = setTimeout(() => void process.flush(), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, process, process?.draft, process?.conflict]);

  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => {
      if (state.current?.dirty || state.current?.pending) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
      // The normal route actions await flush. Unmount is only a best-effort
      // fallback, and a conflicting draft is never silently retried.
      if (state.current?.dirty && !state.current.conflict) void state.current.flush();
    };
  }, []);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    return (await state.current?.flush()) ?? true;
  };
  return { process, flush };
}
