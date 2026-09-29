// Security Passport — the ONE Passport's credential groups, in HTML.
//
// The same model the exported image draws (passport-groups.ts): one heading
// per controlled scope, every shield of that scope beneath it, each shield
// with its own abbreviation, name and trust word. This is the HTML rendering
// for a page that shows the Passport at page size -- the homepage example --
// and the accessible, textual companion of the image preview, so a screen
// reader hears the same groups and credentials the image shows and does not
// depend on where a shield happens to sit.
//
// It decides nothing: grouping is `groupPassportCredentials`, the shield is
// `ShieldMark`, the flag or globe is `ScopeMark`, the abbreviation is
// `shieldMarkText` and the trust word is the credential's own key.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { passportT, type PassportLang } from "@/lib/security-passport/i18n";
import { shieldMarkText } from "@/lib/security-passport/credential-shield";
import {
  groupPassportCredentials,
  type PassportGroup,
} from "@/lib/security-passport/passport-groups";
import type { SocialCredentialName } from "@/lib/security-passport/social";
import { ScopeMark, ShieldMark, breakableStatusWord } from "./CredentialShield";

function groupLabel(group: PassportGroup, lang: PassportLang): string {
  return group.scope.kind === "not_stated"
    ? passportT("social.groups.notStated", lang)
    : group.scope.label;
}

/**
 * The Passport's groups as shields on the navy ground: a heading with the
 * flag or globe, then the shields of that scope in a wrapping row.
 */
export function PassportGroupedShields({
  credentials,
  lang: imageLang,
  names = "shown",
  className = "",
}: {
  credentials: readonly SocialCredentialName[];
  /** The language of the credential names; the reader's when omitted. */
  lang?: PassportLang;
  /** Whether each shield prints its name under the abbreviation, or keeps
   *  it in the shield's accessible name only (a page with a word budget). */
  names?: "shown" | "accessible";
  className?: string;
}) {
  const { lang: readerLang } = usePassportCopy();
  const lang = imageLang ?? readerLang;
  const groups = groupPassportCredentials(credentials, lang);
  return (
    <div className={className} data-passport-grouped-shields={credentials.length}>
      {groups.map((group) => (
        <div
          key={group.key}
          role="group"
          data-passport-group={group.key}
          aria-label={groupLabel(group, lang)}
          className="mt-4 first:mt-0"
        >
          {/* The group's heading: labelled on the section, so it is not a
              document heading -- the page's outline stays the page's. */}
          <p
            aria-hidden="true"
            className="flex items-center gap-2 border-b border-primary-foreground/20 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/75"
          >
            <ScopeMark scope={group.scope} size={11} />
            {groupLabel(group, lang)}
          </p>
          <ul className="mt-3 flex flex-wrap justify-around gap-x-2 gap-y-4">
            {group.credentials.map((c) => {
              const name = lang === "sv" ? c.nameSv : c.nameEn;
              const word = passportT(c.statusWordKey, lang);
              return (
                <li
                  key={c.id}
                  data-passport-shield={c.id}
                  role="img"
                  aria-label={`${name} · ${groupLabel(group, lang)} · ${word}`}
                  title={`${name} · ${word}`}
                  className="flex w-20 min-w-0 flex-col items-center text-center"
                >
                  <ShieldMark state={c.state} size={36} />
                  <span className="mt-1.5 block text-sm font-semibold leading-tight text-primary-foreground">
                    {shieldMarkText({ code: c.code, name }) ?? "—"}
                  </span>
                  {names === "shown" ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-primary-foreground/80">
                      {name}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-[10px] lowercase leading-tight text-primary-foreground/60 first-letter:uppercase">
                    {breakableStatusWord(word)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The same groups as plain text: what the image shows, for whoever reads
 * rather than looks. Each credential is named once, under its group, with
 * its own trust word -- the accessible statement of the ONE Passport.
 */
export function PassportGroupList({
  credentials,
  lang: imageLang,
  className = "",
}: {
  credentials: readonly SocialCredentialName[];
  lang?: PassportLang;
  className?: string;
}) {
  const { pt, lang: readerLang } = usePassportCopy();
  const lang = imageLang ?? readerLang;
  const groups = groupPassportCredentials(credentials, lang);
  if (credentials.length === 0) return null;
  return (
    <div className={className} data-passport-group-list={groups.length}>
      <h3 className="text-sm font-semibold text-foreground">{pt("social.groups.title")}</h3>
      <p role="status" data-passport-one className="mt-1 text-sm text-muted-foreground">
        {pt("social.onePassport").replace("{n}", String(credentials.length))}
      </p>
      <ul className="mt-2 space-y-2">
        {groups.map((group) => (
          <li key={group.key} data-passport-group={group.key}>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <ScopeMark scope={group.scope} size={11} />
              {groupLabel(group, lang)}
            </p>
            <ul className="mt-1 space-y-0.5 pl-4 text-sm text-foreground">
              {group.credentials.map((c) => (
                <li key={c.id} data-passport-shield={c.id}>
                  {lang === "sv" ? c.nameSv : c.nameEn}
                  <span className="text-muted-foreground">
                    {" · "}
                    {passportT(c.statusWordKey, lang).toLocaleLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
