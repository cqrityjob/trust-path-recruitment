// Security Passport — the one credential catalogue.
//
// ── WHY ONE COMPONENT ──────────────────────────────────────────────────
//
// Three surfaces offer a holder something to register: the market section on
// "Mina uppgifter", the credential form, and the overview's quick-add. Each
// drew its own list — a flat row of buttons, a two-column radio grid, a strip
// of bare codes — and each carried its own copy of the rule for WHEN to draw
// it. The entry page's copy was stale, so an entitled pilot holder read the
// pilot status line and found nothing under it.
//
// This component is the list. It is given options already governed by the
// market (see market-catalogue.ts for the rule) and decides only how they are
// PRESENTED: grouped by meaning, named in the reader's language with the code
// second, counted, searchable past twelve, and usable with a keyboard, a
// screen reader, a thumb at 375px and a 200% zoom.
//
// ── TWO MODES, ONE MARKUP ──────────────────────────────────────────────
//
//   action   every option is a button; choosing it navigates to the form.
//            The entry section and the overview use this.
//   select   every option is a radio in one group; choosing it sets the
//            form's credential. The form uses this, and keeps the radio
//            semantics its browser tests and guards already rely on:
//            `name="sp-cred-code"`, `value=<code>`, the name as the label.
//
// ── IT DECIDES NOTHING ABOUT THE MARKET ────────────────────────────────
//
// No market name, no market rule, no fallback list. An empty `options` with
// status "ready" renders the explicit empty state and nothing else. Whether
// a holder may see a catalogue at all is the caller's answer, made in the
// route from the governed availability read.

import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  catalogueNeedsSearch,
  filterCatalogue,
  groupCatalogue,
  type CatalogueOption,
} from "@/lib/security-passport/market-catalogue";
import { CredentialSymbol } from "./CredentialSymbol";

/** How the catalogue's data arrived. The three non-ready states are each
 *  drawn as words, because "no buttons" cannot tell a holder whether the
 *  market is empty, still loading, or failed to load. */
export type CatalogueStatus = "ready" | "loading" | "failed";

export type CredentialCatalogueProps = {
  readonly options: readonly CatalogueOption[];
  readonly status?: CatalogueStatus;
  /** Offered in the failed state only. */
  readonly onRetry?: () => void;
  /** Prefix for every generated id, so two catalogues on one page (the
   *  overview's and a form's) never share an id. */
  readonly idPrefix?: string;
  readonly className?: string;
} & (
  | {
      readonly mode: "action";
      readonly onSelect: (code: string) => void;
    }
  | {
      readonly mode: "select";
      readonly selectedCode: string | null;
      readonly onChange: (code: string) => void;
      /** The radio group's name attribute. */
      readonly name?: string;
    }
);

