# BESKT PR 3 — candidate preparation, ROUTED browser evidence

Captured at HEAD `b86df352e3f4984b840385dd7a947d1fa90afce6`, 96 steps over
3 viewport(s), 152.1 s of measured step time.

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

| Project    | Phase    | Steps | Duration |
| ---------- | -------- | ----: | -------: |
| chromium   | library  |     3 |   16.0 s |
| chromium   | assign   |     4 |    5.0 s |
| chromium   | notice   |     4 |    4.1 s |
| chromium   | answer   |     7 |    3.9 s |
| chromium   | resume   |     2 |    3.7 s |
| chromium   | review   |     3 |    3.5 s |
| chromium   | submit   |     3 |    0.7 s |
| chromium   | readback |     4 |    3.8 s |
| chromium   | refusal  |     2 |    6.1 s |
| mobile-375 | library  |     3 |   26.6 s |
| mobile-375 | assign   |     4 |    5.0 s |
| mobile-375 | notice   |     4 |    4.4 s |
| mobile-375 | answer   |     7 |    3.7 s |
| mobile-375 | resume   |     2 |    3.6 s |
| mobile-375 | review   |     3 |    3.3 s |
| mobile-375 | submit   |     3 |    0.6 s |
| mobile-375 | readback |     4 |    3.6 s |
| mobile-375 | refusal  |     2 |    5.9 s |
| mobile-390 | library  |     3 |   18.0 s |
| mobile-390 | assign   |     4 |    5.1 s |
| mobile-390 | notice   |     4 |    4.1 s |
| mobile-390 | answer   |     7 |    3.9 s |
| mobile-390 | resume   |     2 |    3.5 s |
| mobile-390 | review   |     3 |    3.3 s |
| mobile-390 | submit   |     3 |    0.7 s |
| mobile-390 | readback |     4 |    3.8 s |
| mobile-390 | refusal  |     2 |    6.1 s |

## Screenshots

- `chromium-1-library-en.png` — `9f80e96b6f5567bf…` (137763 bytes)
- `chromium-1-library-sv.png` — `4f3c67381c53f40d…` (116720 bytes)
- `chromium-2-employer-before-start.png` — `f1d7350b81b1f88b…` (228783 bytes)
- `chromium-2-employer-started.png` — `b889a3657f9ea894…` (243938 bytes)
- `chromium-3-acknowledged.png` — `43001deb0ea7ee54…` (133929 bytes)
- `chromium-3-my-career-list.png` — `cbfbf9e6efb294f3…` (68980 bytes)
- `chromium-3-notice-sv.png` — `e4312648487504f5…` (218188 bytes)
- `chromium-4-answered-sv.png` — `b71877854802986b…` (174712 bytes)
- `chromium-4-resumed-sv.png` — `796f3ef947e0b16f…` (177431 bytes)
- `chromium-5-corrected-sv.png` — `4c63a7df8d55b9d9…` (172909 bytes)
- `chromium-5-review-sv.png` — `791c87b611b27436…` (124418 bytes)
- `chromium-6-submitted-en.png` — `a1aeb56c5b235ec7…` (117775 bytes)
- `chromium-6-submitted-sv.png` — `1dd31636269d16d0…` (120309 bytes)
- `chromium-7-readback-en.png` — `93afd29d5b7c12b2…` (301683 bytes)
- `chromium-7-readback-sv.png` — `cddd373722d0df4a…` (291395 bytes)
- `chromium-8-refused-cross-tenant.png` — `ae74926564df1c06…` (123578 bytes)
- `chromium-8-refused-wrong-candidate.png` — `754e05a1bf0e376d…` (53556 bytes)
- `mobile-375-1-library-en.png` — `10314e90bc3901aa…` (106252 bytes)
- `mobile-375-1-library-sv.png` — `0aefaa09e6cc2f99…` (49454 bytes)
- `mobile-375-2-employer-before-start.png` — `5f2f3b18373555ab…` (185878 bytes)
- `mobile-375-2-employer-started.png` — `ad422472b2355ef7…` (199792 bytes)
- `mobile-375-3-acknowledged.png` — `7d5b7b27a5f47709…` (113372 bytes)
- `mobile-375-3-my-career-list.png` — `b6ad8da922c9de1e…` (57767 bytes)
- `mobile-375-3-notice-sv.png` — `b886f8a66fc3e42d…` (202383 bytes)
- `mobile-375-4-answered-sv.png` — `af7aebd85009b2f4…` (159381 bytes)
- `mobile-375-4-resumed-sv.png` — `c6122fb3985fd424…` (158938 bytes)
- `mobile-375-5-corrected-sv.png` — `fe475bd133d80380…` (156668 bytes)
- `mobile-375-5-review-sv.png` — `a7494116fc566fc8…` (104292 bytes)
- `mobile-375-6-submitted-en.png` — `fce40472f5d9cfcf…` (102778 bytes)
- `mobile-375-6-submitted-sv.png` — `ae3131c7938812d8…` (102012 bytes)
- `mobile-375-7-readback-en.png` — `76142bf21bea653f…` (255582 bytes)
- `mobile-375-7-readback-sv.png` — `6c82bc1c112ee3f7…` (245903 bytes)
- `mobile-375-8-refused-cross-tenant.png` — `702b5903150acf16…` (21993 bytes)
- `mobile-375-8-refused-wrong-candidate.png` — `a7f077650c37b447…` (42922 bytes)
- `mobile-390-1-library-en.png` — `7beb05d9fae9baa6…` (109246 bytes)
- `mobile-390-1-library-sv.png` — `e152d1eb64673730…` (55182 bytes)
- `mobile-390-2-employer-before-start.png` — `46bc91fa798293a5…` (186044 bytes)
- `mobile-390-2-employer-started.png` — `fae80c43721af008…` (199830 bytes)
- `mobile-390-3-acknowledged.png` — `8a2df3812e9cf9df…` (117764 bytes)
- `mobile-390-3-my-career-list.png` — `84bdfd79333e55d4…` (70104 bytes)
- `mobile-390-3-notice-sv.png` — `f63da0346e160c21…` (201753 bytes)
- `mobile-390-4-answered-sv.png` — `b9f1c447c9994bd3…` (154404 bytes)
- `mobile-390-4-resumed-sv.png` — `9dff26a84b1d1137…` (158746 bytes)
- `mobile-390-5-corrected-sv.png` — `d7b5d7ac152db72a…` (161398 bytes)
- `mobile-390-5-review-sv.png` — `b5ec14ff8e46f3e3…` (102373 bytes)
- `mobile-390-6-submitted-en.png` — `1f95960818248959…` (102166 bytes)
- `mobile-390-6-submitted-sv.png` — `0bcdc45af881c543…` (101355 bytes)
- `mobile-390-7-readback-en.png` — `385299c389f89dd7…` (255715 bytes)
- `mobile-390-7-readback-sv.png` — `47f37b39868540b4…` (245375 bytes)
- `mobile-390-8-refused-cross-tenant.png` — `1effe865337833cb…` (19999 bytes)
- `mobile-390-8-refused-wrong-candidate.png` — `6b28df0d11baa112…` (43040 bytes)

