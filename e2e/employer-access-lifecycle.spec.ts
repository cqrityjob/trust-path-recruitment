// The employer ACCESS lifecycle, in a real browser, on the stubbed backend.
//
// ── WHAT THIS PROVES THAT THE GUARD CANNOT ─────────────────────────────
//
// scripts/employer-access-lifecycle-check.tsx runs the rules and renders the
// components. This drives the routed application: that a removed member who
// opens /employer is told what happened instead of being offered a company form,
// that a rejected organisation has an address to write to, that the waiting page
// says what to expect, that a pending organisation's pages are NOT rendered
// while the layout is deciding (a page that mounted would call a server function
// this suite has not stubbed, and `assertNoRefusals` fails on it -- which is how
// the flash of refused calls was first noticed), and that changing an approved
// organisation's identity asks first and lands on a page that says it is a
// re-review.
//
// Nothing reaches production: e2e/support/public-entry-harness.ts refuses every
// request to a Supabase host and every unstubbed server function.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/employer-access-lifecycle.spec.ts

import { test, expect, type Page } from "@playwright/test";
import { dictionaries } from "../src/i18n/dictionaries";
import { CONTACT_EMAIL } from "../src/lib/contact/contact-address";
import {
  assertNoRefusals,
  BASE,
  exportOf,
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
  shot,
  stubServerFn,
} from "./support/public-entry-harness";

const SV = dictionaries.sv as Record<string, string>;

const EMPLOYER_ID = "00000000-0000-4000-8000-00000000a0c1";

/** What everything on the way to /employer asks for. */
const shell = {
  countMyAcademyWork: 0,
  countMyReviewQueue: 0,
  ensureMyEmployerCompanyFromSignup: null,
};

const workspace = (status: string) => ({
  employerId: EMPLOYER_ID,
  employerSlug: "acme-vakt",
  employerName: "Acme Vakt AB",
  employerLogoUrl: null,
  employerStatus: status,
  employerCreatedAt: "2026-09-01T09:00:00.000Z",
  role: "owner",
});

const membership = (status: string) => ({
  id: "00000000-0000-4000-8000-00000000a0d1",
  employer_id: EMPLOYER_ID,
  role: "member",
  status,
  invited_at: null,
  accepted_at: null,
  created_at: "2026-09-01T09:00:00.000Z",
});

/** The boundary, a planted session, and the refusals to assert empty. */
async function signedIn(page: Page, table: Record<string, unknown>) {
  const refusals = await installBoundary(page, { ...shell, ...table });
  const key = await observeSupabaseStorageKey(page);
  await plantSession(page, key, {});
  return refusals;
}

