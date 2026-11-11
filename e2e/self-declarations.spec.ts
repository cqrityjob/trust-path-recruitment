// Voluntary self-declarations on /my-career/profile, in the browser.
//
// The server functions are stubbed (career-home-harness), so this proves the
// SCREEN's contract; the database's is proved by
// supabase/tests/vsd_voluntary_self_declarations_test.sql, and the two were
// walked together against a real local stack before this shipped.
//
//   * closed by default: no input, button or form in any panel
//   * criminal history: closed, and stays closed, with no control at all
//   * declaring: nothing pre-selected, save disabled until the holder
//     affirms, the request carries exactly the affirmation
//   * a saved statement shows its provenance level and nothing stronger
//   * an owed or failed file cleanup stays visible with a retry, and is not
//     called erased until the server says so
//   * Swedish and English; desktop and 375 px without horizontal overflow
//
// Run: bunx playwright test e2e/self-declarations.spec.ts --project=chromium --project=mobile-375
import { test, expect, type Page, type Route } from "@playwright/test";
import { mount, ok, takeMountBookkeeping } from "./support/career-home-harness";
import { buildSelfDeclarationsView } from "../src/lib/self-declarations/model";
import { filesOwed } from "../src/lib/self-declarations/workflow";
import {
  OPEN_PAYLOAD,
  syntheticDeclaration,
  syntheticDocument,
  withDeclarations,
} from "../src/lib/self-declarations/fixtures/self-declaration-fixtures";
import type { SelfDeclarationsPayload } from "../src/lib/self-declarations/model";

const result = (payload: SelfDeclarationsPayload) => ({
  view: buildSelfDeclarationsView(payload),
  fileDeletion: filesOwed(payload) === 0 ? "confirmed" : "pending",
});
const reply = (body: unknown) => (route: Route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ result: body, error: null, context: {} }),
  });

const SECTION = "[data-self-declarations]";
const panel = (page: Page, kind: string) => page.locator(`[data-vsd-panel="${kind}"]`);

async function open(
  page: Page,
  lang: "sv" | "en",
  overrides: NonNullable<NonNullable<Parameters<typeof mount>[2]>["overrides"]> = {},
) {
  await mount(page, "hub_active", {
    lang,
    path: "/my-career/profile",
    ready: `${SECTION} [data-vsd-panel="criminal_history"]`,
    overrides,
  });
}

test.afterEach(() => {
  const c = takeMountBookkeeping();
  if (!c) return;
  expect(c.unmatched, "every server function the page calls is stubbed").toEqual([]);
  expect(c.errors, "no console errors").toEqual([]);
});

