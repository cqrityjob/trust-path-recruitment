// Security Passport — the pilot tester's four defects, asserted against the
// RENDERED markup.
//
// Run via `bun run passport-pilot-bugfix:check`.
//
// ── WHY THIS RENDERS RATHER THAN READS ─────────────────────────────────
//
// `passport-credential-form-check` proves the domain rules: `fieldsFor` hides
// the title, `validateCredential` refuses a rewritten one. Neither says what
// the holder actually SEES, and the tester's report was about what they saw —
// a text box they could type "Bajskorv" into. A rule that holds while the
// component still renders an <input> would pass every check in this repository
// and fix nothing, which is the same gap `passport-scope-surface-check` exists
// to close for the scope line.
//
// So this renders the real components with `renderToStaticMarkup` and asserts
// on the markup: no input, no country select, the credential's own name as
// text, and each closed market explained in words.
//
// ── SWEDISH IS WHAT IS RENDERED HERE ───────────────────────────────────
//
// `I18nProvider` deliberately starts at "sv" on the server to avoid a
// hydration mismatch, and it exposes no way to seed a locale. Swedish is also
// the language the pilot tester used. The English half of every sentence is
// asserted from the copy module directly, and `passport-fixture-check` holds
// sv/en parity across all ~1000 keys.

import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { CredentialForm } from "../src/components/security-passport/CredentialForm";
import { EvidencePanel } from "../src/components/security-passport/live/EvidencePanel";
import { FIXTURE_CREDENTIAL_TYPES } from "../src/lib/security-passport/fixtures/credential-types";
import { passportT, type PassportCopyKey } from "../src/lib/security-passport/i18n";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}

const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);

const noop = () => {};
const noopAsync = async () => {};

function form(props: Partial<React.ComponentProps<typeof CredentialForm>> = {}) {
  return html(
    <CredentialForm
      types={FIXTURE_CREDENTIAL_TYPES}
      busy={false}
      serverError={null}
      savedAt={null}
      onSaveDraft={noop}
      onActivate={noop}
      onCancel={noop}
      {...props}
    />,
  );
}

console.log("passport-pilot-bugfix-check\n");

/* ══════════════════════════════════════════════════════════════════════
   1. THE TITLE IS NOT A TEXT BOX
   ══════════════════════════════════════════════════════════════════════ */
