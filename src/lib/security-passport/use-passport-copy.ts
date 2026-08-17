// Security Passport — the copy adapter.
//
// Reads ONLY the current language (`sv` | `en`) from the app's existing
// global i18n context, then resolves every string from the Passport's own
// copy module. The global `t()` is never called for Passport text and
// src/i18n/dictionaries.ts is never edited or read here.
//
// That split is the whole point: language selection stays a single global
// concern (one switcher, one stored preference, one <html lang>), while the
// strings stay domain-owned and out of the highest-churn file in the repo.
//
// Convention follows src/lib/job-intelligence/use-employer-workspace.ts.

import { useCallback } from "react";
import { useT } from "@/i18n/context";
import { passportT, type PassportCopyKey, type PassportLang } from "./i18n";

export interface PassportCopy {
  /** Resolve one Passport string in the current language. */
  readonly pt: (key: PassportCopyKey) => string;
  readonly lang: PassportLang;
}

export function usePassportCopy(): PassportCopy {
  // Only `lang` is taken. `t` is deliberately not destructured, so a future
  // edit cannot quietly start resolving Passport copy from the central
  // dictionary without that showing up as a new import.
  const { lang } = useT();
  const passportLang: PassportLang = lang === "en" ? "en" : "sv";

  const pt = useCallback((key: PassportCopyKey) => passportT(key, passportLang), [passportLang]);

  return { pt, lang: passportLang };
}
