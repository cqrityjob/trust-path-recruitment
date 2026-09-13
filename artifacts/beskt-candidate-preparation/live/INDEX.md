# BESKT PR 3 — candidate preparation, ROUTED browser evidence

Captured at HEAD `c14adf234d21741dae9f63926aec6a909a3e8e47`, 132 steps over
3 viewport(s), 226.8 s of measured step time.

## What these captures are

The real application, on its real routes, signed in as real fixture accounts,
writing real rows through the governed RPCs. Not exported components and not
rendered markup: a browser walked

1. the employer's Testbibliotek, which names the method support and never
   calls it a test;
2. starting a preparation from an existing application, and the employer
   seeing **nothing** of the candidate's while it is still a draft;
3. the candidate's notice — all nine matters — with no question answerable
   until it is acknowledged;
4. answering, saving, leaving and resuming with the exact same answers;
5. taking one question orally and skipping another;
6. reviewing every response and correcting one;
7. submitting once, after which the screen is read-only;
8. the employer reading back the submitted basis, the omitted and
   discuss-orally states and the interview topics;
9. a second candidate refused this preparation, and a member of another
   employer refused the readback.

In Swedish and English, at chromium, mobile-375, mobile-390.

## The stack it ran against

Real PostgreSQL 16 carrying the full migration history, replayed as
`postgres` against the hosted privilege baseline. Real PostgREST enforcing
the real RLS as `authenticator`. Real routes, real server functions, real
`auth.uid()` read from a verified JWT.

**One part is substituted and it is named here rather than glossed:** GoTrue.
Its container image could not be fetched in the environment this was captured
in — every registry blob CDN answered 403 — so password sign-in, token refresh
and `/auth/v1/user` are served by `scripts/local-stack/auth-gateway.mjs`
against the same `auth.users` rows, with the same bcrypt verification and the
same HS256 secret PostgREST verifies with. Everything the walk asserts about
authorisation is still decided by the database.

## Traces

Captured with `--trace on`, and **not committed**: a trace records the
network, so it carries the signed-in session's bearer token. Their digests are
below so a reviewer reproducing the run can check they got the same files.

## Reproduce

```
scripts/local-stack/up.sh
scripts/local-stack/run-routed-evidence.sh
```

## Phase durations

| Project | Phase | Steps | Duration |
| --- | --- | ---: | ---: |
| chromium | library | 3 | 20.3 s |
| chromium | assign | 7 | 9.4 s |
| chromium | notice | 5 | 5.4 s |
| chromium | answer | 9 | 9.2 s |
| chromium | resume | 2 | 3.0 s |
| chromium | review | 4 | 4.9 s |
| chromium | submit | 3 | 0.7 s |
| chromium | readback | 4 | 4.2 s |
| chromium | refusal | 2 | 6.9 s |
| chromium | cancel | 5 | 8.0 s |
| mobile-375 | library | 3 | 31.1 s |
| mobile-375 | assign | 7 | 7.7 s |
| mobile-375 | notice | 5 | 5.2 s |
| mobile-375 | answer | 9 | 11.2 s |
| mobile-375 | resume | 2 | 2.8 s |
| mobile-375 | review | 4 | 4.7 s |
| mobile-375 | submit | 3 | 0.6 s |
| mobile-375 | readback | 4 | 3.9 s |
| mobile-375 | refusal | 2 | 6.3 s |
| mobile-375 | cancel | 5 | 9.9 s |
| mobile-390 | library | 3 | 18.7 s |
| mobile-390 | assign | 7 | 7.8 s |
| mobile-390 | notice | 5 | 5.2 s |
| mobile-390 | answer | 9 | 11.1 s |
| mobile-390 | resume | 2 | 2.8 s |
| mobile-390 | review | 4 | 4.8 s |
| mobile-390 | submit | 3 | 0.6 s |
| mobile-390 | readback | 4 | 4.0 s |
| mobile-390 | refusal | 2 | 6.6 s |
| mobile-390 | cancel | 5 | 9.6 s |

## Screenshots

