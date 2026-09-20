// HAYAT — one reading at a time, and never a late one.
//
// The whole job of this hook is the sentence "a result belongs to the file it
// was read from". Every reading gets a generation number. Replacing or
// removing the file bumps the generation and aborts the engine; when the old
// reading eventually resolves -- and with OCR it can resolve many seconds
// later -- its generation no longer matches and it is dropped on the floor.
// It is never applied, not even briefly.

import { useCallback, useEffect, useRef, useState } from "react";
import { extractBakedCredential } from "@/lib/security-passport/hayat/baked-badge";
import { parseDocument } from "@/lib/security-passport/hayat/parse-fields";
import type {
  DocumentReader,
  DocumentReading,
  ReadFailure,
  ReadingContext,
} from "@/lib/security-passport/hayat/types";

export type HayatReadingState =
  | { readonly phase: "idle" }
  | { readonly phase: "reading" }
  // A signed credential baked into an image is found independently of whether
  // any text could be read off it: a badge image often has almost none.
  | {
      readonly phase: "failed";
      readonly reason: ReadFailure;
      readonly signedCredential: string | null;
    }
  | {
      readonly phase: "read";
      readonly reading: DocumentReading;
      /** A signed credential found baked into the image, if any. Untrusted. */
      readonly signedCredential: string | null;
    };

/** The browser reader is heavy (pdf.js, Tesseract) and is loaded on first use.
 *
 *  `import.meta.env.SSR` is a build-time constant: in the server build the
 *  branch below is dead code, so neither library is bundled into the Worker,
 *  whose size is limited and which could never run them anyway. */
async function defaultReader(): Promise<DocumentReader> {
  if (import.meta.env.SSR) throw new Error("HAYAT reads documents in the browser only");
  const module = await import("@/lib/security-passport/hayat/browser-reader");
  return module.createBrowserDocumentReader();
}

export function useHayatReading(injected?: DocumentReader) {
  const [state, setState] = useState<HayatReadingState>({ phase: "idle" });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    setState({ phase: "idle" });
  }, []);

  // Leaving the form abandons the reading with it.
  useEffect(
    () => () => {
      generation.current += 1;
      controller.current?.abort();
    },
    [],
  );

  const start = useCallback(
    async (
      file: File,
      context: ReadingContext,
      onRead: (reading: DocumentReading) => void,
    ): Promise<void> => {
      generation.current += 1;
      const mine = generation.current;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setState({ phase: "reading" });
      const current = () => generation.current === mine;
      try {
        const reader = injected ?? (await defaultReader());
        if (!current()) return;
        const signedCredential =
          file.type === "image/png"
            ? await extractBakedCredential(new Uint8Array(await file.arrayBuffer()))
            : null;
        const outcome = await reader.read(file, file.type, abort.signal);
        if (!current()) return;
        if (!outcome.ok) {
          setState({ phase: "failed", reason: outcome.reason, signedCredential });
          return;
        }
        const reading = parseDocument(outcome.text, context);
        setState({ phase: "read", reading, signedCredential });
        onRead(reading);
      } catch {
        if (current())
          setState({ phase: "failed", reason: "engine_unavailable", signedCredential: null });
      }
    },
    [injected],
  );

  return { state, start, cancel };
}
