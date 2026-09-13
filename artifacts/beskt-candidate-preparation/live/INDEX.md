# BESKT PR 3 — candidate preparation, ROUTED browser evidence

Captured at HEAD `340785c62e1b7b9f19dc2ccbca7d10f9e3ec48d0`, 96 steps over
3 viewport(s), 132.7 s of measured step time.

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
| chromium | assign | 4 | 5.0 s |
| chromium | notice | 4 | 4.4 s |
| chromium | answer | 7 | 3.5 s |
| chromium | resume | 2 | 4.0 s |
| chromium | review | 3 | 3.3 s |
| chromium | submit | 3 | 0.5 s |
| chromium | readback | 4 | 3.7 s |
| chromium | refusal | 2 | 5.8 s |
| mobile-375 | library | 3 | 18.1 s |
| mobile-375 | assign | 4 | 4.5 s |
| mobile-375 | notice | 4 | 4.2 s |
| mobile-375 | answer | 7 | 3.4 s |
| mobile-375 | resume | 2 | 4.1 s |
| mobile-375 | review | 3 | 3.2 s |
| mobile-375 | submit | 3 | 0.5 s |
| mobile-375 | readback | 4 | 3.5 s |
| mobile-375 | refusal | 2 | 5.5 s |
| mobile-390 | library | 3 | 12.8 s |
| mobile-390 | assign | 4 | 4.5 s |
| mobile-390 | notice | 4 | 3.6 s |
| mobile-390 | answer | 7 | 3.3 s |
| mobile-390 | resume | 2 | 4.5 s |
| mobile-390 | review | 3 | 3.0 s |
| mobile-390 | submit | 3 | 0.5 s |
| mobile-390 | readback | 4 | 3.5 s |
| mobile-390 | refusal | 2 | 5.7 s |

## Screenshots

- `chromium-1-library-en.png` — `9f80e96b6f5567bf…` (137763 bytes)
- `chromium-1-library-sv.png` — `e2e535ecf7696d1b…` (136266 bytes)
- `chromium-2-employer-before-start.png` — `e1fe6e3779c365b4…` (230407 bytes)
- `chromium-2-employer-started.png` — `3c2e6007a07479b5…` (244387 bytes)
- `chromium-3-acknowledged.png` — `43001deb0ea7ee54…` (133929 bytes)
- `chromium-3-my-career-list.png` — `4859d37c9a776a08…` (112029 bytes)
- `chromium-3-notice-sv.png` — `e4312648487504f5…` (218188 bytes)
- `chromium-4-answered-sv.png` — `55b69b45846225c8…` (174699 bytes)
- `chromium-4-resumed-sv.png` — `796f3ef947e0b16f…` (177431 bytes)
- `chromium-5-corrected-sv.png` — `2f04a39adf0707a9…` (172869 bytes)
- `chromium-5-review-sv.png` — `0ecd8b064948d4b7…` (124425 bytes)
- `chromium-6-submitted-en.png` — `1547444faea65079…` (117834 bytes)
- `chromium-6-submitted-sv.png` — `cd54b689c3d39356…` (120523 bytes)
- `chromium-7-readback-en.png` — `eb68a72bd4273ae1…` (302032 bytes)
- `chromium-7-readback-sv.png` — `04765937cc595648…` (291634 bytes)
- `chromium-8-refused-cross-tenant.png` — `9ebe107a675be005…` (20784 bytes)
- `chromium-8-refused-wrong-candidate.png` — `754e05a1bf0e376d…` (53556 bytes)
- `mobile-375-1-library-en.png` — `cc2b59e5cfa2172b…` (106297 bytes)
- `mobile-375-1-library-sv.png` — `9b4dff2e61bec59c…` (105813 bytes)
- `mobile-375-2-employer-before-start.png` — `dddd51f86435d0c1…` (187626 bytes)
- `mobile-375-2-employer-started.png` — `39655d369635a39a…` (200369 bytes)
- `mobile-375-3-acknowledged.png` — `7d5b7b27a5f47709…` (113372 bytes)
- `mobile-375-3-my-career-list.png` — `e0ff0291812076a1…` (53687 bytes)
- `mobile-375-3-notice-sv.png` — `b886f8a66fc3e42d…` (202383 bytes)
- `mobile-375-4-answered-sv.png` — `b3d03c203e24c762…` (159381 bytes)
- `mobile-375-4-resumed-sv.png` — `c6122fb3985fd424…` (158938 bytes)
- `mobile-375-5-corrected-sv.png` — `fe475bd133d80380…` (156668 bytes)
- `mobile-375-5-review-sv.png` — `9f0eec4feb6d11ae…` (104064 bytes)
- `mobile-375-6-submitted-en.png` — `4d473be796f3ffe2…` (102833 bytes)
- `mobile-375-6-submitted-sv.png` — `0ff4fbada9f51570…` (102038 bytes)
- `mobile-375-7-readback-en.png` — `baf25528c089f491…` (256137 bytes)
- `mobile-375-7-readback-sv.png` — `432c37d60f795d9a…` (246063 bytes)
- `mobile-375-8-refused-cross-tenant.png` — `702b5903150acf16…` (21993 bytes)
- `mobile-375-8-refused-wrong-candidate.png` — `a7f077650c37b447…` (42922 bytes)
- `mobile-390-1-library-en.png` — `c529ef747c3175d9…` (109288 bytes)
- `mobile-390-1-library-sv.png` — `a8988098fdfe5d79…` (105797 bytes)
- `mobile-390-2-employer-before-start.png` — `dda695d43c969f80…` (189144 bytes)
- `mobile-390-2-employer-started.png` — `db1890c09ca520eb…` (200414 bytes)
- `mobile-390-3-acknowledged.png` — `8a2df3812e9cf9df…` (117764 bytes)
- `mobile-390-3-my-career-list.png` — `b5a6a51c8e78ee92…` (70237 bytes)
- `mobile-390-3-notice-sv.png` — `f63da0346e160c21…` (201753 bytes)
- `mobile-390-4-answered-sv.png` — `d647071ca1b0f8d4…` (154405 bytes)
- `mobile-390-4-resumed-sv.png` — `9dff26a84b1d1137…` (158746 bytes)
- `mobile-390-5-corrected-sv.png` — `70dc90a80a00a95a…` (161377 bytes)
- `mobile-390-5-review-sv.png` — `eb112b347f047561…` (102019 bytes)
- `mobile-390-6-submitted-en.png` — `95b12f85eff4afa5…` (102144 bytes)
- `mobile-390-6-submitted-sv.png` — `e9bd8ff338f48669…` (101284 bytes)
- `mobile-390-7-readback-en.png` — `ec5ea278a1251f25…` (256388 bytes)
- `mobile-390-7-readback-sv.png` — `7e6344675add3cf9…` (245650 bytes)
- `mobile-390-8-refused-cross-tenant.png` — `4e4d55b2f121ed5d…` (22168 bytes)
- `mobile-390-8-refused-wrong-candidate.png` — `6b28df0d11baa112…` (43040 bytes)

