# Complete combined-head browser failures

The full 1395-case run completed. No skipped case counts as a pass. Exact errors are in browser-results.json and browser-full.log.gz.

| File / line | Project | Failed case |
|---|---|---|
| career-center-pilot.spec.ts:700 | chromium | structure and access > every internal Career Center link lands on a published guide |
| career-center-pilot.spec.ts:781 | chromium | structure and access > 1440, 640, 375 and real 200% zoom hold without horizontal scroll |
| my-career-home.spec.ts:479 | chromium | /my-career — the real route > 15 · 1440px: no overflow, one h1, one primary CTA, labelled sections, 44px targets, AA contrast, focus rings |
| my-career-home.spec.ts:479 | chromium | /my-career — the real route > 15 · 375px: no overflow, one h1, one primary CTA, labelled sections, 44px targets, AA contrast, focus rings |
| my-career-home.spec.ts:621 | chromium | /my-career — the real route > nav · the primary navigation is reachable by keyboard, with a visible ring |
| my-career-home.spec.ts:479 | mobile-375 | /my-career — the real route > 15 · 1440px: no overflow, one h1, one primary CTA, labelled sections, 44px targets, AA contrast, focus rings |
| my-career-home.spec.ts:479 | mobile-375 | /my-career — the real route > 15 · 375px: no overflow, one h1, one primary CTA, labelled sections, 44px targets, AA contrast, focus rings |
| my-career-home.spec.ts:621 | mobile-375 | /my-career — the real route > nav · the primary navigation is reachable by keyboard, with a visible ring |
| my-career-home.spec.ts:479 | mobile-390 | /my-career — the real route > 15 · 1440px: no overflow, one h1, one primary CTA, labelled sections, 44px targets, AA contrast, focus rings |
| my-career-home.spec.ts:479 | mobile-390 | /my-career — the real route > 15 · 375px: no overflow, one h1, one primary CTA, labelled sections, 44px targets, AA contrast, focus rings |
| my-career-home.spec.ts:621 | mobile-390 | /my-career — the real route > nav · the primary navigation is reachable by keyboard, with a visible ring |
| my-career-home.spec.ts:812 | chromium | image 1 — the Passport card on Överskt > every control on the profile workspace clears 44px and keeps a focus ring |
| my-career-home.spec.ts:881 | chromium | image 1 — the Passport card on Överskt > the Passport column shows what the Passport CONTAINS, not only its totals |
| my-career-home.spec.ts:936 | chromium | image 1 — the Passport card on Överskt > a holder with no Passport gets no empty card |
| my-career-home.spec.ts:812 | mobile-375 | image 1 — the Passport card on Överskt > every control on the profile workspace clears 44px and keeps a focus ring |
| my-career-home.spec.ts:881 | mobile-375 | image 1 — the Passport card on Överskt > the Passport column shows what the Passport CONTAINS, not only its totals |
| my-career-home.spec.ts:936 | mobile-375 | image 1 — the Passport card on Överskt > a holder with no Passport gets no empty card |
| my-career-home.spec.ts:812 | mobile-390 | image 1 — the Passport card on Överskt > every control on the profile workspace clears 44px and keeps a focus ring |
| my-career-home.spec.ts:881 | mobile-390 | image 1 — the Passport card on Överskt > the Passport column shows what the Passport CONTAINS, not only its totals |
| my-career-home.spec.ts:936 | mobile-390 | image 1 — the Passport card on Överskt > a holder with no Passport gets no empty card |
| my-career-hub-screens.spec.ts:52 | chromium | PR #211 · the hub > hub · every area occupied · sv |
| my-career-hub-screens.spec.ts:52 | chromium | PR #211 · the hub > hub · every area occupied · en |
| my-career-hub-screens.spec.ts:131 | chromium | PR #211 · the hub > hub · every tab navigates, and marks itself current on arrival |
| my-career-hub-screens.spec.ts:52 | mobile-375 | PR #211 · the hub > hub · every area occupied · sv |
| my-career-hub-screens.spec.ts:52 | mobile-375 | PR #211 · the hub > hub · every area occupied · en |
| my-career-hub-screens.spec.ts:131 | mobile-375 | PR #211 · the hub > hub · every tab navigates, and marks itself current on arrival |
| my-career-hub-screens.spec.ts:52 | mobile-390 | PR #211 · the hub > hub · every area occupied · sv |
| my-career-hub-screens.spec.ts:52 | mobile-390 | PR #211 · the hub > hub · every area occupied · en |
| my-career-hub-screens.spec.ts:131 | mobile-390 | PR #211 · the hub > hub · every tab navigates, and marks itself current on arrival |
| passport-sharing.spec.ts:489 | chromium | Security Passport — sharing, as the holder > 1 · only shareable merits are offered, nothing is preselected |
| passport-sharing.spec.ts:531 | chromium | Security Passport — sharing, as the holder > 2 · the preview is the recipient page, with exactly what was ticked |
| passport-sharing.spec.ts:578 | chromium | Security Passport — sharing, as the holder > 3 · creating a link: copy, open, expiry, and a way back |
| passport-sharing.spec.ts:623 | chromium | Security Passport — sharing, as the holder > 4 · a blocked clipboard offers a usable way through |
| passport-sharing.spec.ts:637 | chromium | Security Passport — sharing, as the holder > 5 · a lost response reconciles instead of minting a second link |
| passport-sharing.spec.ts:654 | chromium | Security Passport — sharing, as the holder > 6 · a failed create keeps the same request key, so a retry cannot duplicate |
| passport-sharing.spec.ts:716 | chromium | Security Passport — sharing, as the holder > 8 · keyboard only, from choosing a merit to revoking a link |
| passport-sharing.spec.ts:782 | chromium | Security Passport — sharing, as the holder > 10 · the screen fits every width, and 200% zoom |
| passport-sharing.spec.ts:807 | chromium | Security Passport — sharing, as the holder > 11 · English renders completely |
| passport-sharing.spec.ts:489 | mobile-375 | Security Passport — sharing, as the holder > 1 · only shareable merits are offered, nothing is preselected |
| passport-sharing.spec.ts:531 | mobile-375 | Security Passport — sharing, as the holder > 2 · the preview is the recipient page, with exactly what was ticked |
| passport-sharing.spec.ts:578 | mobile-375 | Security Passport — sharing, as the holder > 3 · creating a link: copy, open, expiry, and a way back |
| passport-sharing.spec.ts:623 | mobile-375 | Security Passport — sharing, as the holder > 4 · a blocked clipboard offers a usable way through |
| passport-sharing.spec.ts:637 | mobile-375 | Security Passport — sharing, as the holder > 5 · a lost response reconciles instead of minting a second link |
| passport-sharing.spec.ts:654 | mobile-375 | Security Passport — sharing, as the holder > 6 · a failed create keeps the same request key, so a retry cannot duplicate |
| passport-sharing.spec.ts:716 | mobile-375 | Security Passport — sharing, as the holder > 8 · keyboard only, from choosing a merit to revoking a link |
| passport-sharing.spec.ts:782 | mobile-375 | Security Passport — sharing, as the holder > 10 · the screen fits every width, and 200% zoom |
| passport-sharing.spec.ts:807 | mobile-375 | Security Passport — sharing, as the holder > 11 · English renders completely |
| passport-sharing.spec.ts:489 | mobile-390 | Security Passport — sharing, as the holder > 1 · only shareable merits are offered, nothing is preselected |
| passport-sharing.spec.ts:531 | mobile-390 | Security Passport — sharing, as the holder > 2 · the preview is the recipient page, with exactly what was ticked |
| passport-sharing.spec.ts:578 | mobile-390 | Security Passport — sharing, as the holder > 3 · creating a link: copy, open, expiry, and a way back |
| passport-sharing.spec.ts:623 | mobile-390 | Security Passport — sharing, as the holder > 4 · a blocked clipboard offers a usable way through |
| passport-sharing.spec.ts:637 | mobile-390 | Security Passport — sharing, as the holder > 5 · a lost response reconciles instead of minting a second link |
| passport-sharing.spec.ts:654 | mobile-390 | Security Passport — sharing, as the holder > 6 · a failed create keeps the same request key, so a retry cannot duplicate |
| passport-sharing.spec.ts:716 | mobile-390 | Security Passport — sharing, as the holder > 8 · keyboard only, from choosing a merit to revoking a link |
| passport-sharing.spec.ts:782 | mobile-390 | Security Passport — sharing, as the holder > 10 · the screen fits every width, and 200% zoom |
| passport-sharing.spec.ts:807 | mobile-390 | Security Passport — sharing, as the holder > 11 · English renders completely |
| passport-three-market.spec.ts:977 | chromium | three markets — the write path > A · THE DEFECT: a British licence reached by ?code= saves, in GB |
| passport-three-market.spec.ts:1049 | chromium | three markets — the write path > B · THE DEFECT: a Dubai cadre card reached by ?code= saves, in AE / AE-DU |
| passport-three-market.spec.ts:1119 | chromium | three markets — the write path > C · the same holds for a credential chosen by hand, with no ?code= |
| passport-three-market.spec.ts:1172 | chromium | three markets — the write path > E · a Swedish credential is untouched by any of this |
| passport-three-market.spec.ts:977 | mobile-375 | three markets — the write path > A · THE DEFECT: a British licence reached by ?code= saves, in GB |
| passport-three-market.spec.ts:1049 | mobile-375 | three markets — the write path > B · THE DEFECT: a Dubai cadre card reached by ?code= saves, in AE / AE-DU |
| passport-three-market.spec.ts:1119 | mobile-375 | three markets — the write path > C · the same holds for a credential chosen by hand, with no ?code= |
| passport-three-market.spec.ts:1172 | mobile-375 | three markets — the write path > E · a Swedish credential is untouched by any of this |
| passport-three-market.spec.ts:977 | mobile-390 | three markets — the write path > A · THE DEFECT: a British licence reached by ?code= saves, in GB |
| passport-three-market.spec.ts:1049 | mobile-390 | three markets — the write path > B · THE DEFECT: a Dubai cadre card reached by ?code= saves, in AE / AE-DU |
| passport-three-market.spec.ts:1119 | mobile-390 | three markets — the write path > C · the same holds for a credential chosen by hand, with no ?code= |
| passport-three-market.spec.ts:1172 | mobile-390 | three markets — the write path > E · a Swedish credential is untouched by any of this |
| passport-three-market.spec.ts:1203 | chromium | three markets — the real routes > THE DEFECT: an entitled GB pilot holder gets the 13 governed choices on My information |
| passport-three-market.spec.ts:1239 | chromium | three markets — the real routes > a Dubai pilot holder gets 30 choices, 15/15, with a search field |
| passport-three-market.spec.ts:1481 | chromium | three markets — the real routes > sv · the overview shows one Passport with records from three markets and three market cards |
| passport-three-market.spec.ts:1481 | chromium | three markets — the real routes > en · the overview shows one Passport with records from three markets and three market cards |
| passport-three-market.spec.ts:1520 | chromium | three markets — the real routes > a failed market read costs the cards and nothing else |
| passport-three-market.spec.ts:1203 | mobile-375 | three markets — the real routes > THE DEFECT: an entitled GB pilot holder gets the 13 governed choices on My information |
| passport-three-market.spec.ts:1239 | mobile-375 | three markets — the real routes > a Dubai pilot holder gets 30 choices, 15/15, with a search field |
| passport-three-market.spec.ts:1481 | mobile-375 | three markets — the real routes > sv · the overview shows one Passport with records from three markets and three market cards |
| passport-three-market.spec.ts:1481 | mobile-375 | three markets — the real routes > en · the overview shows one Passport with records from three markets and three market cards |
| passport-three-market.spec.ts:1520 | mobile-375 | three markets — the real routes > a failed market read costs the cards and nothing else |
| passport-three-market.spec.ts:1203 | mobile-390 | three markets — the real routes > THE DEFECT: an entitled GB pilot holder gets the 13 governed choices on My information |
| passport-three-market.spec.ts:1239 | mobile-390 | three markets — the real routes > a Dubai pilot holder gets 30 choices, 15/15, with a search field |
| passport-three-market.spec.ts:1481 | mobile-390 | three markets — the real routes > sv · the overview shows one Passport with records from three markets and three market cards |
| passport-three-market.spec.ts:1481 | mobile-390 | three markets — the real routes > en · the overview shows one Passport with records from three markets and three market cards |
| passport-three-market.spec.ts:1520 | mobile-390 | three markets — the real routes > a failed market read costs the cards and nothing else |
| passport-workspace.spec.ts:673 | chromium | Security Passport — the workspace > 1 · one recorded merit reads as registered, and asks for one more |
| passport-workspace.spec.ts:723 | chromium | Security Passport — the workspace > 2 · a document review reads as documented, never as source-confirmed |
| passport-workspace.spec.ts:744 | chromium | Security Passport — the workspace > 3 · an employer confirmation reads as source-confirmed |
| passport-workspace.spec.ts:760 | chromium | Security Passport — the workspace > 4 · an open review is a status, never the recommended action |
| passport-workspace.spec.ts:776 | chromium | Security Passport — the workspace > 5 · a reviewer's question outranks everything and opens that entry |
| passport-workspace.spec.ts:801 | chromium | Security Passport — the workspace > 6 · an archived merit is history, and is never counted as current |
| passport-workspace.spec.ts:821 | chromium | Security Passport — the workspace > 7 · several states at once, each in exactly one group |
| passport-workspace.spec.ts:857 | chromium | Security Passport — the workspace > 8 · a failed verification read costs its figures, not the page |
| passport-workspace.spec.ts:958 | chromium | Security Passport — the workspace > 10a · Add merit → employment lands on the employment section |
| passport-workspace.spec.ts:975 | chromium | Security Passport — the workspace > 10b · Add merit → education lands on the education section |
| passport-workspace.spec.ts:987 | chromium | Security Passport — the workspace > 10c · Add merit → authorisation lands on the credential form |
| passport-workspace.spec.ts:997 | chromium | Security Passport — the workspace > 10d · Share Passport lands on the sharing centre |
| passport-workspace.spec.ts:1007 | chromium | Security Passport — the workspace > 10e · the CV link lands on the CV list |
| passport-workspace.spec.ts:1014 | chromium | Security Passport — the workspace > 10f · the recipient view lands on the Passport Card |
| passport-workspace.spec.ts:1025 | chromium | Security Passport — the workspace > 10g · a merit row opens THAT merit, not the route family |
| passport-workspace.spec.ts:1037 | chromium | Security Passport — the workspace > 10h · an employment row opens that employment |
| passport-workspace.spec.ts:1047 | chromium | Security Passport — the workspace > 10i · a draft resumes IN the form, carrying its id |
| passport-workspace.spec.ts:1057 | chromium | Security Passport — the workspace > 10j · a reviewer's question opens the merit it is about |
| passport-workspace.spec.ts:1071 | chromium | Security Passport — the workspace > 10k · a refused request opens the merit it decided |
| passport-workspace.spec.ts:1085 | chromium | Security Passport — the workspace > 10l · several questions open the attention region, which is really there |
| passport-workspace.spec.ts:1101 | chromium | Security Passport — the workspace > 10m · asking for verification opens the merits list, which is really there |
| passport-workspace.spec.ts:1117 | chromium | Security Passport — the workspace > 10n · REGRESSION: a failed review read never shows a pending merit as ordinary |
| passport-workspace.spec.ts:1177 | chromium | Security Passport — the workspace > 10o · an intrinsically known standing survives the same failure |
| passport-workspace.spec.ts:1201 | chromium | Security Passport — the workspace > 10p · the add-another-merit step OPENS the chooser, in place |
| passport-workspace.spec.ts:1243 | chromium | Security Passport — the workspace > 10q · a same-page click on #attention resolves, focuses and scrolls |
| passport-workspace.spec.ts:1243 | chromium | Security Passport — the workspace > 10q · a same-page click on #merits resolves, focuses and scrolls |
| passport-workspace.spec.ts:1266 | chromium | Security Passport — the workspace > 10r · a slow but healthy review read never announces a failure |
| passport-workspace.spec.ts:1296 | chromium | Security Passport — the workspace > 10s · a failed review read is explained once, not in two blocks |
| passport-workspace.spec.ts:1312 | chromium | Security Passport — the workspace > 11 · the career home's /passport#attention link lands on a real region |
| passport-workspace.spec.ts:1312 | chromium | Security Passport — the workspace > 11 · the career home's /passport#merits link lands on a real region |
| passport-workspace.spec.ts:1322 | chromium | Security Passport — the workspace > 12 · English is fully translated, including the merit titles |
| passport-workspace.spec.ts:1345 | chromium | Security Passport — the workspace > 13 · every interactive control is big enough and shows its focus |
| passport-workspace.spec.ts:1407 | chromium | Security Passport — the workspace > 13b · the merit chooser is operable from the keyboard alone |
| passport-workspace.spec.ts:673 | mobile-375 | Security Passport — the workspace > 1 · one recorded merit reads as registered, and asks for one more |
| passport-workspace.spec.ts:723 | mobile-375 | Security Passport — the workspace > 2 · a document review reads as documented, never as source-confirmed |
| passport-workspace.spec.ts:744 | mobile-375 | Security Passport — the workspace > 3 · an employer confirmation reads as source-confirmed |
| passport-workspace.spec.ts:760 | mobile-375 | Security Passport — the workspace > 4 · an open review is a status, never the recommended action |
| passport-workspace.spec.ts:776 | mobile-375 | Security Passport — the workspace > 5 · a reviewer's question outranks everything and opens that entry |
| passport-workspace.spec.ts:801 | mobile-375 | Security Passport — the workspace > 6 · an archived merit is history, and is never counted as current |
| passport-workspace.spec.ts:821 | mobile-375 | Security Passport — the workspace > 7 · several states at once, each in exactly one group |
| passport-workspace.spec.ts:857 | mobile-375 | Security Passport — the workspace > 8 · a failed verification read costs its figures, not the page |
| passport-workspace.spec.ts:958 | mobile-375 | Security Passport — the workspace > 10a · Add merit → employment lands on the employment section |
| passport-workspace.spec.ts:975 | mobile-375 | Security Passport — the workspace > 10b · Add merit → education lands on the education section |
| passport-workspace.spec.ts:987 | mobile-375 | Security Passport — the workspace > 10c · Add merit → authorisation lands on the credential form |
| passport-workspace.spec.ts:997 | mobile-375 | Security Passport — the workspace > 10d · Share Passport lands on the sharing centre |
| passport-workspace.spec.ts:1007 | mobile-375 | Security Passport — the workspace > 10e · the CV link lands on the CV list |
| passport-workspace.spec.ts:1014 | mobile-375 | Security Passport — the workspace > 10f · the recipient view lands on the Passport Card |
| passport-workspace.spec.ts:1025 | mobile-375 | Security Passport — the workspace > 10g · a merit row opens THAT merit, not the route family |
| passport-workspace.spec.ts:1037 | mobile-375 | Security Passport — the workspace > 10h · an employment row opens that employment |
| passport-workspace.spec.ts:1047 | mobile-375 | Security Passport — the workspace > 10i · a draft resumes IN the form, carrying its id |
| passport-workspace.spec.ts:1057 | mobile-375 | Security Passport — the workspace > 10j · a reviewer's question opens the merit it is about |
| passport-workspace.spec.ts:1071 | mobile-375 | Security Passport — the workspace > 10k · a refused request opens the merit it decided |
| passport-workspace.spec.ts:1085 | mobile-375 | Security Passport — the workspace > 10l · several questions open the attention region, which is really there |
| passport-workspace.spec.ts:1101 | mobile-375 | Security Passport — the workspace > 10m · asking for verification opens the merits list, which is really there |
| passport-workspace.spec.ts:1117 | mobile-375 | Security Passport — the workspace > 10n · REGRESSION: a failed review read never shows a pending merit as ordinary |
| passport-workspace.spec.ts:1177 | mobile-375 | Security Passport — the workspace > 10o · an intrinsically known standing survives the same failure |
| passport-workspace.spec.ts:1201 | mobile-375 | Security Passport — the workspace > 10p · the add-another-merit step OPENS the chooser, in place |
| passport-workspace.spec.ts:1243 | mobile-375 | Security Passport — the workspace > 10q · a same-page click on #attention resolves, focuses and scrolls |
| passport-workspace.spec.ts:1243 | mobile-375 | Security Passport — the workspace > 10q · a same-page click on #merits resolves, focuses and scrolls |
| passport-workspace.spec.ts:1266 | mobile-375 | Security Passport — the workspace > 10r · a slow but healthy review read never announces a failure |
| passport-workspace.spec.ts:1296 | mobile-375 | Security Passport — the workspace > 10s · a failed review read is explained once, not in two blocks |
| passport-workspace.spec.ts:1312 | mobile-375 | Security Passport — the workspace > 11 · the career home's /passport#attention link lands on a real region |
| passport-workspace.spec.ts:1312 | mobile-375 | Security Passport — the workspace > 11 · the career home's /passport#merits link lands on a real region |
| passport-workspace.spec.ts:1322 | mobile-375 | Security Passport — the workspace > 12 · English is fully translated, including the merit titles |
| passport-workspace.spec.ts:1345 | mobile-375 | Security Passport — the workspace > 13 · every interactive control is big enough and shows its focus |
| passport-workspace.spec.ts:1407 | mobile-375 | Security Passport — the workspace > 13b · the merit chooser is operable from the keyboard alone |
| passport-workspace.spec.ts:673 | mobile-390 | Security Passport — the workspace > 1 · one recorded merit reads as registered, and asks for one more |
| passport-workspace.spec.ts:723 | mobile-390 | Security Passport — the workspace > 2 · a document review reads as documented, never as source-confirmed |
| passport-workspace.spec.ts:744 | mobile-390 | Security Passport — the workspace > 3 · an employer confirmation reads as source-confirmed |
| passport-workspace.spec.ts:760 | mobile-390 | Security Passport — the workspace > 4 · an open review is a status, never the recommended action |
| passport-workspace.spec.ts:776 | mobile-390 | Security Passport — the workspace > 5 · a reviewer's question outranks everything and opens that entry |
| passport-workspace.spec.ts:801 | mobile-390 | Security Passport — the workspace > 6 · an archived merit is history, and is never counted as current |
| passport-workspace.spec.ts:821 | mobile-390 | Security Passport — the workspace > 7 · several states at once, each in exactly one group |
| passport-workspace.spec.ts:857 | mobile-390 | Security Passport — the workspace > 8 · a failed verification read costs its figures, not the page |
| passport-workspace.spec.ts:958 | mobile-390 | Security Passport — the workspace > 10a · Add merit → employment lands on the employment section |
| passport-workspace.spec.ts:975 | mobile-390 | Security Passport — the workspace > 10b · Add merit → education lands on the education section |
| passport-workspace.spec.ts:987 | mobile-390 | Security Passport — the workspace > 10c · Add merit → authorisation lands on the credential form |
| passport-workspace.spec.ts:997 | mobile-390 | Security Passport — the workspace > 10d · Share Passport lands on the sharing centre |
| passport-workspace.spec.ts:1007 | mobile-390 | Security Passport — the workspace > 10e · the CV link lands on the CV list |
| passport-workspace.spec.ts:1014 | mobile-390 | Security Passport — the workspace > 10f · the recipient view lands on the Passport Card |
| passport-workspace.spec.ts:1025 | mobile-390 | Security Passport — the workspace > 10g · a merit row opens THAT merit, not the route family |
| passport-workspace.spec.ts:1037 | mobile-390 | Security Passport — the workspace > 10h · an employment row opens that employment |
| passport-workspace.spec.ts:1047 | mobile-390 | Security Passport — the workspace > 10i · a draft resumes IN the form, carrying its id |
| passport-workspace.spec.ts:1057 | mobile-390 | Security Passport — the workspace > 10j · a reviewer's question opens the merit it is about |
| passport-workspace.spec.ts:1071 | mobile-390 | Security Passport — the workspace > 10k · a refused request opens the merit it decided |
| passport-workspace.spec.ts:1085 | mobile-390 | Security Passport — the workspace > 10l · several questions open the attention region, which is really there |
| passport-workspace.spec.ts:1101 | mobile-390 | Security Passport — the workspace > 10m · asking for verification opens the merits list, which is really there |
| passport-workspace.spec.ts:1117 | mobile-390 | Security Passport — the workspace > 10n · REGRESSION: a failed review read never shows a pending merit as ordinary |
| passport-workspace.spec.ts:1177 | mobile-390 | Security Passport — the workspace > 10o · an intrinsically known standing survives the same failure |
| passport-workspace.spec.ts:1201 | mobile-390 | Security Passport — the workspace > 10p · the add-another-merit step OPENS the chooser, in place |
| passport-workspace.spec.ts:1243 | mobile-390 | Security Passport — the workspace > 10q · a same-page click on #attention resolves, focuses and scrolls |
| passport-workspace.spec.ts:1243 | mobile-390 | Security Passport — the workspace > 10q · a same-page click on #merits resolves, focuses and scrolls |
| passport-workspace.spec.ts:1266 | mobile-390 | Security Passport — the workspace > 10r · a slow but healthy review read never announces a failure |
| passport-workspace.spec.ts:1296 | mobile-390 | Security Passport — the workspace > 10s · a failed review read is explained once, not in two blocks |
| passport-workspace.spec.ts:1312 | mobile-390 | Security Passport — the workspace > 11 · the career home's /passport#attention link lands on a real region |
| passport-workspace.spec.ts:1312 | mobile-390 | Security Passport — the workspace > 11 · the career home's /passport#merits link lands on a real region |
| passport-workspace.spec.ts:1322 | mobile-390 | Security Passport — the workspace > 12 · English is fully translated, including the merit titles |
| passport-workspace.spec.ts:1345 | mobile-390 | Security Passport — the workspace > 13 · every interactive control is big enough and shows its focus |
| passport-workspace.spec.ts:1407 | mobile-390 | Security Passport — the workspace > 13b · the merit chooser is operable from the keyboard alone |
| passport-workspace.spec.ts:1446 | chromium | Security Passport — the workspace at small widths > 14 · nothing overflows horizontally at 375px |
| passport-workspace.spec.ts:1454 | chromium | Security Passport — the workspace at small widths > 15 · nor at 375px in English |
| passport-workspace.spec.ts:1462 | chromium | Security Passport — the workspace at small widths > 16 · nor for a Passport with one merit at 375px |
| passport-workspace.spec.ts:1470 | chromium | Security Passport — the workspace at small widths > 17 · nor at 200% zoom, which is 720 CSS pixels wide |
| passport-workspace.spec.ts:1446 | mobile-375 | Security Passport — the workspace at small widths > 14 · nothing overflows horizontally at 375px |
| passport-workspace.spec.ts:1454 | mobile-375 | Security Passport — the workspace at small widths > 15 · nor at 375px in English |
| passport-workspace.spec.ts:1462 | mobile-375 | Security Passport — the workspace at small widths > 16 · nor for a Passport with one merit at 375px |
| passport-workspace.spec.ts:1470 | mobile-375 | Security Passport — the workspace at small widths > 17 · nor at 200% zoom, which is 720 CSS pixels wide |
| passport-workspace.spec.ts:1446 | mobile-390 | Security Passport — the workspace at small widths > 14 · nothing overflows horizontally at 375px |
| passport-workspace.spec.ts:1454 | mobile-390 | Security Passport — the workspace at small widths > 15 · nor at 375px in English |
| passport-workspace.spec.ts:1462 | mobile-390 | Security Passport — the workspace at small widths > 16 · nor for a Passport with one merit at 375px |
| passport-workspace.spec.ts:1470 | mobile-390 | Security Passport — the workspace at small widths > 17 · nor at 200% zoom, which is 720 CSS pixels wide |
| public-homepage.spec.ts:501 | mobile-375 | the public homepage > header "Logga in" reaches /login and can be left again |
| public-homepage.spec.ts:501 | mobile-375 | the public homepage > header "Karriärvägar" reaches /career-center and can be left again |
| public-homepage.spec.ts:501 | mobile-375 | the public homepage > header "Jobb" reaches /jobs and can be left again |
| public-homepage.spec.ts:501 | mobile-375 | the public homepage > header "Arbetsgivare" reaches /employers and can be left again |
| public-homepage.spec.ts:501 | mobile-375 | the public homepage > header "Om oss" reaches /about and can be left again |
| public-homepage.spec.ts:707 | mobile-375 | the public homepage > switching language preserves the current route |
| public-homepage.spec.ts:501 | mobile-390 | the public homepage > header "Logga in" reaches /login and can be left again |
| public-homepage.spec.ts:501 | mobile-390 | the public homepage > header "Karriärvägar" reaches /career-center and can be left again |
| public-homepage.spec.ts:501 | mobile-390 | the public homepage > header "Jobb" reaches /jobs and can be left again |
| public-homepage.spec.ts:501 | mobile-390 | the public homepage > header "Arbetsgivare" reaches /employers and can be left again |
| public-homepage.spec.ts:501 | mobile-390 | the public homepage > header "Om oss" reaches /about and can be left again |
| public-homepage.spec.ts:707 | mobile-390 | the public homepage > switching language preserves the current route |