- `chromium-1-library-en.png` — `7ad8e9b652e1d070…` (160794 bytes)
- `chromium-1-library-sv.png` — `f8c72aa398d4fe26…` (159033 bytes)
- `chromium-2-employer-before-start.png` — `d0539c483f16d35a…` (226243 bytes)
- `chromium-2-employer-started.png` — `1c93768db62ba158…` (255730 bytes)
- `chromium-3-acknowledged.png` — `12644d98840fa78f…` (172110 bytes)
- `chromium-3-my-career-list.png` — `31a03cb5c36545d8…` (69005 bytes)
- `chromium-3-notice-en.png` — `fd227d3c13ff33e6…` (210214 bytes)
- `chromium-3-notice-sv.png` — `e4312648487504f5…` (218188 bytes)
- `chromium-4-answered-sv.png` — `3108cc1796cb0501…` (215190 bytes)
- `chromium-4-resumed-sv.png` — `f19b6b3be7c504e8…` (216569 bytes)
- `chromium-5-corrected-sv.png` — `1c85d448640bdbfb…` (209734 bytes)
- `chromium-5-review-sv.png` — `b0018872e6e909f4…` (139303 bytes)
- `chromium-6-submitted-en.png` — `ee3c307dfc8aff8c…` (132246 bytes)
- `chromium-6-submitted-sv.png` — `16a9c1bec970f539…` (133114 bytes)
- `chromium-7-readback-en.png` — `58803533e34e21a5…` (316261 bytes)
- `chromium-7-readback-sv.png` — `e68c9400a6e6b153…` (304482 bytes)
- `chromium-8-refused-cross-tenant.png` — `17a7b4e8065ac16e…` (22859 bytes)
- `chromium-8-refused-wrong-candidate.png` — `754e05a1bf0e376d…` (53556 bytes)
- `chromium-9-cancel-dialog.png` — `0bd18a42fb13971c…` (262620 bytes)
- `chromium-9-cancelled.png` — `fc1d9eaed6c64270…` (226756 bytes)
- `chromium-9-replaced-en.png` — `735b9a6c528ffa62…` (267190 bytes)
- `chromium-9-replaced.png` — `786d6bed93a2de81…` (252625 bytes)
- `mobile-375-1-library-en.png` — `b81db6df8be0707a…` (128153 bytes)
- `mobile-375-1-library-sv.png` — `f22fcb6a0ed7da6d…` (127667 bytes)
- `mobile-375-2-employer-before-start.png` — `75da2f89ccab37e2…` (173116 bytes)
- `mobile-375-2-employer-started.png` — `b5a5ddb6c2bc00fb…` (211607 bytes)
- `mobile-375-3-acknowledged.png` — `413845827d0ecb27…` (156509 bytes)
- `mobile-375-3-my-career-list.png` — `5c6d3ae373848f64…` (69379 bytes)
- `mobile-375-3-notice-en.png` — `e86428e218f3a7f3…` (201971 bytes)
- `mobile-375-3-notice-sv.png` — `b886f8a66fc3e42d…` (202383 bytes)
- `mobile-375-4-answered-sv.png` — `7f82686a2be997b9…` (195496 bytes)
- `mobile-375-4-resumed-sv.png` — `681bad85d6a2beca…` (196292 bytes)
- `mobile-375-5-corrected-sv.png` — `7c98f8d02710fe47…` (195798 bytes)
- `mobile-375-5-review-sv.png` — `68a8067d68d545c6…` (116216 bytes)
- `mobile-375-6-submitted-en.png` — `cff4e20e09648c21…` (116514 bytes)
- `mobile-375-6-submitted-sv.png` — `a99b8d455d1341bf…` (113372 bytes)
- `mobile-375-7-readback-en.png` — `bc1529fcce6f0d2e…` (269417 bytes)
- `mobile-375-7-readback-sv.png` — `2231dab3570d860b…` (258032 bytes)
- `mobile-375-8-refused-cross-tenant.png` — `cd8be098c4e0f7f6…` (34026 bytes)
- `mobile-375-8-refused-wrong-candidate.png` — `a7f077650c37b447…` (42922 bytes)
- `mobile-375-9-cancel-dialog.png` — `24c4ee4278b8fe93…` (225196 bytes)
- `mobile-375-9-cancelled.png` — `b5200520bd9c666f…` (183932 bytes)
- `mobile-375-9-replaced-en.png` — `a7a7f2dfffd7363d…` (223773 bytes)
- `mobile-375-9-replaced.png` — `28e862add0b2ec22…` (207896 bytes)
- `mobile-390-1-library-en.png` — `b7e47c6f6f03c1a0…` (131656 bytes)
- `mobile-390-1-library-sv.png` — `bb3a35e91fb2ddbd…` (127957 bytes)
- `mobile-390-2-employer-before-start.png` — `0a8e93fe9394422f…` (172278 bytes)
- `mobile-390-2-employer-started.png` — `7152047104eeb6fc…` (211404 bytes)
- `mobile-390-3-acknowledged.png` — `7e546516042b3c15…` (150816 bytes)
- `mobile-390-3-my-career-list.png` — `a523bbe8baabbe1e…` (53786 bytes)
- `mobile-390-3-notice-en.png` — `aa04e3457dc89f30…` (200361 bytes)
- `mobile-390-3-notice-sv.png` — `f63da0346e160c21…` (201753 bytes)
- `mobile-390-4-answered-sv.png` — `d9a699b0e789d812…` (194333 bytes)
- `mobile-390-4-resumed-sv.png` — `48490875345621f8…` (196024 bytes)
- `mobile-390-5-corrected-sv.png` — `55c2db0e550915ba…` (195462 bytes)
- `mobile-390-5-review-sv.png` — `eaee33937477677c…` (117485 bytes)
- `mobile-390-6-submitted-en.png` — `86d32873d7a99ba3…` (114668 bytes)
- `mobile-390-6-submitted-sv.png` — `33f6bf03feae6d07…` (112308 bytes)
- `mobile-390-7-readback-en.png` — `f07af226f139b773…` (269634 bytes)
- `mobile-390-7-readback-sv.png` — `80e814051373b98b…` (257506 bytes)
- `mobile-390-8-refused-cross-tenant.png` — `f8f64888d626934b…` (77746 bytes)
- `mobile-390-8-refused-wrong-candidate.png` — `6b28df0d11baa112…` (43040 bytes)
- `mobile-390-9-cancel-dialog.png` — `1dad117c1cda6db3…` (221839 bytes)
- `mobile-390-9-cancelled.png` — `30f1829c1fd11993…` (183602 bytes)
- `mobile-390-9-replaced-en.png` — `223e9ed3c21a7af2…` (223476 bytes)
- `mobile-390-9-replaced.png` — `602b7e91b8823454…` (211746 bytes)

