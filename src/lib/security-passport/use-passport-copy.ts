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
//
// ── ONE PLACE MAY OVERRIDE THE READER'S LANGUAGE ───────────────────────
//
// A share is addressed to one person. The holder knows which language that
// person reads, chooses it when they create the link, and the recipient is a
// stranger with no preference stored here at all — so the share's own
// `locale` decides, not the visitor's browser.
//
// It is a CONTEXT rather than a prop because the recipient page is a tree of
// a dozen Passport components — the card, the credential list, the assertion
// chip, the lifecycle chip, the scope line — every one of which calls this
// hook. Threading a language through all of them would mean a dozen chances
// for one of them to keep rendering in the reader's language while the rest
// changed, which is exactly the half-translated page the brief refuses.
//
// The override applies to the subtree it wraps and nothing else. Absent it,
// this behaves exactly as it did: the reader's own preference wins.

import { createContext, createElement, useCallback, useContext, type ReactNode } from "react";
import { useT } from "@/i18n/context";
import { passportT, type PassportCopyKey, type PassportLang } from "./i18n";

const PassportLangContext = createContext<PassportLang | null>(null);

export function PassportLangProvider({
  lang,
  children,
}: {
  lang: PassportLang;
  children: ReactNode;
}) {
  return createElement(PassportLangContext.Provider, { value: lang }, children);
}

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
  const forced = useContext(PassportLangContext);
  const passportLang: PassportLang = forced ?? (lang === "en" ? "en" : "sv");

  const pt = useCallback((key: PassportCopyKey) => passportT(key, passportLang), [passportLang]);

  return { pt, lang: passportLang };
}
