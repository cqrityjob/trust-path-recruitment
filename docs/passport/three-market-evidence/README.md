# Security Passport — three-market completion: review evidence

Screenshots produced by `e2e/passport-three-market.spec.ts` against the dev
server, with every backend call answered from fixtures. **No real person, no
real account and no hosted data appears in any image.** Names are fictional
and marked as such ("Testperson (fiktiv)", "Pilottestare (fiktiv)"); the
administrator and holder ids are synthetic UUIDs.

Regenerate:

```
bun run dev -- --port 3100 --strictPort
E2E_BASE_URL=http://localhost:3100 PASSPORT_SHOTS=docs/passport/three-market-evidence \
  bunx playwright test e2e/passport-three-market.spec.ts --project=chromium --project=mobile-375
```

| File                                                 | What it shows                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `chromium-sv-harness-three-markets.png`              | The fixture screen, Swedish: market cards (public, GB pilot member, Northern Ireland pilot member), then the SE 3/5, GB 7/6, GB-NI 1/0 and AE-DU 15/15 catalogues |
| `chromium-en-harness-three-markets.png`              | The same, English                                                                                                         |
| `chromium-sv-information-gb-pilot.png`               | The real `/passport/information` route for an entitled GB pilot holder: pilot status line **and** the 13 governed choices |
| `chromium-sv-form-gb-licence-preselected.png`        | The credential form reached from that catalogue with `?code=UK_SIA_LICENCE_DS` preselected                                |
| `chromium-en-information-dubai-pilot.png`            | The real route for a Dubai pilot holder: 30 choices, 15/15, search field, heading says Dubai                              |
| `chromium-en-form-dubai-course-selected.png`         | The form after switching from a cadre card to a course: no expiry field, no scope                                          |
| `chromium-sv-overview-three-markets.png`             | One Passport with records from Sweden, Great Britain and Dubai, and the three market cards                                |
| `chromium-en-overview-three-markets.png`             | The same, English                                                                                                         |
| `chromium-{sv,en}-admin-pilot-access-before.png`     | `/admin/users/$userId` — the pilot-access section before any grant                                                        |
| `chromium-{sv,en}-admin-pilot-access-granted.png`    | After granting GB (one market, one user; GB-NI and AE-DU untouched)                                                       |
| `chromium-{sv,en}-admin-pilot-access-revoke-dialog.png` | The confirmation dialog before a revoke                                                                                |
| `mobile-375-*.png`                                   | The same scenarios at 375×812                                                                                              |

What the images do **not** show, on purpose: any market opened to the public,
any legal approval, any hosted write, any real entitlement. GB, GB-NI and AE-DU
remain `is_active = false`, `legal_review_state = 'pending'`,
`pilot_state = 'internal_pilot'`; AE-AZ remains closed; `sp_pilot_members` on
the hosted project was not touched.

The database-level defect that made the pilot catalogue empty for a real
entitled member, its reproduction on a full migration replay and the
correction are documented in `rls-reproduction.md` beside this file.
