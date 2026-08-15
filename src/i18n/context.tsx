import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dictionaries, type Lang, type TranslationKey } from "./dictionaries";

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = "cqrityjob.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR default is always "sv" to avoid hydration mismatch.
  const [lang, setLangState] = useState<Lang>("sv");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (stored === "sv" || stored === "en") setLangState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey) => dictionaries[lang][key] ?? dictionaries.sv[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}

/** A translator bound to a SPECIFIC locale, independent of the live
 *  site-wide toggle `useT()` reads. For frozen report content (a v3.1
 *  snapshot's own `locale`, a Career Card's `locale` prop, ...): that
 *  content must render in the locale it was generated in, not whatever the
 *  viewer's current site-language happens to be — see
 *  V31ReportView.tsx's header. Same fallback chain as `t()` itself
 *  (`dictionaries[locale][key] ?? dictionaries.sv[key] ?? key`), just not
 *  wired to context. */
export function translateFor(locale: Lang): (key: TranslationKey) => string {
  return (key: TranslationKey) => dictionaries[locale][key] ?? dictionaries.sv[key] ?? key;
}