for (const lang of ["sv", "en"] as const) {
  test(`${lang}: closed by default — three panels, nothing to fill in, and it says why`, async ({
    page,
  }) => {
    await open(page, lang);
    const section = page.locator(SECTION);
    await expect(section.locator("[data-vsd-panel]")).toHaveCount(3);
    for (const kind of ["enforcement_debt_none", "payment_remarks_none", "criminal_history"]) {
      await expect(panel(page, kind)).toHaveAttribute("data-vsd-state", "closed");
    }
    await expect(section.locator("input, select, textarea, form, button")).toHaveCount(0);
    await expect(section).toContainText(
      lang === "sv" ? "Frivilliga självdeklarationer" : "Voluntary self-declarations",
    );
    await expect(section).toContainText(
      lang === "sv" ? "Det är inte en verifiering" : "It is not verification",
    );
    await expect(panel(page, "criminal_history")).toContainText(
      lang === "sv" ? "ett samtycke räcker inte" : "consent alone is not enough",
    );
    // Skipping it is not a gap: the Profile's "missing" list does not name it.
    // (This fixture may have nothing missing at all, in which case the list is absent.)
    expect((await page.locator("[data-profile-missing]").allInnerTexts()).join(" ")).not.toMatch(
      /självdeklaration|self-declaration/i,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test(`${lang}: declaring — nothing pre-selected, the holder affirms, the statement is saved as self-declared`, async ({
    page,
  }) => {
    const saved = withDeclarations(
      syntheticDeclaration({
        kind: "payment_remarks_none",
        statementVersion: "se-remarks-v1",
      }),
    );
    let sent: unknown = null;
    await open(page, lang, {
      getMySelfDeclarations: ok(result(OPEN_PAYLOAD)),
      saveSelfDeclaration: async (route: Route) => {
        sent = route.request().postDataJSON();
        await reply(result(saved))(route);
      },
    });
    const remarks = panel(page, "payment_remarks_none");
    await expect(remarks).toHaveAttribute("data-vsd-state", "open");
    // Open, but still nothing asked until the holder chooses to.
    await expect(page.locator(`${SECTION} input`)).toHaveCount(0);
    // Criminal history is closed whatever else is open.
    await expect(panel(page, "criminal_history")).toHaveAttribute("data-vsd-state", "closed");
    await expect(
      panel(page, "criminal_history").locator("input, select, textarea, form, button"),
    ).toHaveCount(0);

    await remarks.locator("[data-vsd-declare]").click();
    const affirm = remarks.locator("[data-vsd-affirm]");
    await expect(affirm).not.toBeChecked();
    await expect(remarks.locator("[data-vsd-save]")).toBeDisabled();
    await expect(remarks).toContainText(
      lang === "sv"
        ? "Att ha lån eller bolån är inte en betalningsanmärkning"
        : "Having a loan or a mortgage is not a payment remark",
    );
    await affirm.check();
    await remarks.locator("[data-vsd-save]").click();

    await expect(remarks).toHaveAttribute("data-vsd-state", "declared");
    await expect(remarks.locator("[data-vsd-provenance]")).toHaveAttribute(
      "data-vsd-provenance",
      "self_declared",
    );
    await expect(remarks.locator("[data-vsd-provenance]")).toHaveText(
      lang === "sv" ? "Egen uppgift" : "Self-declared",
    );
    // The body is seroval-encoded: assert the exact field set and the kind.
    // There is no field for an explanation, an amount or anything else.
    expect(JSON.stringify(sent)).toContain('"k":["kind","asOfDate","affirmed","expectedRevision"]');
    expect(JSON.stringify(sent)).toContain('"s":"payment_remarks_none"');
    // No document area where storing one is not authorized.
    await expect(remarks.locator("[data-vsd-document-area]")).toHaveCount(0);
    await expect(page.locator(SECTION)).not.toContainText(
      /verified clean|debt-free|skuldfri|ostraffad|godkänd för anställning|approved for employment/i,
    );
  });
}

test("a document makes it 'Document provided' and never more; renewing starts unticked and warns", async ({
  page,
}) => {
  const withDocument = withDeclarations(
    syntheticDeclaration({ provenance: "document_provided", document: syntheticDocument() }),
  );
  await open(page, "en", { getMySelfDeclarations: ok(result(withDocument)) });
  const enforcement = panel(page, "enforcement_debt_none");
  await expect(enforcement.locator("[data-vsd-provenance]")).toHaveText("Document provided");
  await expect(enforcement).toContainText("Nobody has reviewed the document");
  await expect(enforcement.locator("[data-vsd-document]")).toContainText("SYNTHETIC-fixture.pdf");
  // The storage path and hash never reach the page.
  expect(await page.content()).not.toMatch(/storagePath|sha256|[0-9a-f]{64}/);

  await enforcement.locator("[data-vsd-renew]").click();
  await expect(enforcement.locator("[data-vsd-affirm]")).not.toBeChecked();
  await expect(enforcement).toContainText(
    "any review of it, belongs to the old one and is removed",
  );
});

test("a document is downloaded through the server on each press: no link, and a refusal downloads nothing", async ({
  page,
}) => {
  const withDocument = withDeclarations(
    syntheticDeclaration({ provenance: "document_provided", document: syntheticDocument() }),
  );
  let allow = true;
  let asked = 0;
  const storage: string[] = [];
  page.on("request", (request) => {
    if (/\/storage\/v1\//.test(request.url())) storage.push(request.url());
  });
  await open(page, "en", {
    getMySelfDeclarations: ok(result(withDocument)),
    readSelfDeclarationDocument: async (route: Route) => {
      asked += 1;
      if (!allow)
        return route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "VSD_DOCUMENT_NOT_FOUND",
        });
      await reply({
        fileName: "SYNTHETIC-fixture.pdf",
        mimeType: "application/pdf",
        contentBase64: Buffer.from("%PDF-1.4\nSYNTHETIC\n%%EOF\n").toString("base64"),
      })(route);
    },
  });
  const enforcement = panel(page, "enforcement_debt_none");
  // Nothing on the page is a link to the file.
  await expect(enforcement.locator("a[href]")).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    enforcement.locator("[data-vsd-document-open]").click(),
  ]);
  expect(download.suggestedFilename()).toBe("SYNTHETIC-fixture.pdf");
  expect(download.url()).toMatch(/^blob:/);
  expect(asked).toBe(1);

  // Access has since ended (withdrawn, revoked, expired, signed out...): the
  // very next press asks again, is refused, and downloads nothing.
  allow = false;
  let second = false;
  page.once("download", () => {
    second = true;
  });
  await enforcement.locator("[data-vsd-document-open]").click();
  await expect(enforcement.locator('[data-vsd-document-notice="error"]')).toContainText(
    "no longer available",
  );
  expect(asked).toBe(2);
  expect(second).toBe(false);
  expect(storage, "the browser never talks to Storage").toEqual([]);
  // The injected refusal is this scenario's subject, not a defect.
  takeMountBookkeeping();
});

