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

/** The language the visitor has EXPLICITLY chosen on this device, or null.
 *  Read after hydration only. Lets a page with its own default (the
 *  English-first India page) tell "never chose" apart from "chose Swedish",
 *  which the provider's `lang` cannot: both read "sv" there. */
export function readStoredLang(): Lang | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "sv" || stored === "en" ? stored : null;
  } catch {
    return null;
  }
}

/** A language carried in the URL (`?lang=en`) by a link that knows which
 *  language its reader was reading -- the India page's sign-up link. It is
 *  the ONLY way that intent survives a click made before the page hydrated,
 *  when no handler has run and nothing was stored. Adopted only while the
 *  visitor has no stored preference: an explicit choice always wins. */
export function langIntentFrom(search: string): Lang | null {
  const value = new URLSearchParams(search).get("lang");
  return value === "sv" || value === "en" ? value : null;
}

export function I18nProvider({
  children,
  /** The locale to start in. Swedish by default -- the SSR default is always
   *  "sv" to avoid a hydration mismatch, and the application never passes
   *  anything else. A render proof that must show the English half of a
   *  sentence passes "en". A stored preference still wins once the effect
   *  below has run. */
  initialLang = "sv",
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    const stored = readStoredLang();
    if (stored) setLangState(stored);
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

/** Adopt a language carried in the URL, on arrival AND on every navigation
 *  after it -- an e-mailed confirmation link lands on /login first and only
 *  then moves to the page that carries the language. Only while nothing is
 *  stored: an explicit choice always wins. Adopting stores it, so the rest of
 *  the visit (sign-up, confirmation, setup) stays in that language. */
export function useAdoptLangIntent(search: string) {
  // A URL language hint is optional: outside the provider (e.g. a stale
  // module instance during a hot reload) it must do nothing, never crash.
  const setLang = useContext(I18nContext)?.setLang;
  useEffect(() => {
    if (!setLang || readStoredLang()) return;
    const intent = langIntentFrom(search);
    if (intent) setLang(intent);
  }, [search, setLang]);
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}

/** Is there an I18nProvider above this component? For the few components that
 *  can render with or without one (the root's 404 and error screens) and must
 *  not throw either way. Everything else uses useT(). */
export function useHasI18n(): boolean {
  return useContext(I18nContext) !== null;
}

/** A translator that NEVER throws, for the screens that can render when the
 *  rest of the app could not: the root's 404 and its error boundary.
 *
 *  A hard crash unwinds the root component, and the I18nProvider with it, so
 *  the error screen renders outside the provider and `useT()` would throw
 *  inside the boundary meant to catch the first failure. Inside the provider
 *  this is exactly `useT()`. Outside it, the reader still gets their own
 *  language: Swedish on the server and on the first client render (what the
 *  server wrote, so hydration matches), then the stored choice from
 *  `readStoredLang()`; and Swedish when nothing is stored or storage cannot be
 *  read, the site's default. */
export function useTolerantT(): { lang: Lang; t: (key: TranslationKey) => string } {
  const ctx = useContext(I18nContext);
  const [stored, setStored] = useState<Lang>("sv");
  useEffect(() => {
    if (ctx) return;
    const choice = readStoredLang();
    if (choice) setStored(choice);
  }, [ctx]);
  const lang = ctx ? ctx.lang : stored;
  const t = useCallback(
    (key: TranslationKey) => (ctx ? ctx.t(key) : translateFor(stored)(key)),
    [ctx, stored],
  );
  return { lang, t };
}

/** A page's <title> and description in the language the reader chose.
 *
 *  The server always renders the Swedish page (see I18nProvider), so every
 *  route's `head` carries the Swedish pair, read from the dictionary. This
 *  swaps in the pair for the current language once the page is on the
 *  client, and again whenever the reader switches language -- the same
 *  document.title write the job ad already makes for its own title. It
 *  changes no canonical address, robots rule or indexing decision. */
export function useLocalizedHead(titleKey: TranslationKey, descriptionKey?: TranslationKey) {
  const { t } = useT();
  useEffect(() => {
    document.title = t(titleKey);
    if (descriptionKey) {
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", t(descriptionKey));
    }
  }, [t, titleKey, descriptionKey]);
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
export function LanguageScope({
  lang,
  children,
  onLangChange,
}: {
  lang: Lang;
  children: ReactNode;
  /** Told when something inside the scope (the site's language switcher)
   *  changes the preference, so a page that pins its OWN default language --
   *  the English-first India page -- can follow an explicit choice. */
  onLangChange?: (lang: Lang) => void;
}) {
  const parent = useT();
  const parentSetLang = parent.setLang;
  const setLang = useCallback(
    (next: Lang) => {
      parentSetLang(next);
      onLangChange?.(next);
    },
    [parentSetLang, onLangChange],
  );
  const t = useCallback(
    (key: TranslationKey) => dictionaries[lang][key] ?? dictionaries.sv[key] ?? key,
    [lang],
  );
  const tp = useCallback(
    (key: PluralKey, count: number) =>
      t(`${key}.${count === 1 ? "one" : "other"}` as TranslationKey),
    [t],
  );
  const value = useMemo(() => ({ lang, setLang, t, tp }), [lang, setLang, t, tp]);
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