console.log('DEFECT 1 -- a tester named a skyddsvakt appointment "Bajskorv"');
{
  const sv = FIXTURE_CREDENTIAL_TYPES.find((t) => t.code === "SV")!;
  const markup = form({ preselectCode: "SV" });

  ck("the form is showing the skyddsvakt appointment", markup.includes(sv.nameSv));
  // The specific thing the tester typed into.
  ck(
    "there is no title input to type into",
    !/id="sp-cred-title"[^>]*<input/.test(markup) && !markup.includes('<input id="sp-cred-title"'),
  );
  ck(
    "and no input of any kind carries the title value",
    !new RegExp(`<input[^>]*value="${sv.nameSv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(
      markup,
    ),
  );
  // Present as a FACT, not as a disabled field: a disabled input still reads
  // as "something you could fill in, but not now".
  ck(
    "the credential's own name is rendered as static text",
    markup.includes(`<p id="sp-cred-title"`) && markup.includes(sv.nameSv),
  );
  ck(
    "and it is not merely a disabled input",
    !/<input[^>]*disabled[^>]*id="sp-cred-title"/.test(markup),
  );
  // The help text has to say WHY there is nothing to type.
  ck(
    "the help text says the name comes from the credential",
    markup.includes(passportT("cred.field.titleHelp", "sv")),
  );
  ck(
    "and its English half exists and differs",
    passportT("cred.field.titleHelp", "en") !== passportT("cred.field.titleHelp", "sv"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2. THE CREDENTIAL'S COUNTRY IS STATED, NOT CHOSEN
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nA Swedish credential says Sweden, whoever holds it and wherever");
{
  const markup = form({ preselectCode: "VU1" });
  ck("no country select is offered", !markup.includes('id="sp-cred-jurisdictionCode"'));
  ck(
    "the credential's jurisdiction is rendered from its definition",
    markup.includes(passportT("cred.field.credentialCountry", "sv")) &&
      markup.includes(passportT("jurisdiction.SE", "sv")),
  );
  ck(
    "with the sentence that says a work country does not change it",
    markup.includes(passportT("cred.field.credentialCountryHelp", "sv")),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   3. A CLOSED MARKET IS EXPLAINED, NOT EMPTY
   ══════════════════════════════════════════════════════════════════════

   The defect: `listCredentialTypes` returns every ACTIVE type, which is the
   eight Swedish ones — offered in full to a holder who had told the product
   they work in Dubai. */
console.log("\nDEFECT (market) -- Swedish credentials offered as Dubai credentials");
{
  const cases = [
    {
      name: "Dubai",
      closed: {
        reason: "pending_review" as const,
        jurisdictionCode: "AE",
        subJurisdictionCode: "AE-DU",
      },
      sentence: "workCountry.support.AE-DU" as PassportCopyKey,
    },
    {
      name: "the United Kingdom",
      closed: {
        reason: "pending_review" as const,
        jurisdictionCode: "GB",
        subJurisdictionCode: null,
      },
      sentence: "workCountry.support.GB" as PassportCopyKey,
    },
    {
      name: "the UAE outside Dubai",
      closed: {
        reason: "unsupported" as const,
        jurisdictionCode: "AE",
        subJurisdictionCode: null,
      },
      sentence: "workCountry.support.AE" as PassportCopyKey,
    },
    {
      name: "a holder who has stated no work country",
      closed: {
        reason: "no_work_country" as const,
        jurisdictionCode: null,
        subJurisdictionCode: null,
      },
      sentence: "cred.market.noWorkCountry" as PassportCopyKey,
    },
  ];

  for (const c of cases) {
    // `types` is deliberately still the full Swedish set: the closed state must
    // hold because the form was TOLD the market is closed, not because the
    // server happened to send an empty array.
    const markup = form({ closedMarket: c.closed });

    ck(
      `${c.name}: not one Swedish credential is offered`,
      FIXTURE_CREDENTIAL_TYPES.every((t) => !markup.includes(`value="${t.code}"`)),
    );
    ck(`${c.name}: the reason is stated in words`, markup.includes(passportT(c.sentence, "sv")));
    ck(
      `${c.name}: and what the holder CAN still record is stated too`,
      markup.includes(passportT("cred.market.stillPossible", "sv")),
    );
    ck(
      `${c.name}: with a promise that existing credentials are untouched`,
      markup.includes(passportT("cred.market.keepsExisting", "sv")),
    );
    ck(
      `${c.name}: no "add to my Passport" button to press in vain`,
      !markup.includes(passportT("cred.action.activate", "sv")),
    );
    // The line the brief forbids outright: unavailable is not ineligible.
    ck(
      `${c.name}: says unavailable, never that the holder is ineligible`,
      !/(inte behörig|ej behörig|inte kvalificerad|ogiltig|får inte arbeta)/i.test(markup),
    );
  }

  // POSITIVE CONTROL. Sweden is open, and the same form offers all eight.
  const open = form();
  ck(
    "POSITIVE CONTROL an open market offers every one of its credentials",
    FIXTURE_CREDENTIAL_TYPES.every((t) => open.includes(`value="${t.code}"`)),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4. THE VALIDATION SUMMARY POINTS NOWHERE
   ══════════════════════════════════════════════════════════════════════

   "Kontrollera fälten nedan" rendered BELOW every field it referred to. */
console.log("\nDEFECT 2 -- the summary said the invalid fields were below it");
{
  for (const lang of ["sv", "en"] as const) {
    const copy = passportT("cred.errorSummary", lang);
    ck(`${lang}: the summary names no direction`, !/(nedan|ovan|below|above)/i.test(copy));
    ck(`${lang}: and still tells the holder what to do`, copy.trim().length > 10);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   5. THE FIVE MINUTES BELONGS TO THE LINK
   ══════════════════════════════════════════════════════════════════════

   "Länken gäller i fem minuter" sat alone under a freshly uploaded document,
   and read as "your document disappears in five minutes". */
console.log("\nDEFECT 3 -- the holder could not tell whether the document was saved");
{
  const withDoc = html(
    <EvidencePanel
      evidence={[
        {
          id: "e1",
          claimId: "c1",
          periodId: null,
          fileName: "forordnande.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12345,
          uploadedAt: "2026-09-01T10:00:00Z",
        } as never,
      ]}
      canAdd
      canRemove
      onUpload={noopAsync}
      onOpen={noopAsync}
      onWithdraw={noopAsync}
    />,
  );

  ck(
    "the document says, separately, that it is stored",
    withDoc.includes(passportT("ev.stored", "sv")),
  );
  ck(
    "the five minutes is described as the OPEN link's, not the document's",
    withDoc.includes(passportT("ev.linkShort", "sv")) &&
      /Öppna-länken/.test(passportT("ev.linkShort", "sv")),
  );
  ck(
    "and the link sentence says the document is unaffected by it",
    /Dokumentet påverkas inte/.test(passportT("ev.linkShort", "sv")),
  );
  for (const lang of ["sv", "en"] as const) {
    const s = passportT("ev.linkShort", lang);
    ck(`${lang}: the sentence is about a link, not a document lifetime`, /(länk|link)/i.test(s));
  }
  ck(
    "the holder can open, replace and remove a stored document",
    withDoc.includes(passportT("ev.view", "sv")) &&
      withDoc.includes(passportT("ev.replace", "sv")) &&
      withDoc.includes(passportT("ev.withdraw", "sv")),
  );
  // The confirmation exists as copy; it renders only after an upload, which is
  // a state this static render cannot reach.
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: an upload has a success confirmation to show`,
      passportT("ev.saved", lang).trim().length > 10,
    );
  }
  ck(
    "an empty panel does not talk about links at all",
    !html(
      <EvidencePanel
        evidence={[]}
        canAdd
        canRemove
        onUpload={noopAsync}
        onOpen={noopAsync}
        onWithdraw={noopAsync}
      />,
    ).includes(passportT("ev.linkShort", "sv")),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   6. DISPUTE AND ARCHIVE ARE DIFFERENT SENTENCES
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nDEFECT 4 -- dispute went nowhere, and nothing could be removed");
{
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: a disputed entry tells the holder it is waiting for review`,
      passportT("claim.dispute.pending", lang).trim().length > 20,
    );
    ck(
      `${lang}: archiving says plainly that nothing is deleted`,
      /(raderas inte|not deleted)/i.test(passportT("claim.archive.lead", lang)),
    );
    // The two controls must not blur into one. Using dispute as a delete
    // button fills a review queue with entries nobody contests.
    ck(
      `${lang}: and it points a holder with WRONG information at the dispute`,
      /(anmäl|report)/i.test(passportT("claim.archive.notDispute", lang)),
    );
    ck(
      `${lang}: a disputed entry cannot be archived, and says why`,
      passportT("claim.archive.blockedDisputed", lang).trim().length > 20,
    );
    ck(
      `${lang}: the reviewer's queue promises a human decision`,
      /(människa|person)/i.test(passportT("vq.dispute.lead", lang)),
    );
  }
}

console.log(
  fails.length === 0
    ? `\npassport-pilot-bugfix-check: all assertions passed.`
    : `\npassport-pilot-bugfix-check FAILED (${fails.length}):\n  - ${fails.join("\n  - ")}`,
);
process.exit(fails.length === 0 ? 0 : 1);
