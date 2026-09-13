# BESKT PR 3 — candidate preparation, ROUTED browser evidence

Captured at HEAD `b5168311846a9b9cc8fb773b188394739d5ea85e`, 99 steps over
3 viewport(s), 139.1 s of measured step time.

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
| chromium | library | 3 | 13.9 s |
| chromium | assign | 4 | 4.8 s |
| chromium | notice | 5 | 4.2 s |
| chromium | answer | 7 | 3.5 s |
| chromium | resume | 2 | 3.5 s |
| chromium | review | 3 | 3.3 s |
| chromium | submit | 3 | 0.5 s |
| chromium | readback | 4 | 3.6 s |
| chromium | refusal | 2 | 5.7 s |
| mobile-375 | library | 3 | 21.9 s |
| mobile-375 | assign | 4 | 5.5 s |
| mobile-375 | notice | 5 | 4.0 s |
| mobile-375 | answer | 7 | 3.4 s |
| mobile-375 | resume | 2 | 3.5 s |
| mobile-375 | review | 3 | 3.2 s |
| mobile-375 | submit | 3 | 0.5 s |
| mobile-375 | readback | 4 | 3.5 s |
| mobile-375 | refusal | 2 | 5.6 s |
| mobile-390 | library | 3 | 13.8 s |
| mobile-390 | assign | 4 | 6.7 s |
| mobile-390 | notice | 5 | 4.1 s |
| mobile-390 | answer | 7 | 3.5 s |
| mobile-390 | resume | 2 | 3.9 s |
| mobile-390 | review | 3 | 3.2 s |
| mobile-390 | submit | 3 | 0.5 s |
| mobile-390 | readback | 4 | 3.5 s |
| mobile-390 | refusal | 2 | 5.7 s |

## Screenshots

- `chromium-1-library-en.png` — `9f80e96b6f5567bf…` (137763 bytes)
- `chromium-1-library-sv.png` — `e2e535ecf7696d1b…` (136266 bytes)
- `chromium-2-employer-before-start.png` — `e1fe6e3779c365b4…` (230407 bytes)
- `chromium-2-employer-started.png` — `3c2e6007a07479b5…` (244387 bytes)
- `chromium-3-acknowledged.png` — `bc353e02b9ae89c3…` (133969 bytes)
- `chromium-3-my-career-list.png` — `1c7f39e00b9b7161…` (68990 bytes)
- `chromium-3-notice-en.png` — `1634df5f7ae5cbb9…` (209925 bytes)
- `chromium-3-notice-sv.png` — `e4312648487504f5…` (218188 bytes)
- `chromium-4-answered-sv.png` — `55b69b45846225c8…` (174699 bytes)
- `chromium-4-resumed-sv.png` — `796f3ef947e0b16f…` (177431 bytes)
- `chromium-5-corrected-sv.png` — `c6db8b2abd4bfa26…` (172910 bytes)
- `chromium-5-review-sv.png` — `0ecd8b064948d4b7…` (124425 bytes)
- `chromium-6-submitted-en.png` — `7188a8f00f0aaba8…` (117994 bytes)
- `chromium-6-submitted-sv.png` — `f3420ab59f2dc777…` (120372 bytes)
- `chromium-7-readback-en.png` — `f14e979ac98a0180…` (302267 bytes)
- `chromium-7-readback-sv.png` — `9371018f620b6aff…` (291762 bytes)
- `chromium-8-refused-cross-tenant.png` — `9ebe107a675be005…` (20784 bytes)
- `chromium-8-refused-wrong-candidate.png` — `754e05a1bf0e376d…` (53556 bytes)
- `mobile-375-1-library-en.png` — `cc2b59e5cfa2172b…` (106297 bytes)
- `mobile-375-1-library-sv.png` — `9b4dff2e61bec59c…` (105813 bytes)
- `mobile-375-2-employer-before-start.png` — `2135bb3358598f78…` (187674 bytes)
- `mobile-375-2-employer-started.png` — `39655d369635a39a…` (200369 bytes)
- `mobile-375-3-acknowledged.png` — `e6644b9dc9e0b809…` (113542 bytes)
- `mobile-375-3-my-career-list.png` — `e0ff0291812076a1…` (53687 bytes)
- `mobile-375-3-notice-en.png` — `f6c1c0759438640c…` (201571 bytes)
- `mobile-375-3-notice-sv.png` — `b886f8a66fc3e42d…` (202383 bytes)
- `mobile-375-4-answered-sv.png` — `b3d03c203e24c762…` (159381 bytes)
- `mobile-375-4-resumed-sv.png` — `c6122fb3985fd424…` (158938 bytes)
- `mobile-375-5-corrected-sv.png` — `4624d4e6a732df42…` (156707 bytes)
- `mobile-375-5-review-sv.png` — `9f0eec4feb6d11ae…` (104064 bytes)
- `mobile-375-6-submitted-en.png` — `f41ac13ffebf5f6c…` (102848 bytes)
- `mobile-375-6-submitted-sv.png` — `90c378a6be8eb776…` (102057 bytes)
- `mobile-375-7-readback-en.png` — `5618f8d8a86b0b9b…` (256374 bytes)
- `mobile-375-7-readback-sv.png` — `3bd6a6e854976ea2…` (246370 bytes)
- `mobile-375-8-refused-cross-tenant.png` — `1681410eb052c6fa…` (77737 bytes)
- `mobile-375-8-refused-wrong-candidate.png` — `a7f077650c37b447…` (42922 bytes)
- `mobile-390-1-library-en.png` — `c529ef747c3175d9…` (109288 bytes)
- `mobile-390-1-library-sv.png` — `a8988098fdfe5d79…` (105797 bytes)
- `mobile-390-2-employer-before-start.png` — `6450c14a48a8714b…` (187350 bytes)
- `mobile-390-2-employer-started.png` — `db1890c09ca520eb…` (200414 bytes)
- `mobile-390-3-acknowledged.png` — `bc6823e1ed057c7f…` (117799 bytes)
- `mobile-390-3-my-career-list.png` — `a523bbe8baabbe1e…` (53786 bytes)
- `mobile-390-3-notice-en.png` — `aa04e3457dc89f30…` (200361 bytes)
- `mobile-390-3-notice-sv.png` — `f63da0346e160c21…` (201753 bytes)
- `mobile-390-4-answered-sv.png` — `d647071ca1b0f8d4…` (154405 bytes)
- `mobile-390-4-resumed-sv.png` — `9dff26a84b1d1137…` (158746 bytes)
- `mobile-390-5-corrected-sv.png` — `fe9db8ee4e4bea1d…` (161363 bytes)
- `mobile-390-5-review-sv.png` — `5f2bdb19dad0fc9f…` (102013 bytes)
- `mobile-390-6-submitted-en.png` — `011a3e640a70f533…` (102211 bytes)
- `mobile-390-6-submitted-sv.png` — `0d3bb8b43fb52745…` (101404 bytes)
- `mobile-390-7-readback-en.png` — `68bfa5b95c7df2cb…` (256582 bytes)
- `mobile-390-7-readback-sv.png` — `9e9130d6a48d853f…` (245825 bytes)
- `mobile-390-8-refused-cross-tenant.png` — `f9b2f7f0dca2f940…` (34187 bytes)
- `mobile-390-8-refused-wrong-candidate.png` — `6b28df0d11baa112…` (43040 bytes)

