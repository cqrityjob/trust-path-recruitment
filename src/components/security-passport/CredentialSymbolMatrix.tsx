// Dev-harness review surface: every credential symbol in every state.
//
// Scaffolding for visual review, not product. The matrix exists so a
// reviewer can see the full 4×8 grid at once — including the states that
// are hard to reach naturally (revoked, superseded, disputed) — at the
// small size cards actually use, and on both grounds the symbols must
// survive: the navy card and the theme page.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { TRUST_PALETTE } from "@/lib/security-passport/design/trust-system";
import {
  CREDENTIAL_PRESENTATION_STATES,
  SYMBOL_CODES,
  presentationWordKey,
} from "@/lib/security-passport/design/credential-symbols";
import { CredentialSymbol, CredentialSymbolLockup } from "./CredentialSymbol";

const CODE_NAMES: Record<string, string> = {
  VU1: "Väktarutbildning 1 (VU1)",
  VU2: "Väktarutbildning 2 (VU2)",
  OV: "Ordningsvaktsförordnande",
  SV: "Skyddsvaktsförordnande",
};

export function CredentialSymbolMatrix() {
  const { pt } = usePassportCopy();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("symbols.title")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {pt("symbols.lead")}
        </p>
      </header>

      {/* The full matrix on the navy card ground. */}
      <section
        className="overflow-x-auto rounded-2xl p-5"
        style={{
          background: `linear-gradient(165deg, ${TRUST_PALETTE.navyRaised} 0%, ${TRUST_PALETTE.navy} 40%, ${TRUST_PALETTE.navyDeep} 100%)`,
        }}
      >
        <table className="border-separate" style={{ borderSpacing: "14px 10px" }}>
          <thead>
            <tr>
              <th aria-hidden="true" />
              {CREDENTIAL_PRESENTATION_STATES.map((state) => (
                <th
                  key={state}
                  scope="col"
                  className="text-[9px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: TRUST_PALETTE.inkMuted }}
                >
                  {pt(presentationWordKey(state))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SYMBOL_CODES.map((code) => (
              <tr key={code}>
                <th
                  scope="row"
                  className="pr-2 text-left text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: TRUST_PALETTE.ink }}
                >
                  {code}
                </th>
                {CREDENTIAL_PRESENTATION_STATES.map((state) => (
                  <td key={state} className="text-center align-middle">
                    <CredentialSymbol
                      code={code}
                      state={state}
                      name={CODE_NAMES[code] ?? code}
                      size={44}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {/* The neutral fallback device for a free-text credential. */}
            <tr>
              <th
                scope="row"
                className="pr-2 text-left text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: TRUST_PALETTE.inkMuted }}
              >
                —
              </th>
              {CREDENTIAL_PRESENTATION_STATES.map((state) => (
                <td key={state} className="text-center align-middle">
                  <CredentialSymbol
                    code={null}
                    state={state}
                    symbolLabel="CERT"
                    name={pt("symbols.freeText")}
                    size={44}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      {/* Card-size legibility check: the smallest size any surface uses. */}
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("symbols.smallSize")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {SYMBOL_CODES.map((code) => (
            <CredentialSymbol
              key={code}
              code={code}
              state="verified"
              name={CODE_NAMES[code] ?? code}
              size={28}
            />
          ))}
          {SYMBOL_CODES.map((code) => (
            <CredentialSymbol
              key={`${code}-sd`}
              code={code}
              state="self_declared"
              name={CODE_NAMES[code] ?? code}
              size={28}
            />
          ))}
        </div>
      </section>

      {/* Lockups on the theme ground — word beside mark. */}
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("symbols.withWord")}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CREDENTIAL_PRESENTATION_STATES.map((state) => (
            <CredentialSymbolLockup
              key={state}
              code="OV"
              state={state}
              name={CODE_NAMES.OV}
              size={36}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