## Traces (digested, not committed)

- `chromium/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-chromium.zip` — `d15fe384eff56b8e…` (2632041 bytes)
- `chromium/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-chromium.zip` — `b70b32b635b070ac…` (1996571 bytes)
- `chromium/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-chromium.zip` — `9de452217456a8c4…` (2034721 bytes)
- `chromium/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-chromium.zip` — `f6e6dc28add3f7b4…` (1599249 bytes)
- `chromium/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-chromium.zip` — `7037d140026351ad…` (2536209 bytes)
- `chromium/beskt-candidate-preparatio-9d88b-rom-an-existing-application-chromium.zip` — `62b18bbff01a4f9c…` (2273622 bytes)
- `chromium/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-chromium.zip` — `6a62895206177381…` (2443222 bytes)
- `mobile-375/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-mobile-375.zip` — `36b4ca46b91d04c7…` (2317535 bytes)
- `mobile-375/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-mobile-375.zip` — `2c0bcec02e29142c…` (1515069 bytes)
- `mobile-375/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-mobile-375.zip` — `1879febdff7560de…` (2409640 bytes)
- `mobile-375/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-mobile-375.zip` — `ed50efc9d05da131…` (1616165 bytes)
- `mobile-375/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-mobile-375.zip` — `e52c991b6381a175…` (2986541 bytes)
- `mobile-375/beskt-candidate-preparatio-9d88b-rom-an-existing-application-mobile-375.zip` — `d2b1f924f0fba669…` (2659208 bytes)
- `mobile-375/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-mobile-375.zip` — `1f67867aeb3df8ec…` (3481287 bytes)
- `mobile-390/beskt-candidate-preparatio-2c3eb-g-employer-are-both-refused-mobile-390.zip` — `a6fef00556858445…` (2121405 bytes)
- `mobile-390/beskt-candidate-preparatio-580fd-d-and-states-its-real-state-mobile-390.zip` — `ca8d652e36182229…` (1583603 bytes)
- `mobile-390/beskt-candidate-preparatio-625a5-iew-correct-and-submit-once-mobile-390.zip` — `265bf320563027d3…` (2241342 bytes)
- `mobile-390/beskt-candidate-preparatio-6b9df-s-and-nothing-it-interprets-mobile-390.zip` — `64c854f287b11a4c…` (1547321 bytes)
- `mobile-390/beskt-candidate-preparatio-802b5-saving-leaving-and-resuming-mobile-390.zip` — `3b2f10f170af1d77…` (2589745 bytes)
- `mobile-390/beskt-candidate-preparatio-9d88b-rom-an-existing-application-mobile-390.zip` — `6be43849371f9d0e…` (2580846 bytes)
- `mobile-390/beskt-candidate-preparatio-e524f-re-anything-can-be-answered-mobile-390.zip` — `d0429e5634ef7e3f…` (3031028 bytes)