## Traces (digested, not committed)

- `chromium/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-chromium.zip` — `9a6eebe00d89f642…` (2705398 bytes)
- `chromium/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-chromium.zip` — `0613e97195f4aa28…` (1773297 bytes)
- `chromium/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-chromium.zip` — `5b513b2e2d012193…` (1966614 bytes)
- `chromium/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-chromium.zip` — `fc3751341a242985…` (1590634 bytes)
- `chromium/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-chromium.zip` — `30fabcb79cd46649…` (2544697 bytes)
- `chromium/beskt-candidate-preparatio-9d88b-rom-an-existing-application-chromium.zip` — `6441304087723444…` (2282084 bytes)
- `chromium/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-chromium.zip` — `d41d8c860c96e8de…` (3049578 bytes)
- `mobile-375/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-mobile-375.zip` — `484d9e1ebbdeaafe…` (2240303 bytes)
- `mobile-375/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-mobile-375.zip` — `7cd59e31cd68d86b…` (1508224 bytes)
- `mobile-375/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-mobile-375.zip` — `058d5ea7c187c36c…` (2403569 bytes)
- `mobile-375/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-mobile-375.zip` — `a8978726c63b72fd…` (1573088 bytes)
- `mobile-375/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-mobile-375.zip` — `5a8d2217c4fbac79…` (2882496 bytes)
- `mobile-375/beskt-candidate-preparatio-9d88b-rom-an-existing-application-mobile-375.zip` — `6ba172c8a95db649…` (2647921 bytes)
- `mobile-375/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-mobile-375.zip` — `702ad143c2a2b918…` (3392644 bytes)
- `mobile-390/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-mobile-390.zip` — `04b067f21dd97fad…` (2181678 bytes)
- `mobile-390/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-mobile-390.zip` — `810e851745dda49a…` (1593004 bytes)
- `mobile-390/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-mobile-390.zip` — `dc702cfd9936e461…` (2188270 bytes)
- `mobile-390/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-mobile-390.zip` — `cdc71752d6ef601e…` (1494668 bytes)
- `mobile-390/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-mobile-390.zip` — `3027d980414a4b2e…` (2605237 bytes)
- `mobile-390/beskt-candidate-preparatio-9d88b-rom-an-existing-application-mobile-390.zip` — `b37e5ac1e4048dbe…` (2725813 bytes)
- `mobile-390/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-mobile-390.zip` — `f9b992eaa97a2629…` (3536799 bytes)