## Traces (digested, not committed)

- `chromium/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-chromium.zip` — `e44c5d442e2c9066…` (2736053 bytes)
- `chromium/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-chromium.zip` — `69c4482ec938d841…` (1898799 bytes)
- `chromium/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-chromium.zip` — `768ebe20e3976f92…` (2561017 bytes)
- `chromium/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-chromium.zip` — `0ead45f08e8828bd…` (1477111 bytes)
- `chromium/beskt-candidate-preparatio-6ed53-lled-and-correctly-replaced-chromium.zip` — `3b1773f38f71e826…` (5353316 bytes)
- `chromium/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-chromium.zip` — `c141440b97ee9838…` (3859750 bytes)
- `chromium/beskt-candidate-preparatio-9d88b-rom-an-existing-application-chromium.zip` — `53c4ad61b1384cfe…` (4306559 bytes)
- `chromium/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-chromium.zip` — `1a59b3df2f292f5b…` (3086351 bytes)
- `mobile-375/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-mobile-375.zip` — `eac27b01bc0a0868…` (2733082 bytes)
- `mobile-375/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-mobile-375.zip` — `e3c69e19e43d2626…` (1945239 bytes)
- `mobile-375/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-mobile-375.zip` — `e5a779d51dde47ed…` (3348918 bytes)
- `mobile-375/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-mobile-375.zip` — `619a133c1c34d526…` (1623396 bytes)
- `mobile-375/beskt-candidate-preparatio-6ed53-lled-and-correctly-replaced-mobile-375.zip` — `18583eb8f65f2917…` (7924230 bytes)
- `mobile-375/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-mobile-375.zip` — `5b2d320afa32ada9…` (5308225 bytes)
- `mobile-375/beskt-candidate-preparatio-9d88b-rom-an-existing-application-mobile-375.zip` — `04a8bf97cd2dc97c…` (6416116 bytes)
- `mobile-375/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-mobile-375.zip` — `490d946f83179e0d…` (3798184 bytes)
- `mobile-390/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-mobile-390.zip` — `fa45116bf161d567…` (2763677 bytes)
- `mobile-390/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-mobile-390.zip` — `d6dfba8112f5d70f…` (1584713 bytes)
- `mobile-390/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-mobile-390.zip` — `9dadce0dee60268a…` (3250737 bytes)
- `mobile-390/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-mobile-390.zip` — `8884c7e551fd1129…` (1569768 bytes)
- `mobile-390/beskt-candidate-preparatio-6ed53-lled-and-correctly-replaced-mobile-390.zip` — `8ed0291dbd5ace07…` (7808729 bytes)
- `mobile-390/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-mobile-390.zip` — `c8c2425b3e03864c…` (5381808 bytes)
- `mobile-390/beskt-candidate-preparatio-9d88b-rom-an-existing-application-mobile-390.zip` — `0132c340645bcce9…` (6788358 bytes)
- `mobile-390/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-mobile-390.zip` — `b24df401341b607b…` (3769614 bytes)