## Traces (digested, not committed)

- `chromium/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-chromium.zip` — `1cd577eb7836ba10…` (2775627 bytes)
- `chromium/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-chromium.zip` — `b539f26a797f2e02…` (2337528 bytes)
- `chromium/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-chromium.zip` — `201d911dad82801c…` (2212271 bytes)
- `chromium/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-chromium.zip` — `5da0fb8cfbe909d4…` (1697136 bytes)
- `chromium/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-chromium.zip` — `60eb53e229efabd0…` (2863077 bytes)
- `chromium/beskt-candidate-preparatio-9d88b-rom-an-existing-application-chromium.zip` — `dd46fece08cd1d1b…` (2391546 bytes)
- `chromium/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-chromium.zip` — `df813d324889f750…` (2850835 bytes)
- `mobile-375/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-mobile-375.zip` — `22304f9a6b2e1e95…` (2585737 bytes)
- `mobile-375/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-mobile-375.zip` — `cc8e3e7a499740f9…` (2063078 bytes)
- `mobile-375/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-mobile-375.zip` — `0dbe95fd8a1a808c…` (2484491 bytes)
- `mobile-375/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-mobile-375.zip` — `ed0e86a81d6fdcb6…` (1672027 bytes)
- `mobile-375/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-mobile-375.zip` — `9fd67e80a759572b…` (3285151 bytes)
- `mobile-375/beskt-candidate-preparatio-9d88b-rom-an-existing-application-mobile-375.zip` — `4192d6bbf2a3dfbf…` (2912948 bytes)
- `mobile-375/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-mobile-375.zip` — `735a24ba921d0c97…` (3398973 bytes)
- `mobile-390/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-mobile-390.zip` — `29912bc5cc97fd73…` (2531512 bytes)
- `mobile-390/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-mobile-390.zip` — `f5244abd49fd5fb5…` (1978628 bytes)
- `mobile-390/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-mobile-390.zip` — `89429442b1094552…` (2277407 bytes)
- `mobile-390/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-mobile-390.zip` — `856f97e9e9dfc085…` (1505234 bytes)
- `mobile-390/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-mobile-390.zip` — `14ebafbf8e9be7ac…` (3160670 bytes)
- `mobile-390/beskt-candidate-preparatio-9d88b-rom-an-existing-application-mobile-390.zip` — `bd6513db0c9131af…` (2835824 bytes)
- `mobile-390/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-mobile-390.zip` — `8d412b2eaf3fde92…` (3311016 bytes)