test("an unconfirmed upload keeps its id for the retry; a refused one gets a new id", async ({
  page,
}) => {
  const declared = withDeclarations(syntheticDeclaration());
  const withDocument = withDeclarations(
    syntheticDeclaration({ provenance: "document_provided", document: syntheticDocument() }),
  );
  const ids: string[] = [];
  let mode: "lost" | "refused" | "saved" = "lost";
  await open(page, "en", {
    getMySelfDeclarations: ok(result(declared)),
    uploadSelfDeclarationDocument: async (route: Route) => {
      const body = JSON.stringify(route.request().postDataJSON());
      // The first uuid in the seroval body is uploadId (the first field).
      ids.push(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(body)![0]);
      if (mode === "lost") return route.abort("failed");
      if (mode === "refused")
        return route.fulfill({ status: 500, contentType: "text/plain", body: "VSD_FILE_REJECTED" });
      await reply(result(withDocument))(route);
    },
  });
  const enforcement = panel(page, "enforcement_debt_none");
  const pdf = {
    name: "SYNTHETIC-fixture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nSYNTHETIC\n%%EOF\n"),
  };
  const send = async () => {
    await enforcement.locator("[data-vsd-issue-date]").fill("2026-11-08");
    await enforcement.locator("[data-vsd-upload]").click();
  };
  await enforcement.locator("[data-vsd-file]").setInputFiles(pdf);
  await send();
  await expect(enforcement.locator('[data-vsd-document-notice="error"]')).toContainText(
    "could not be confirmed",
  );
  // Same file still chosen: the retry is the SAME upload.
  mode = "refused";
  await send();
  await expect(enforcement.locator('[data-vsd-document-notice="error"]')).toContainText(
    "must be a real PDF",
  );
  mode = "saved";
  await send();
  await expect(enforcement.locator("[data-vsd-provenance]")).toHaveText("Document provided");
  expect(ids).toHaveLength(3);
  expect(ids[1], "an unconfirmed upload is retried under the same id").toBe(ids[0]);
  expect(ids[2], "a refused upload is not reused").not.toBe(ids[1]);
  // The aborted and refused requests are this scenario's subject.
  takeMountBookkeeping();
});