test.describe("employer access lifecycle", () => {
  for (const kind of ["removed", "suspended"] as const) {
    test(`a ${kind} member who opens /employer is told, not offered a company form`, async ({
      page,
    }) => {
      const refusals = await signedIn(page, {
        listMyEmployerWorkspaces: [],
        listMyEmployerMemberships: [membership(kind)],
        listMyAccessRequests: [],
      });
      await page.goto(`${BASE}/employer`, { waitUntil: "domcontentloaded" });
      await page.waitForURL("**/employer/onboarding**", { timeout: 20_000 });

      const panel = page.locator('[data-testid="employer-access-ended"]');
      await expect(panel).toBeVisible({ timeout: 20_000 });
      await expect(panel).toHaveAttribute("data-access-ended", kind);
      await expect(panel.getByRole("heading", { level: 1 })).toHaveText(
        SV[`employer.accessEnded.${kind}.heading`]!,
      );
      // No company form, and no invitation to register one.
      expect(await page.locator("main form, main input").count()).toBe(0);
      expect(await page.locator("main").innerText()).not.toContain(
        SV["employer.onboarding.heading"],
      );
      // A way to write to us that works whatever the contact form is doing.
      const mail = panel.locator('[data-testid="employer-contact-mailto"]');
      await expect(mail).toHaveAttribute("href", new RegExp(`^mailto:${CONTACT_EMAIL}\\?subject=`));
      assertNoRefusals(refusals);
      await shot(page, `employer-access-${kind}`, `A ${kind} member is told what happened`);
    });
  }

  test("a person who never belonged to an organisation still gets the company form", async ({
    page,
  }) => {
    const refusals = await signedIn(page, {
      listMyEmployerWorkspaces: [],
      listMyEmployerMemberships: [],
      listMyAccessRequests: [],
    });
    await page.goto(`${BASE}/employer/onboarding`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      SV["employer.onboarding.heading"]!,
      { timeout: 20_000 },
    );
    expect(await page.locator('[data-testid="employer-access-ended"]').count()).toBe(0);
    assertNoRefusals(refusals);
  });

  test("a rejected organisation has an address to write to", async ({ page }) => {
    const refusals = await signedIn(page, {
      listMyEmployerWorkspaces: [workspace("rejected")],
    });
    await page.goto(`${BASE}/employer/pending`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      SV["employer.rejected.heading"]!,
      { timeout: 20_000 },
    );
    const mail = page.locator('[data-testid="employer-contact-mailto"]');
    await expect(mail).toBeVisible();
    await expect(mail).toHaveText(CONTACT_EMAIL);
    const href = (await mail.getAttribute("href")) ?? "";
    expect(href).toMatch(new RegExp(`^mailto:${CONTACT_EMAIL}\\?subject=`));
    // The organisation's name travels in the subject.
    expect(decodeURIComponent(href)).toContain("Acme Vakt AB");
    assertNoRefusals(refusals);
    await shot(page, "employer-rejected-contact", "A rejected organisation can write to us");
  });

  test("the waiting page says what to expect and what to do meanwhile, and promises no time", async ({
    page,
  }) => {
    const refusals = await signedIn(page, {
      listMyEmployerWorkspaces: [workspace("pending")],
    });
    await page.goto(`${BASE}/employer/pending`, { waitUntil: "domcontentloaded" });
    const wait = page.locator('[data-testid="employer-pending-wait"]');
    await expect(wait).toBeVisible({ timeout: 20_000 });
    const text = await wait.innerText();
    expect(text).toContain(SV["employer.pending.wait.noTime"]);
    expect(text).toContain(SV["employer.pending.wait.meanwhile"]);
    expect(text).not.toMatch(/\b\d+\s*(arbetsdagar|dagar|timmar|veckor)\b/i);
    await expect(wait.locator('a[href="/my-career"]')).toBeVisible();
    await expect(wait.locator('[data-testid="employer-contact-mailto"]')).toHaveText(CONTACT_EMAIL);
    // The first-registration wording is unchanged for a first registration.
    await expect(page.getByText(SV["employer.pending.thanks"]!)).toBeVisible();
    assertNoRefusals(refusals);
    await shot(page, "employer-pending-wait", "The waiting page: what to expect, what to do");
  });

  test("a pending organisation's pages are not rendered while the layout decides", async ({
    page,
  }) => {
    // Sixteen routes, one after the other.
    test.setTimeout(180_000);
    // Only the workspace list is stubbed. If any page under /employer/<slug>
    // mounted before the redirect it would ask for its own data, and the
    // unstubbed call would fail this test.
    //
    // HONESTLY: this is a REGRESSION property, not a reproduction. Run against
    // the previous layout (which rendered <Outlet /> while the list loaded) it
    // passes too, because every page under /employer/<slug> waits for the same
    // workspace query before it fetches anything of its own -- the audit's
    // "children fire refused calls" did not reproduce for any of these sixteen
    // routes. What decideEmployerGate removes is the dependence on that
    // discipline in every present and future child; the structural assertions in
    // employer-access-lifecycle:check (and its planted controls) are what pin it.
    const refusals = await signedIn(page, {
      listMyEmployerWorkspaces: [workspace("pending")],
    });
    for (const path of [
      "",
      "applications",
      "jobs",
      "jobs/new",
      "assessments",
      "assessments/library",
      "assessments/participants",
      "assessments/reviews",
      "interview-intelligence",
      "interview-intelligence/new",
      "training",
      "training/programmes",
      "workforce",
      "employment-verifications",
      "reports",
      "settings",
    ]) {
      await page.goto(`${BASE}/employer/acme-vakt/${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForURL("**/employer/pending**", { timeout: 20_000 });
    }
    assertNoRefusals(refusals);
  });

  test("an administrator can suspend, reactivate and re-role a member; the only active owner is protected", async ({
    page,
  }) => {
    const OLLE = {
      id: "00000000-0000-4000-8000-00000000b001",
      userId: "00000000-0000-4000-8000-00000000c001",
    };
    const MAJA = {
      id: "00000000-0000-4000-8000-00000000b002",
      userId: "00000000-0000-4000-8000-00000000c002",
    };
    const detail = (maja: { status: string; role: string }) => ({
      id: EMPLOYER_ID,
      slug: "acme-vakt",
      name: "Acme Vakt AB",
      country: "Sverige",
      registrationNumber: null,
      website: null,
      descriptionSv: null,
      descriptionEn: null,
      status: "active",
      createdAt: "2026-09-01T09:00:00.000Z",
      ownerUserId: OLLE.userId,
      ownerDisplayName: "Olle Ägare",
      ownerEmail: null,
      memberships: [
        {
          id: OLLE.id,
          userId: OLLE.userId,
          role: "owner",
          status: "active",
          displayName: "Olle Ägare",
        },
        {
          id: MAJA.id,
          userId: MAJA.userId,
          role: maja.role,
          status: maja.status,
          displayName: "Maja Medlem",
        },
      ],
      jobs: [],
      applications: [],
      employees: [],
      assignments: [],
      moderationHistory: [],
    });
    const refusals = await signedIn(page, {
      // The signed-in header asks which workspaces this person has.
      listMyEmployerWorkspaces: [],
      adminWhoAmI: { isAdmin: true, isSuperadmin: false },
      adminCountPendingEmployers: 0,
      passportReviewCounts: { open: 0, clarification: 0, total: 0 },
      adminGetEmployerForModeration: detail({ status: "active", role: "member" }),
      adminGetEmployerDeletionImpact: {
        employerId: EMPLOYER_ID,
        name: "Acme Vakt AB",
        status: "active",
        deletable: false,
        blockers: [],
        removedOnDelete: {},
      },
      adminGetEmployerRegistrationNotices: { history: [], missingSettings: [] },
    });

    // What actually reaches the two server functions.
    const writes: { name: string; body: string }[] = [];
    page.on("request", (req) => {
      const name = exportOf(req.url());
      if (
        name === "adminUpdateEmployerMembershipStatus" ||
        name === "adminUpdateEmployerMembershipRole"
      ) {
        writes.push({ name, body: req.postData() ?? "" });
      }
    });

    await page.goto(`${BASE}/admin/employers/${EMPLOYER_ID}`, { waitUntil: "domcontentloaded" });
    const row = (id: string) => page.locator(`[data-membership-id="${id}"]`);
    await expect(row(OLLE.id)).toBeVisible({ timeout: 20_000 });
    await expect(row(OLLE.id)).toContainText(SV["admin.employers.members.onlyOwner"]!);

    // The only active owner: the action is explained and cannot be confirmed.
    await row(OLLE.id).locator('[data-action="remove"]').click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      SV["admin.employers.members.dialog.finalOwner"]!.replace("{name}", "Olle Ägare"),
    );
    await expect(
      dialog.getByRole("button", { name: SV["admin.employers.action.confirm"]! }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: SV["admin.employers.action.cancel"]! }).click();
    await expect(dialog).toBeHidden();
    expect(writes, "a refused action reached the server").toEqual([]);

    // Suspend Maja: the confirmation says what happens, then it is done and shown.
    await row(MAJA.id).locator('[data-action="suspend"]').click();
    await expect(dialog).toContainText(
      SV["admin.employers.members.dialog.suspend.title"]!.replace("{name}", "Maja Medlem"),
    );
    await expect(dialog).toContainText("nästa åtgärd");
    await stubServerFn(page, "adminUpdateEmployerMembershipStatus", {
      id: MAJA.id,
      status: "suspended",
      changed: true,
    });
    await stubServerFn(
      page,
      "adminGetEmployerForModeration",
      detail({ status: "suspended", role: "member" }),
    );
    await dialog.getByRole("button", { name: SV["admin.employers.action.confirm"]! }).click();
    await expect(page.locator('[data-testid="admin-membership-result"]')).toHaveText(
      SV["admin.employers.members.result.suspend"]!.replace("{name}", "Maja Medlem"),
    );
    await expect(row(MAJA.id)).toContainText(SV["employer.team.status.suspended"]!);
    await expect(row(MAJA.id).locator("[data-action]")).toHaveCount(3);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.name).toBe("adminUpdateEmployerMembershipStatus");
    expect(writes[0]!.body).toContain(MAJA.id);
    expect(writes[0]!.body).toContain("suspended");

    // Reactivate, then make her an administrator.
    await row(MAJA.id).locator('[data-action="reactivate"]').click();
    await stubServerFn(page, "adminUpdateEmployerMembershipStatus", {
      id: MAJA.id,
      status: "active",
      changed: true,
    });
    await stubServerFn(
      page,
      "adminGetEmployerForModeration",
      detail({ status: "active", role: "member" }),
    );
    await dialog.getByRole("button", { name: SV["admin.employers.action.confirm"]! }).click();
    await expect(page.locator('[data-testid="admin-membership-result"]')).toHaveText(
      SV["admin.employers.members.result.reactivate"]!.replace("{name}", "Maja Medlem"),
    );

    await row(MAJA.id).locator('[data-action="role"]').click();
    await page.locator("#admin-membership-role").selectOption("admin");
    await stubServerFn(page, "adminUpdateEmployerMembershipRole", {
      id: MAJA.id,
      role: "admin",
      changed: true,
    });
    await stubServerFn(
      page,
      "adminGetEmployerForModeration",
      detail({ status: "active", role: "admin" }),
    );
    await dialog.getByRole("button", { name: SV["admin.employers.action.confirm"]! }).click();
    await expect(page.locator('[data-testid="admin-membership-result"]')).toContainText(
      "Maja Medlem",
    );
    await expect(row(MAJA.id)).toContainText(SV["employer.role.admin"]!);
    expect(writes.at(-1)!.name).toBe("adminUpdateEmployerMembershipRole");
    expect(writes.at(-1)!.body).toContain("admin");
    assertNoRefusals(refusals);
    await shot(page, "admin-members", "The members table with suspend, reactivate and change role");
  });

  test("changing the organisation's name asks first; confirming lands on a page that says it is a re-review", async ({
    page,
  }) => {
    const refusals = await signedIn(page, {
      listMyEmployerWorkspaces: [workspace("active")],
      getEmployerOrganisation: {
        id: EMPLOYER_ID,
        slug: "acme-vakt",
        name: "Acme Vakt AB",
        website: "https://acme.example",
        logoUrl: null,
        country: "Sverige",
        registrationNumber: "556000-0000",
        descriptionSv: "En beskrivning.",
        descriptionEn: null,
        status: "active",
      },
      getEmployerTeam: [],
      listAccessRequestsForMyEmployer: [],
      updateEmployerOrganisation: { ok: true, status: "pending" },
    });

    // Count the writes that actually reach the server function.
    const writes: string[] = [];
    page.on("request", (req) => {
      if (exportOf(req.url()) === "updateEmployerOrganisation") writes.push(req.url());
    });

    await page.goto(`${BASE}/employer/acme-vakt/settings`, { waitUntil: "domcontentloaded" });
    const nameField = page.getByLabel(SV["employer.settings.field.name"]!);
    await expect(nameField).toHaveValue("Acme Vakt AB", { timeout: 20_000 });

    // A description-only change is not an identity change: it saves directly.
    const desc = page.getByLabel(SV["employer.settings.field.descriptionSv"]!);
    await desc.fill("En ny beskrivning.");
    await page.getByRole("button", { name: SV["employer.settings.save"]! }).click();
    await expect.poll(() => writes.length, { timeout: 10_000 }).toBe(1);
    expect(await page.locator('[data-testid="identity-rereview-confirm"]').count()).toBe(0);

    // A cosmetic re-type of the name is not a change either.
    await nameField.fill("  acme vakt ab ");
    await page.getByRole("button", { name: SV["employer.settings.save"]! }).click();
    await expect.poll(() => writes.length, { timeout: 10_000 }).toBe(2);
    expect(await page.locator('[data-testid="identity-rereview-confirm"]').count()).toBe(0);

    // A real change of the name asks first, saying what it costs.
    await nameField.fill("Acme Vakt Syd AB");
    await page.getByRole("button", { name: SV["employer.settings.save"]! }).click();
    const dialog = page.locator('[data-testid="identity-rereview-confirm"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(SV["employer.settings.identityConfirm.consequence"]!);
    await expect(dialog).toContainText("Acme Vakt AB");
    await expect(dialog).toContainText("Acme Vakt Syd AB");
    expect(writes.length, "the write happened before the owner confirmed").toBe(2);

    // Cancelling changes nothing.
    await page
      .getByRole("button", { name: SV["employer.settings.identityConfirm.cancel"]! })
      .click();
    await expect(dialog).toBeHidden();
    expect(writes.length).toBe(2);

    // Confirming sends it. The workspace list then says `pending`, as the
    // database would after the trigger, and the review page says why.
    await page.getByRole("button", { name: SV["employer.settings.save"]! }).click();
    await expect(dialog).toBeVisible();
    await stubServerFn(page, "listMyEmployerWorkspaces", [workspace("pending")]);
    await page
      .getByRole("button", { name: SV["employer.settings.identityConfirm.confirm"]! })
      .click();
    await page.waitForURL("**/employer/pending**", { timeout: 20_000 });
    expect(writes.length).toBe(3);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      SV["employer.rereview.heading"]!,
      { timeout: 20_000 },
    );
    const body = await page.locator("main").innerText();
    expect(body, "a re-review thanked the owner for registering").not.toContain(
      SV["employer.pending.thanks"],
    );
    expect(body).toContain(SV["employer.rereview.access"]);
    assertNoRefusals(refusals);
    await shot(
      page,
      "employer-rereview",
      "Changing the identity asks first, then says it is a re-review",
    );
  });
});
