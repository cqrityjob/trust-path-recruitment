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
  tp: (key: PluralKey, count: number) => string;
};

/** The base of every key that exists as a `.one` / `.other` pair.
 *
 *  Derived from the dictionary rather than hand-listed, so a base whose pair is
 *  incomplete is a type error at the call site instead of a raw key rendered in
 *  the interface.
 *
 *  Two forms is the whole rule. Swedish and English both need exactly "one"
 *  versus "everything else" for the sentences this is used on, and a plural
 *  library that also carries few/many/zero for languages this product does not
 *  ship would be more machinery than the problem has. */
type PairedBase<K, All> = K extends `${infer Base}.one`
  ? `${Base}.other` extends All
    ? Base
    : never
  : never;

// `K` has to be a type parameter for the conditional to distribute over the
// union; `All` stays the whole union so the ".other" half can be looked up in
// it. Writing this with TranslationKey inline on both sides silently yields
// `never`, which every call site then reports as an unassignable argument.
export type PluralKey = PairedBase<TranslationKey, TranslationKey>;

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

  /** "1 ny ansökan" and "2 nya ansökningar" are not one string with a number in
   *  front of it. The count stays the caller's to render -- it is wrapped in
   *  tabular-nums where it appears -- so this returns only the words after it. */
  const tp = useCallback(
    (key: PluralKey, count: number) =>
      t(`${key}.${count === 1 ? "one" : "other"}` as TranslationKey),
    [t],
  );

  const value = useMemo(() => ({ lang, setLang, t, tp }), [lang, setLang, t, tp]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}

/** A subtree that renders in ONE fixed language, whatever the site toggle says.
 *
 *  ── WHY THIS EXISTS ─────────────────────────────────────────────────
 *
 *  An assessment attempt is delivered in the language the employer assigned
 *  it in (see src/lib/security-competency/attempt-language.ts). Everything
 *  inside the run -- the intro, the section introductions, the items, the
 *  navigation, the save status, the closing screen -- has to agree on that
 *  language, and it has to keep agreeing after the site toggle is pressed
 *  somewhere else. Passing a locale down through every component would have
 *  meant a second `t` next to the one they already call; this puts the fixed
 *  locale where `useT()` already looks.
 *
 *  `setLang` still reaches the site-wide provider so a caller that changes the
 *  preference changes it for the rest of the product -- but the scope itself
 *  does not move. The wrapper carries the `lang` attribute so assistive
 *  technology reads the subtree in the right language even though
 *  `document.documentElement.lang` follows the site preference. */
export function LanguageScope({ lang, children }: { lang: Lang; children: ReactNode }) {
  const parent = useT();
  const t = useCallback(
    (key: TranslationKey) => dictionaries[lang][key] ?? dictionaries.sv[key] ?? key,
    [lang],
  );
  const tp = useCallback(
    (key: PluralKey, count: number) =>
      t(`${key}.${count === 1 ? "one" : "other"}` as TranslationKey),
    [t],
  );
  const value = useMemo(
    () => ({ lang, setLang: parent.setLang, t, tp }),
    [lang, parent.setLang, t, tp],
  );
  return (
    <I18nContext.Provider value={value}>
      <div lang={lang} className="contents">
        {children}
      </div>
    </I18nContext.Provider>
  );
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
