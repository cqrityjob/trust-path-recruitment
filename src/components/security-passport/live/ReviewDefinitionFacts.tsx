import { useEffect, useState } from "react";
import type { DefinitionFacts } from "@/lib/security-passport/international.functions";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

/**
 * The governed definition a claim was filed against, as the REVIEWER needs it:
 * which version the holder says the certificate names, what that version is
 * (qualification code, register code, level, awarding body), whether the
 * issuer is the holder's to state from the certificate, the regulator, and the
 * source the definition was reviewed against.
 *
 * Catalogue facts only. It reads no personal row, changes nothing, and a
 * superseded version is shown as "earlier version of the standard" -- never as
 * an expired credential, which a reviewer could otherwise read into it.
 */
export function ReviewDefinitionFacts({
  code,
  statedVersion,
  onLoad,
}: {
  code: string;
  statedVersion: string | null;
  /** The route's server call (getDefinitionFacts): components never reach the
   *  server tier themselves. */
  onLoad: (code: string) => Promise<DefinitionFacts>;
}) {
  const { lang } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const [facts, setFacts] = useState<DefinitionFacts | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    onLoad(code)
      .then((f) => active && setFacts(f))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [code, onLoad]);

  if (failed)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {copy("Kataloguppgifterna kunde inte läsas.", "The catalogue facts could not be read.")}
      </p>
    );
  if (!facts) return null;
  const stated = facts.versions.find((v) => v.version_key === statedVersion) ?? null;
  const hasVersions = facts.versions.length > 0;
  return (
    <section
      data-review-definition-facts
      className="rounded-lg border border-border bg-secondary/30 p-4 text-sm"
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {copy("Definitionen i katalogen", "The catalogue definition")}
      </h4>
      <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {facts.regulator && (
          <div>
            <dt className="text-xs text-muted-foreground">{copy("Tillsyn", "Regulator")}</dt>
            <dd>{facts.regulator}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">{copy("Utfärdare", "Issuer")}</dt>
          <dd>
            {facts.issuerStatedOnDocument
              ? copy(
                  "Anges på intyget — jämför innehavarens uppgift med dokumentet",
                  "Stated on the certificate — compare the holder's entry with the document",
                )
              : copy("Styrd i katalogen", "Governed by the catalogue")}
          </dd>
        </div>
        {facts.scopeCode === "national_qualification" && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{copy("Slag", "Kind")}</dt>
            <dd>
              {copy(
                "Nationell yrkeskvalifikation: ger ingen behörighet att arbeta. Godkännande betyder att dokumentet stöder kvalifikationen, inget mer.",
                "National qualification: it gives no right to work. Approval means the document supports the qualification, nothing more.",
              )}
            </dd>
          </div>
        )}
        {hasVersions && (
          <div className="sm:col-span-2" data-review-stated-version={statedVersion ?? "none"}>
            <dt className="text-xs text-muted-foreground">
              {copy("Version enligt innehavaren", "Version as stated by the holder")}
            </dt>
            <dd>
              {stated
                ? [
                    stated.official_title,
                    stated.qualification_code,
                    stated.qualification_version ? `v${stated.qualification_version}` : null,
                    stated.register_code,
                    stated.framework_level != null ? `NSQF ${stated.framework_level}` : null,
                    stated.catalogue_status === "current"
                      ? copy("aktuell version", "current version")
                      : copy(
                          "tidigare version av standarden (inte ett utgånget intyg)",
                          "earlier version of the standard (not an expired certificate)",
                        ),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : copy("Inte angiven", "Not stated")}
            </dd>
          </div>
        )}
        {hasVersions && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">
              {copy("Examinerande organ", "Awarding body")}
            </dt>
            <dd>{[...new Set(facts.versions.map((v) => v.awarding_body))].join(", ")}</dd>
          </div>
        )}
      </dl>
      {hasVersions && (
        <details className="mt-2 text-xs">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium">
            {copy("Alla styrda versioner", "All governed versions")}
          </summary>
          <ul className="mt-1 space-y-1">
            {facts.versions.map((v) => (
              <li key={v.version_key}>
                <span className="font-mono">{v.version_key}</span> ·{" "}
                {[
                  v.qualification_code,
                  v.register_code,
                  v.framework_level != null ? `NSQF ${v.framework_level}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                ·{" "}
                <a
                  className="text-accent underline"
                  href={v.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy("källa", "source")}
                </a>{" "}
                ({v.checked_on})
                {v.note_en ? (
                  <span className="block text-muted-foreground">{v.note_en}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      )}
      {facts.source && (
        <p className="mt-2 text-xs text-muted-foreground">
          <a
            className="text-accent underline"
            href={facts.source.url}
            target="_blank"
            rel="noreferrer"
          >
            {copy("Källa för definitionen", "Source for the definition")}
          </a>{" "}
          · {copy("kontrollerad", "checked")} {facts.source.checkedOn}
        </p>
      )}
    </section>
  );
}