test("an owed cleanup is shown and retried; 'erased' is said only when the server confirms it", async ({
  page,
}) => {
  const owed = withDeclarations(
    syntheticDeclaration({
      status: "withdrawn",
      withdrawnAt: "2026-11-11T12:00:00Z",
      provenance: null,
      erasures: [
        {
          documentId: "0f000000-0000-4000-8000-000000000009",
          fileName: "SYNTHETIC-old.pdf",
          requestedAt: "2026-11-11T12:00:00Z",
          attempts: 2,
          failed: true,
        },
      ],
    }),
  );
  let retries = 0;
  await open(page, "en", {
    getMySelfDeclarations: ok(result(owed)),
    retrySelfDeclarationCleanup: async (route: Route) => {
      retries += 1;
      // The first retry still fails; the second succeeds.
      await reply(result(retries === 1 ? owed : OPEN_PAYLOAD))(route);
    },
  });
  const enforcement = panel(page, "enforcement_debt_none");
  await expect(enforcement).toHaveAttribute("data-vsd-state", "withdrawn");
  await expect(enforcement.locator('[data-vsd-cleanup-item="failed"]')).toContainText(
    "Erasing the file failed and is not complete: SYNTHETIC-old.pdf",
  );
  await expect(page.locator(SECTION)).not.toContainText("The file is erased");

  await page.locator("[data-vsd-cleanup-retry]").click();
  await expect(page.locator('[data-vsd-cleanup="owed"]').getByRole("alert")).toContainText(
    "still not erased",
  );
  await expect(enforcement.locator("[data-vsd-cleanup-item]")).toHaveCount(1);

  await page.locator("[data-vsd-cleanup-retry]").click();
  await expect(page.locator('[data-vsd-cleanup="clear"]')).toContainText("The file is erased");
  await expect(page.locator("[data-vsd-cleanup-item]")).toHaveCount(0);
});

test("a deletion whose file is still owed is not reported as deleted", async ({ page }) => {
  const declared = withDeclarations(
    syntheticDeclaration({ provenance: "document_provided", document: syntheticDocument() }),
  );
  const pending = withDeclarations(
    syntheticDeclaration({
      status: "deletion_pending",
      provenance: null,
      erasures: [
        {
          documentId: "0f000000-0000-4000-8000-000000000001",
          fileName: "SYNTHETIC-fixture.pdf",
          requestedAt: "2026-11-11T12:00:00Z",
          attempts: 1,
          failed: true,
        },
      ],
    }),
  );
  await open(page, "en", {
    getMySelfDeclarations: ok(result(declared)),
    deleteSelfDeclaration: reply(result(pending)),
  });
  const enforcement = panel(page, "enforcement_debt_none");
  await enforcement.locator("[data-vsd-delete]").click();
  await enforcement.locator("[data-vsd-confirm-yes]").click();
  await expect(enforcement.locator("[data-vsd-deletion-pending]")).toContainText(
    "The deletion is complete only once the file is gone",
  );
  await expect(enforcement).not.toContainText("The statement is deleted");
  await expect(enforcement.locator('[data-vsd-cleanup-item="failed"]')).toHaveCount(1);
});

test("a read that fails says so and offers a retry; the rest of the Profile still works", async ({
  page,
}) => {
  await mount(page, "hub_active", {
    lang: "en",
    path: "/my-career/profile",
    ready: "[data-vsd-failed]",
    overrides: {
      getMySelfDeclarations: (route: Route) => route.fulfill({ status: 500, body: "Injected" }),
    },
  });
  await expect(page.locator("[data-vsd-failed]")).toContainText("could not be loaded");
  await expect(page.locator("[data-profile-basics]")).toBeVisible();
  // The injected 500 is this scenario's subject, not a defect.
  takeMountBookkeeping();
});