const OPTION_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CredentialCatalogue(props: CredentialCatalogueProps) {
  const { options, status = "ready", onRetry, idPrefix, className } = props;
  const { pt, lang } = usePassportCopy();
  const reactId = useId();
  const prefix = idPrefix ?? `sp-catalogue${reactId}`;
  const [query, setQuery] = useState("");

  const selectedCode = props.mode === "select" ? props.selectedCode : null;
  const searchable = catalogueNeedsSearch(options.length);
  // The filter never applies when the field is not shown, so a stale query
  // from a previous, larger catalogue cannot hide a smaller one.
  const visible = useMemo(
    () => (searchable ? filterCatalogue(options, query, selectedCode) : options),
    [options, query, searchable, selectedCode],
  );
  const groups = useMemo(() => groupCatalogue(visible), [visible]);
  const totalGroups = useMemo(() => groupCatalogue(options), [options]);

  const nameOf = (o: CatalogueOption) => (lang === "sv" ? o.nameSv : o.nameEn);
  const countLabel = (n: number) =>
    `${n} ${n === 1 ? pt("catalogue.choices.one") : pt("catalogue.choices.many")}`;

  /* ── The three non-ready states, each in words ───────────────────── */
  if (status === "loading") {
    return (
      <p
        role="status"
        aria-live="polite"
        data-catalogue-status="loading"
        className={cn("text-sm text-muted-foreground", className)}
      >
        {pt("catalogue.loading")}
      </p>
    );
  }
  if (status === "failed") {
    return (
      <div role="alert" data-catalogue-status="failed" className={className}>
        <p className="max-w-[70ch] text-sm leading-relaxed text-foreground">
          {pt("catalogue.failed")}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("catalogue.retry")}
          </button>
        ) : null}
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <p
        data-catalogue-status="empty"
        className={cn("max-w-[70ch] text-sm leading-relaxed text-muted-foreground", className)}
      >
        {pt("catalogue.empty")}
      </p>
    );
  }

  const searchId = `${prefix}-search`;
  const searchCountId = `${prefix}-search-count`;

  function renderOption(o: CatalogueOption) {
    const name = nameOf(o);
    const chosen = selectedCode === o.code;
    const body = (
      <>
        <CredentialSymbol
          code={o.code}
          state="self_declared"
          symbolLabel={o.symbolLabel ?? undefined}
          name={name}
          size={32}
          decorative
          className="shrink-0"
        />
        <span className="min-w-0 flex-1">
          {/* The name leads and may wrap; regulated names are long single
              words in Swedish and long phrases in English. The code is
              secondary, in a monospace face, and announced as "Code X" so a
              screen-reader user hears which is which. */}
          <span className="block text-sm font-medium leading-snug break-words text-foreground">
            {name}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            <span className="sr-only">{pt("catalogue.code")} </span>
            <code className="font-mono">{o.code}</code>
            {chosen ? (
              <span className="ml-2 font-medium text-foreground">{pt("catalogue.selected")}</span>
            ) : null}
          </span>
        </span>
      </>
    );

    if (props.mode === "select") {
      return (
        <li key={o.code}>
          <label
            className={cn(
              OPTION_CLASS,
              "cursor-pointer",
              chosen ? "border-accent bg-accent/5" : "border-border hover:bg-accent/5",
            )}
            data-credential-code={o.code}
            data-selected={chosen ? "true" : undefined}
          >
            <input
              type="radio"
              name={props.name ?? "sp-cred-code"}
              value={o.code}
              checked={chosen}
              onChange={() => props.onChange(o.code)}
              className="sr-only"
            />
            {body}
          </label>
        </li>
      );
    }
    return (
      <li key={o.code}>
        <button
          type="button"
          onClick={() => props.onSelect(o.code)}
          data-credential-code={o.code}
          className={cn(OPTION_CLASS, "border-input hover:bg-accent/10")}
        >
          {body}
        </button>
      </li>
    );
  }

  function renderGroup(
    key: "appointments" | "qualifications",
    items: readonly CatalogueOption[],
    total: number,
  ) {
    // A group with nothing in this market is not drawn at all: Northern
    // Ireland has one licence and no qualification, and a heading over
    // nothing invites the reader to look for what is not there. A group
    // hidden only by the SEARCH keeps its heading with a zero count, so the
    // reader can tell "no match" from "does not exist".
    if (total === 0) return null;
    const headingId = `${prefix}-${key}-heading`;
    const titleKey =
      key === "appointments" ? "catalogue.group.appointments" : "catalogue.group.qualifications";
    return (
      <section aria-labelledby={headingId} data-catalogue-group={key} data-count={total}>
        <h3
          id={headingId}
          className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold text-foreground"
        >
          <span>{pt(titleKey)}</span>
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {searchable && query.trim()
              ? `${items.length} / ${countLabel(total)}`
              : countLabel(total)}
          </span>
        </h3>
        {items.length > 0 ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">{items.map(renderOption)}</ul>
        ) : null}
      </section>
    );
  }

  const content = (
    <>
      {searchable ? (
        <div className="mb-4">
          <label htmlFor={searchId} className="block text-sm font-medium text-foreground">
            {pt("catalogue.search.label")}
          </label>
          <div className="relative mt-1 max-w-md">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pt("catalogue.search.placeholder")}
              aria-describedby={searchCountId}
              autoComplete="off"
              className="h-11 w-full rounded-md border border-input bg-background pr-11 pl-9 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={pt("catalogue.search.clear")}
                className="absolute top-1/2 right-1 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <p
            id={searchCountId}
            role="status"
            aria-live="polite"
            className="mt-1 text-xs tabular-nums text-muted-foreground"
            data-catalogue-visible={visible.length}
          >
            {pt("catalogue.search.showing")} {visible.length} {pt("catalogue.search.of")}{" "}
            {countLabel(options.length)}
          </p>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-catalogue-status="no-match">
          {pt("catalogue.search.noMatch")}
        </p>
      ) : null}

      <div className="space-y-5">
        {renderGroup("appointments", groups.appointments, totalGroups.appointments.length)}
        {renderGroup("qualifications", groups.qualifications, totalGroups.qualifications.length)}
      </div>
    </>
  );

  // In select mode the caller's <fieldset> is the radio group — one name,
  // one legend, arrow keys between the radios. Nothing is added here that
  // would announce the group twice.
  return (
    <div
      data-credential-catalogue={props.mode}
      data-catalogue-status="ready"
      data-count={options.length}
      className={className}
    >
      {content}
    </div>
  );
}
