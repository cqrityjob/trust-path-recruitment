/** Actual browser print of synthetic frozen reports. No backend, accounts or provider calls. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  analysisMethods,
  reportSections,
  RSA_MATRIX,
  type AnalysisType,
} from "../src/lib/security-work/analysis-model";
import { reportBundleSchema, reportHtml } from "../src/lib/security-work/report-export";

// PDF.js may split a single word into multiple glyph runs on Linux. Spaces
// between extracted items are not authored content. Preserve every non-space
// character and still require each complete heading after the previous one.
const printedCharacters = (value: string) => value.replace(/\s/gu, "");
function assertPrintedSectionOrder(text: string, headings: readonly string[]) {
  const characters = printedCharacters(text);
  let after = 0;
  for (const heading of headings) {
    const expected = printedCharacters(heading);
    const position = characters.indexOf(expected, after);
    assert.ok(position >= 0, `frozen section missing or out of order: ${heading}`);
    after = position + expected.length;
  }
}

const output = resolve(process.env.SW_REPORT_PDF_DIR ?? "output/pdf/security-work");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
});
const evidence: {
  file: string;
  sha256: string;
  pages: number;
  language: string;
  template: string;
}[] = [];
try {
  for (const type of ["rsa", "monitoring", "legacy_security"] as AnalysisType[]) {
    for (const language of ["sv", "en"] as const) {
      const l = (sv: string, en: string) => (language === "sv" ? sv : en);
      const claim = l(
        "Den syntetiska reservvägen var blockerad vid kontrollen.",
        "The synthetic backup route was blocked during inspection.",
      );
      const paragraph = l(
        "Fakta: uppgiften gäller endast den dokumenterade kontrollen. Användaruppgift: verksamheten behöver tillgång till reservvägen. Antagande: ett nytt avbrott kan inträffa; antagandet är inte en bekräftad händelse. Bedömning: ansvarig behöver kontrollera återställning. Osäkerhet: varken varaktighet eller dagens förhållanden har verifierats.",
        "Fact: the observation applies only to the documented inspection. User information: operations require access to the backup route. Assumption: another interruption could occur; this is not a confirmed event. Assessment: the owner needs to verify restoration. Uncertainty: neither duration nor current conditions have been verified.",
      );
      const methods = analysisMethods[type];
      const title = l("Syntetiskt beslutsunderlag", "Synthetic decision report") + ` - ${type}`;
      const bundle = reportBundleSchema.parse({
        formatVersion: 1,
        method: { id: methods.method, definition: type === "rsa" ? { matrix: RSA_MATRIX } : {} },
        template: {
          id: methods.template,
          required_sections: reportSections[type].map(([key]) => key),
        },
        report: {
          id: "SYNTHETIC-REPORT",
          workspace_id: "SYNTHETIC-WORKSPACE",
          title,
          version: 7,
          status: "approved",
          language,
          sections: Object.fromEntries(
            reportSections[type].map(([key], i) => [
              key,
              `${i === 0 ? claim + "\n\n" : ""}${paragraph}\n\n${paragraph}`,
            ]),
          ),
          uncertainty: l(
            "Återställningstid saknas. Kontrollera originalet innan beslut. Avsaknad av information innebär inte låg risk.",
            "Recovery duration is unknown. Check the original before deciding. Missing information does not imply low risk.",
          ),
        },
        assessment: {
          id: "SYNTHETIC-ASSESSMENT",
          title,
          analysis_type: type,
          method_version_id: methods.method,
          horizon: l("1 oktober - 31 december 2026", "1 October - 31 December 2026"),
          purpose: l(
            "Prioritera verifiering och åtgärder i en fiktiv verksamhet.",
            "Prioritize verification and actions for a fictional operation.",
          ),
          scope: l(
            "Syntetiskt övningsfall, inga kunduppgifter.",
            "Synthetic exercise; no customer data.",
          ),
        },
        risks: [
          {
            id: "SYNTHETIC-RISK",
            title: l("Fördröjd åtkomst till reservväg", "Delayed access to the backup route"),
            description: claim,
            likelihood: type === "rsa" ? 3 : null,
            consequence: type === "rsa" ? 4 : null,
            uncertainty: l("Nuvarande tillgänglighet okänd.", "Current availability unknown."),
            decision_rationale: l(
              "Mänsklig övningsbedömning. Värdena gäller endast detta syntetiska fall.",
              "Human exercise judgement. Ratings apply only to this synthetic case.",
            ),
          },
        ],
        actions: Array.from({ length: 14 }, (_, i) => ({
          id: `SYNTHETIC-ACTION-${i}`,
          title: l(`Kontrollera reservväg ${i + 1}`, `Inspect backup route ${i + 1}`),
          description: l(
            "Dokumentera kontrollen och återför resultatet till ansvarig granskare.",
            "Document the inspection and return the result to the responsible reviewer.",
          ),
          status: i === 0 ? "completed" : "open",
          priority: i % 2 === 0 ? "high" : "medium",
          assignee_user_id: i === 1 ? null : "64000000-0000-4000-8000-000000000008",
          due_date: i === 1 ? null : "2026-10-01",
          decision_rationale: l(
            "Följ upp innan nästa verksamhetsperiod.",
            "Follow up before the next operational period.",
          ),
          completion_evidence:
            i === 0
              ? l("Syntetiskt kontrollprotokoll finns.", "Synthetic inspection record retained.")
              : "",
        })),
        citations: [
          {
            id: "SYNTHETIC-CITATION",
            source_item_id: "SYNTHETIC-SOURCE",
            claim,
            excerpt: claim,
            locator: l("Sida 2, stycke 3", "Page 2, paragraph 3"),
            risk_id: "SYNTHETIC-RISK",
          },
        ],
        sources: [
          {
            id: "SYNTHETIC-SOURCE",
            original_title: l("Syntetiskt kontrollprotokoll", "Synthetic inspection record"),
            publisher: l("Fiktiv övningsgrupp", "Fictional exercise group"),
            published_at: null,
            retrieved_at: "2026-09-24T10:00:00Z",
            factual_extract: `${claim} NEVER_EXPORT_UNQUOTED_SOURCE`,
          },
        ],
      });
      const html = reportHtml(bundle, {
        approved_at: "2026-09-24T11:12:13Z",
        report_version: 7,
        bundle_hash: "b".repeat(64),
      });
      const page = await browser.newPage();
      let networkRequests = 0;
      await page.route("**/*", (route) => {
        networkRequests += 1;
        return route.abort();
      });
      await page.setContent(html);
      assert.equal(
        await page.locator(".citation").count(),
        2,
        "same saved claim is shown by section and risk",
      );
      assert.equal(await page.locator("tbody tr").count(), 14);
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator(".print-hint").isVisible(), false);
      const file = `${type}-${language}.pdf`;
      const bytes = await page.pdf({
        path: join(output, file),
        printBackground: true,
        preferCSSPageSize: true,
        tagged: true,
      });
      assert.equal(networkRequests, 0, "export must not fetch fonts, assets or source URLs");
      await page.close();
      const loadingTask = getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: true,
        verbosity: 0,
      });
      const pdf = await loadingTask.promise;
      const pages: string[] = [];
      for (let n = 1; n <= pdf.numPages; n += 1) {
        const p = await pdf.getPage(n);
        const viewport = p.getViewport({ scale: 1 });
        assert.ok(
          Math.abs(viewport.width - 595.28) < 2 && Math.abs(viewport.height - 841.89) < 2,
          "A4 size",
        );
        const content = await p.getTextContent();
        const items = content.items.filter((item) => "str" in item);
        pages.push(
          items
            .map((item) => item.str)
            .join(" ")
            .replace(/\s+/g, " "),
        );
        assert.ok(items.length > 5, `page ${n} must not be blank`);
        for (const item of items) {
          assert.ok(
            item.transform[4] >= 45 && item.transform[4] + item.width <= viewport.width - 45,
            `page ${n} has clipped horizontal text`,
          );
          assert.ok(
            item.transform[5] >= 10 && item.transform[5] <= viewport.height - 40,
            `page ${n} has clipped vertical text`,
          );
        }
      }
      const text = pages.join(" ");
      for (const value of [
        title,
        claim,
        methods.method,
        methods.template,
        "SHA-256",
        "b".repeat(64),
        "64000000-0000-4000-8000-000000000008",
        l("Godkänd version 7", "Approved version 7"),
        l("Publiceringsdatum saknas", "Publication date unknown"),
        l("Ej tilldelad", "Unassigned"),
        l("Datum saknas", "Date unknown"),
        l("Hög", "High"),
        l("Slutförd", "Completed"),
      ])
        assert.ok(
          text.replace(/\s/g, "").includes(value.replace(/\s/g, "")),
          `missing printed text: ${value}`,
        );
      assert.match(
        text,
        language === "sv" ? /Godkänd: 24 sep\.? 2026/ : /Approved: 24 Sep(?:t)? 2026/,
        "printed approval date uses the approved timestamp",
      );
      const headings = reportSections[type].map(([, sv, en]) => l(sv, en));
      assertPrintedSectionOrder(text, headings);
      for (const heading of headings) {
        if (!text.includes(heading))
          console.log(
            `INFO ${file}: PDF text fragments split heading "${heading}"; all characters and section order verified`,
          );
      }
      // Planted changes to the actual extracted PDF must still fail: missing
      // content, altered characters and reversed sections are never normalized.
      const characters = printedCharacters(text);
      const [first, second] = headings.map(printedCharacters);
      for (const damaged of [
        characters.replace(first, "REMOVED_HEADING"),
        characters.replace(first, first.slice(0, -1) + "X"),
        characters
          .replace(first, "SW_HEADING_SWAP")
          .replace(second, first)
          .replace("SW_HEADING_SWAP", second),
      ])
        assert.throws(
          () => assertPrintedSectionOrder(damaged, headings),
          /frozen section missing or out of order/,
        );
      assert.ok(!text.includes("NEVER_EXPORT_UNQUOTED_SOURCE"));
      assert.ok(!text.includes("HTML report."));
      if (type === "rsa") assert.ok(text.includes(l("Orange · S 3 / K 4", "Orange · L 3 / C 4")));
      else
        assert.ok(
          text.includes(l("Kvalitativ bedömning", "Qualitative assessment")) &&
            !text.includes(" / C "),
        );
      // The long table spans pages; every continuation page must repeat its header.
      const tablePages = pages.filter(
        (text) => text.includes("64000000") && text.includes(l("Öppen", "Open")),
      );
      assert.ok(tablePages.length >= 2, "fixture must exercise an actual table page break");
      for (const text of tablePages)
        assert.ok(
          text.includes(l("Prioritet", "Priority")) && text.includes(l("Ansvarig", "Owner")),
          "table header repeated on continuation page",
        );
      evidence.push({
        file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        pages: pdf.numPages,
        language,
        template: methods.template,
      });
      await loadingTask.destroy();
      console.log(
        `PASS ${file}: ${pages.length} A4 pages, frozen content and table continuation verified`,
      );
    }
  }
} finally {
  await browser.close();
}
writeFileSync(
  join(output, "manifest.json"),
  JSON.stringify({ syntheticOnly: true, browserPrint: true, documents: evidence }, null, 2) + "\n",
);
console.log(`PASS 6 actual report PDFs; artifacts: ${output}`);
