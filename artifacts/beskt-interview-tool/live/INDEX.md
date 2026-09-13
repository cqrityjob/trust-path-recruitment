# BESKT PR 5B — the interview tool, ROUTED browser evidence

Captured at HEAD `f4cc9980da207e89d9df60cdfb8d14233b541aa2`, 165 steps over
3 viewport(s), 270.1 s of measured step time.

## What these captures are

The real application, on its real routes, signed in as real fixture accounts,
writing real rows through the governed PR 5A RPCs. Not exported components and
not rendered markup: a browser walked all twenty journeys —

1. the case overview carrying the BESKT module, gated by the server;
2. the module opening inside the case and naming what it is bound to;
3. the bound content and answer digests, disclosed rather than asserted;
4. the submitted preparation shown whole, with answered, skipped and
   discuss-orally rendered neutrally;
5. an interviewer surface with no control that could edit the candidate's words;
6. the conduct session opening, and an empty position refusing to lock;
7. the deterministic themes with their reason, wording, purpose, exact item
   key and method version;
8. one theme documented in eight separate fields;
9. a save reported only after the server confirmed it;
10. a correction refused without a reason, then accepted as version 2;
11. the history keeping every version, with who wrote it and when;
12. a verification requested, then settled, with its history;
13. "not verified" rendered as remaining work and never as a judgement;
14. locking behind a described, modal confirmation;
15. the locked position read-only, with its revision and time;
16. a SECOND assessor seeing nothing of the first — asserted at the network,
    not only on screen;
17. that assessor documenting and locking their own position;
18. the two positions side by side, factually, with no total anywhere;
19. reopening refused without a reason, then accepted, losing nothing;
20. the panel revealing, recording a disagreement word for word, and a member
    of another employer refused the route.

In Swedish and English, at chromium, mobile-375, mobile-390.

## The one journey this structure exists for

Journey 16 does not merely check that a withheld position is off screen. Every
response body the second assessor's browser receives before they lock is read
and searched for the first assessor's exact words. A position that arrives in a
payload and is merely hidden by CSS has already been disclosed, and only a
network-level assertion can tell the two apart.

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
authorisation — including the withholding in journey 16 — is still decided by
the database.

## Traces

Captured with `--trace on`, and **not committed**: a trace records the
network, so it carries the signed-in session's bearer token. Their digests are
below so a reviewer reproducing the run can check they got the same files.

## Reproduce

```
scripts/local-stack/up.sh
scripts/local-stack/run-interview-tool-evidence.sh
```

## Phase durations

| Project | Phase | Steps | Duration |
| --- | --- | ---: | ---: |
| chromium | overview | 3 | 43.4 s |
| chromium | open | 4 | 4.8 s |
| chromium | binding | 1 | 0.9 s |
| chromium | snapshot | 4 | 1.5 s |
| chromium | session | 2 | 3.8 s |
| chromium | themes | 3 | 1.8 s |
| chromium | document | 3 | 1.6 s |
| chromium | confirm | 2 | 1.4 s |
| chromium | correct | 2 | 1.5 s |
| chromium | history | 1 | 0.7 s |
| chromium | verify | 2 | 1.7 s |
| chromium | neutral | 2 | 1.5 s |
| chromium | lock | 3 | 0.9 s |
| chromium | locked | 3 | 5.0 s |
| chromium | independence | 4 | 7.7 s |
| chromium | second | 3 | 4.2 s |
| chromium | compare | 3 | 0.6 s |
| chromium | reopen | 3 | 6.2 s |
| chromium | panel | 6 | 6.5 s |
| chromium | refusal | 1 | 4.7 s |
| mobile-375 | overview | 3 | 23.2 s |
| mobile-375 | open | 4 | 4.6 s |
| mobile-375 | binding | 1 | 0.7 s |
| mobile-375 | snapshot | 4 | 1.3 s |
| mobile-375 | session | 2 | 3.9 s |
| mobile-375 | themes | 3 | 1.6 s |
| mobile-375 | document | 3 | 1.1 s |
| mobile-375 | confirm | 2 | 1.0 s |
| mobile-375 | correct | 2 | 1.1 s |
| mobile-375 | history | 1 | 0.5 s |
| mobile-375 | verify | 2 | 1.3 s |
| mobile-375 | neutral | 2 | 1.2 s |
| mobile-375 | lock | 3 | 0.9 s |
| mobile-375 | locked | 3 | 5.3 s |
| mobile-375 | independence | 4 | 7.1 s |
| mobile-375 | second | 3 | 3.7 s |
| mobile-375 | compare | 3 | 0.5 s |
| mobile-375 | reopen | 3 | 5.7 s |
| mobile-375 | panel | 6 | 6.2 s |
| mobile-375 | refusal | 1 | 6.8 s |
| mobile-390 | overview | 3 | 37.3 s |
| mobile-390 | open | 4 | 4.6 s |
| mobile-390 | binding | 1 | 0.7 s |
| mobile-390 | snapshot | 4 | 1.3 s |
| mobile-390 | session | 2 | 3.4 s |
| mobile-390 | themes | 3 | 1.7 s |
| mobile-390 | document | 3 | 1.2 s |
| mobile-390 | confirm | 2 | 1.1 s |
| mobile-390 | correct | 2 | 1.1 s |
| mobile-390 | history | 1 | 0.5 s |
| mobile-390 | verify | 2 | 1.3 s |
| mobile-390 | neutral | 2 | 1.3 s |
| mobile-390 | lock | 3 | 0.9 s |
| mobile-390 | locked | 3 | 4.8 s |
| mobile-390 | independence | 4 | 7.3 s |
| mobile-390 | second | 3 | 3.8 s |
| mobile-390 | compare | 3 | 0.6 s |
| mobile-390 | reopen | 3 | 5.8 s |
| mobile-390 | panel | 6 | 6.9 s |
| mobile-390 | refusal | 1 | 6.7 s |

## Screenshots

- `chromium-01-overview-module-en.png` — `6ac9f24be4f29982849c8bd03afa5a1a80d153692ce81893dffbbb24e807d929` (263845 bytes)
- `chromium-01-overview-module-sv.png` — `f944bf2b566dde833626aa67f93fd0e091d5c8ef44a676dfe5186d5a8beab7b6` (257042 bytes)
- `chromium-02-tool-landing-en.png` — `2f7a60454d4190ad9ba64855f0e443b87c248a77d918b814ff612e827d32c4ad` (261493 bytes)
- `chromium-02-tool-landing-sv.png` — `d496bbcb2669c7b91e8999b290e79b4cc1bd879f28b8346c7b94414a110b5a74` (245947 bytes)
- `chromium-03-binding-disclosed-sv.png` — `5b194d36d14eecdf95b4237271b6c54760326669990327726d008b3f02c4a456` (280952 bytes)
- `chromium-04-snapshot-en.png` — `2f7a60454d4190ad9ba64855f0e443b87c248a77d918b814ff612e827d32c4ad` (261493 bytes)
- `chromium-04-snapshot-sv.png` — `d496bbcb2669c7b91e8999b290e79b4cc1bd879f28b8346c7b94414a110b5a74` (245947 bytes)
- `chromium-05-snapshot-readonly-sv.png` — `d496bbcb2669c7b91e8999b290e79b4cc1bd879f28b8346c7b94414a110b5a74` (245947 bytes)
- `chromium-06-position-blocked-sv.png` — `65cfbf3c1feee48be691dd91910931a10d07b0e7f85f61caae8074fdf625091e` (153056 bytes)
- `chromium-06-session-open-sv.png` — `88482a25ba77a7580eda76cc8a70d78ace024bc6ad3f60459e0c2b0d7d61687d` (316726 bytes)
- `chromium-07-themes-en.png` — `1929fce6849b1c44e1382d406e31d1cfbb376f2c453fd81bfbe373205448fe29` (339269 bytes)
- `chromium-07-themes-sv.png` — `88482a25ba77a7580eda76cc8a70d78ace024bc6ad3f60459e0c2b0d7d61687d` (316726 bytes)
- `chromium-08-entry-form-sv.png` — `9f6c7180ba8a0a5cd680e3ae8c97b6af0af8683e97d8cebf0ae4d3a5c17eaa8e` (398280 bytes)
- `chromium-08-entry-saved-sv.png` — `f5eb719d99170091b4d74d384cf7b95deec3cd3b5e1392ca9b854fd488924edc` (368916 bytes)
- `chromium-09-entry-confirmed-sv.png` — `d98eff795e85c1a29a118a8c4940011ff3931e93965d689dc5328de0c58a35f8` (397108 bytes)
- `chromium-09-entry-refused-sv.png` — `5deed2bee3e30b1c079dc569d3878f3369f84ba8f61b8ec888eb05c1f2966d80` (451160 bytes)
- `chromium-10-correction-refused-sv.png` — `cca08ed9646d550945deefba4bec8f156af046773241d7b3148e905a1edb3ce1` (469575 bytes)
- `chromium-10-correction-saved-sv.png` — `3b0cb310e5cc92a5e999ee23cab1c25e786ee3b27131dc87a61b4b43ebaceda2` (396955 bytes)
- `chromium-11-history-sv.png` — `e464c6b41a0aa9cc3ec0d3a6862a2f3ec813f5c33ac809d3cf5fe01a39394f52` (504024 bytes)
- `chromium-12-verification-history-sv.png` — `534a9feff2404b903ac1584fffce0c477c28d30f7898732a4bf64d747d7ad660` (520760 bytes)
- `chromium-12-verification-refused-sv.png` — `1bd3a8976e42056a07c2480c03d2da5899297bf7d1a59ddfb2c547bd0ce8174f` (413815 bytes)
- `chromium-13-not-verified-neutral-en.png` — `6364f3cc5ac582176c277210127aea599dd1ddf6cbde093e39adadfed22fb777` (429971 bytes)
- `chromium-13-not-verified-neutral-sv.png` — `7fc151cae705036881b15688d9748d1f6cb006aecb080222106520e679f88c3d` (406162 bytes)
- `chromium-14-before-lock-sv.png` — `a0c7aeb5e5b6352970118d743d7e98b96ad9f60299792ae05034bbc52ad69632` (144440 bytes)
- `chromium-14-lock-dialog-sv.png` — `f5eb0fbef40e6fe64efd61d559e8ec0aaaa528d34ad3a4e3dca9522824b97a36` (154180 bytes)
- `chromium-14-locked-sv.png` — `7c6f61c2f483e331604451d52c27cbf49d9bcd95d187a4e24d9a3f97df5cd17c` (145465 bytes)
- `chromium-15-entries-readonly-sv.png` — `143a2218f832ca6bafec6388c980c447669c61129447b05ba5a8d247d8ca19af` (397488 bytes)
- `chromium-15-locked-readonly-en.png` — `0385f1fc4f2c6010d50495b75bdc44c74e4490fbf879c9513d985016af13af10` (145669 bytes)
- `chromium-15-locked-readonly-sv.png` — `7c6f61c2f483e331604451d52c27cbf49d9bcd95d187a4e24d9a3f97df5cd17c` (145465 bytes)
- `chromium-16-second-assessor-joined-sv.png` — `2e678a2324bafd6d997cc5eb994cd96b724c264379d3ea4f59ed09bd5568628f` (335577 bytes)
- `chromium-16-withheld-en.png` — `94471da8b0d01b5bf1f05adfd9ec7c7c54cd1c107a0a5e9ddbf63e3c66dfe8a5` (155176 bytes)
- `chromium-16-withheld-sv.png` — `d2d2fed359641960cc7597326c977b4bef5a812688953f010e55f4d2f887eaa3` (153293 bytes)
- `chromium-17-revealed-sv.png` — `0dd9d4c2249db712285c3a115a232e10a1ddcc4a3f57670e440c40fddff8e43b` (217374 bytes)
- `chromium-17-second-documented-sv.png` — `13de3e1f61d19514875f42a7a805352206c456f5726d8c08c01736b40025546e` (355501 bytes)
- `chromium-17-second-locked-sv.png` — `0dd9d4c2249db712285c3a115a232e10a1ddcc4a3f57670e440c40fddff8e43b` (217374 bytes)
- `chromium-18-side-by-side-en.png` — `cf5cac14de6e982588db0446e5d374a07afe57b30a4d24bf60cf3754a3e7f79c` (188576 bytes)
- `chromium-18-side-by-side-sv.png` — `2d664919a897dcf45c550a173c3cc28fa0c317a6059cc108615f957b002a9445` (188449 bytes)
- `chromium-19-relocked-sv.png` — `2ff24b7e9facb24e1c8035d3186fb4c4724c0090070b4957daf17a8551f89099` (188535 bytes)
- `chromium-19-reopen-refused-sv.png` — `6c70a773c88446623629cd6cf144d8c21e65afd68b7587f7c4f71ed8fecb963e` (201875 bytes)
- `chromium-19-reopened-sv.png` — `7fc151cae705036881b15688d9748d1f6cb006aecb080222106520e679f88c3d` (406162 bytes)
- `chromium-20-outsider-refused-sv.png` — `ef283a18b8918d0b48b2f3a4dc56ee99a8ad419404e2a2c6fe403b8d60093073` (4256 bytes)
- `chromium-20-panel-refused-sv.png` — `44f149f4c6a42fe5a206508dae1799b0547d8014dbf3ff620db72eb39fa6a0f5` (192674 bytes)
- `chromium-20-panel-resolution-en.png` — `05062dc2c1a3345f3a388bf6cb65437afd23b221b4aeeab368fba153b8e4b273` (198656 bytes)
- `chromium-20-panel-resolution-sv.png` — `f25873d335cbfe06ae63ca929fbc98da19baa783578ffc51a273feff4b7e8147` (191058 bytes)
- `chromium-20-panel-revealed-sv.png` — `b67a8e61cbb4b5d8ea454d6455ad95b43813f721262c4c1defa64bbda3117af9` (180733 bytes)
- `chromium-20-positions-untouched-sv.png` — `143a2218f832ca6bafec6388c980c447669c61129447b05ba5a8d247d8ca19af` (397488 bytes)
- `mobile-375-01-overview-module-en.png` — `6339760fdb83ea8d3520e58dfeb39f4f5666563f90091100acf6c3059ad5cb74` (216258 bytes)
- `mobile-375-01-overview-module-sv.png` — `1bbb509b011c60b23498fe52fb64dca546a342b3d25f071c91a0553b256f3c73` (209223 bytes)
- `mobile-375-02-tool-landing-en.png` — `96b1d5895bf0f9f456fae9991aac3e7c5306dc6e5d5e59d1b69fa96c4875c54c` (218752 bytes)
- `mobile-375-02-tool-landing-sv.png` — `06b4444346f579db1aa39c462d677c724cd94c62154df540ce5b4765132e814e` (203230 bytes)
- `mobile-375-03-binding-disclosed-sv.png` — `b1adcec313b0a132f7a21759de66c2f731a0409976e8eecd4a204c9162b48187` (240278 bytes)
- `mobile-375-04-snapshot-en.png` — `b5edc78bd42b78a70ebda0edafe48fede207cfaab6445781452bb7927ccab7cb` (218711 bytes)
- `mobile-375-04-snapshot-sv.png` — `06b4444346f579db1aa39c462d677c724cd94c62154df540ce5b4765132e814e` (203230 bytes)
- `mobile-375-05-snapshot-readonly-sv.png` — `06b4444346f579db1aa39c462d677c724cd94c62154df540ce5b4765132e814e` (203230 bytes)
- `mobile-375-06-position-blocked-sv.png` — `8ce09ef332acddfc5a287e53e0f9eb62a93cbf1702893b230f43e800c3dffc2e` (119739 bytes)
- `mobile-375-06-session-open-sv.png` — `8e6524a2e70d48d3d5dcc3fb571f76fbbc6f4efe54e8b1552461f4a072df91b7` (270592 bytes)
- `mobile-375-07-themes-en.png` — `7f16cb2327bac1262f446d8c87de267636e76860ad55eccf85c55c5a2b4533a1` (290835 bytes)
- `mobile-375-07-themes-sv.png` — `8e6524a2e70d48d3d5dcc3fb571f76fbbc6f4efe54e8b1552461f4a072df91b7` (270592 bytes)
- `mobile-375-08-entry-form-sv.png` — `651d132fb7dfb87d9dc43471d75b260f4e8d0ba5113edc7ae35f078955aedbbb` (351235 bytes)
- `mobile-375-08-entry-saved-sv.png` — `4067d39603799726cf9f518749ae9bc83bef6ec2f9b6b758840871643a6860dd` (320705 bytes)
- `mobile-375-09-entry-confirmed-sv.png` — `273ae08b6db9483c4b62473d4e9d00d4b4d96640c7a37424ca2ce16d008f09cf` (347133 bytes)
- `mobile-375-09-entry-refused-sv.png` — `e3ca963f9ba92d1d3701ec1b6880ac29c8128c94837d86e95545030b197eb486` (401498 bytes)
- `mobile-375-10-correction-refused-sv.png` — `5154f87c75618c6c1db5a5614ea4c3e48a06142e2cb5790fee020a1d361de4f5` (418497 bytes)
- `mobile-375-10-correction-saved-sv.png` — `bac55cf5e5dec33d555fdc186926456b2b6b48610d8de1d01280108734d7c841` (346747 bytes)
- `mobile-375-11-history-sv.png` — `f079953b290f6023628fc52002e3f5a9b8a7c8a0d812ae5c505de7df7a5c9b2a` (448132 bytes)
- `mobile-375-12-verification-history-sv.png` — `c5df67c58a37dc3b69c6234e3199c79d445edf6fef2158992f033a3788fdd041` (464371 bytes)
- `mobile-375-12-verification-refused-sv.png` — `369268100775e388acab0972e4e0c5dd364a8ff46e957b926204a6290f8f5d5d` (362501 bytes)
- `mobile-375-13-not-verified-neutral-en.png` — `57982d7864bd4f435340b1c30bed0484508effa6f04059098cbf2afcd2b4fbcc` (376721 bytes)
- `mobile-375-13-not-verified-neutral-sv.png` — `564e9b5a022288289ae0cd2dd4404655436f9c06d7e44df77c39e5c0637fc359` (355389 bytes)
- `mobile-375-14-before-lock-sv.png` — `94c29adcbda942aeb50f34aeec3b977bddf51044d1f27d705b49646c3185f1e7` (111501 bytes)
- `mobile-375-14-lock-dialog-sv.png` — `51824532d3a38a36b829c9e3ff3758fd43bf71e2562e82bc08d84b981f7e5b10` (114490 bytes)
- `mobile-375-14-locked-sv.png` — `88438460c185866ab43eb393086e902f834db175e4c724a1d80ff55f6eb07a7c` (111851 bytes)
- `mobile-375-15-entries-readonly-sv.png` — `042da37981bd78e95423e6df443cebe80c1530fcfcc47b369eb599962eb321d3` (345731 bytes)
- `mobile-375-15-locked-readonly-en.png` — `cfdd7e97df7abb34fcbee945f1144fc03938b20fc31ebd18f1aa821e855c3fad` (114494 bytes)
- `mobile-375-15-locked-readonly-sv.png` — `88438460c185866ab43eb393086e902f834db175e4c724a1d80ff55f6eb07a7c` (111851 bytes)
- `mobile-375-16-second-assessor-joined-sv.png` — `e07af3be0d913ed1d4f36cbb6266b516216b3bfbdff3b254030b7e554a8bac8c` (289141 bytes)
- `mobile-375-16-withheld-en.png` — `ad626b0010431c622248226bd175c3c9acbec7a53bfbfc29c81f2fb04fff1f44` (123211 bytes)
- `mobile-375-16-withheld-sv.png` — `8ce09ef332acddfc5a287e53e0f9eb62a93cbf1702893b230f43e800c3dffc2e` (119739 bytes)
- `mobile-375-17-revealed-sv.png` — `6537a134fe18e78473c157149fd9ce27fe799b8f5b6b7bb5ab2768ca682cce83` (181638 bytes)
- `mobile-375-17-second-documented-sv.png` — `885c9031b4573994796b12c3ea34b111180b7208d2fb51362e55b29058d8d268` (307084 bytes)
- `mobile-375-17-second-locked-sv.png` — `6537a134fe18e78473c157149fd9ce27fe799b8f5b6b7bb5ab2768ca682cce83` (181638 bytes)
- `mobile-375-18-side-by-side-en.png` — `d67683ee639f66d0b5cb2808df2d10984d22324f720300250ccb54abf3d26b4d` (156511 bytes)
- `mobile-375-18-side-by-side-sv.png` — `2bd5b7027b94ea7ded907f713cacae2fd3d84f9150f0e30669a658997814dfab` (153636 bytes)
- `mobile-375-19-relocked-sv.png` — `8a88244c4c08c5ee4b8a4976e3fde58212fd97c9a7f72228fc62bdd3608d2af8` (153773 bytes)
- `mobile-375-19-reopen-refused-sv.png` — `66e005f31b4c3ecec67e89999effa63bce9cc13cb217332eb6b171da8f71a313` (166534 bytes)
- `mobile-375-19-reopened-sv.png` — `564e9b5a022288289ae0cd2dd4404655436f9c06d7e44df77c39e5c0637fc359` (355389 bytes)
- `mobile-375-20-outsider-refused-sv.png` — `e002fd064ec7e54d15c4e5a8c09811e897517bdfc14fd81e3677dba637ac8a9c` (2540 bytes)
- `mobile-375-20-panel-refused-sv.png` — `f8116e420812655ce8b3aa9d587e7652842c009bce0ff36975c060bde765a775` (158077 bytes)
- `mobile-375-20-panel-resolution-en.png` — `47a81103b2fbc281477e2193b3af93a50f55b6dba56802e7e2cc6f4ba5452198` (163663 bytes)
- `mobile-375-20-panel-resolution-sv.png` — `08b720996b96480ff35b54669aed95f2d09baf5ce688c9e41fdd820522126606` (156026 bytes)
- `mobile-375-20-panel-revealed-sv.png` — `3b7a239788718cb50db249f4ca6cb55fe9c5d4facafbe04a6851a3d2ad3ada43` (145817 bytes)
- `mobile-375-20-positions-untouched-sv.png` — `042da37981bd78e95423e6df443cebe80c1530fcfcc47b369eb599962eb321d3` (345731 bytes)
- `mobile-390-01-overview-module-en.png` — `f7b0f12cb17ec3f3515130f871ac3ace91cc02a119749af39d2ad3c273a67658` (215491 bytes)
- `mobile-390-01-overview-module-sv.png` — `609b1243241fcaf00c8ef74cd3dc3fcef1654fa400dfcc5f582388a66f106554` (207012 bytes)
- `mobile-390-02-tool-landing-en.png` — `cff2204d41b737471bd0998b654bfed12fbe09a19189293c8a22666459c247a2` (219285 bytes)
- `mobile-390-02-tool-landing-sv.png` — `aadde14d7fa7681fdc59eaa2a480cc6b6ba1b549e8615cd5a40bfe9790022cd1` (203366 bytes)
- `mobile-390-03-binding-disclosed-sv.png` — `49b715dc3284f08f39a0a28c721c0358a35ec36cb9a98d48d862eb23d6de6e42` (240541 bytes)
- `mobile-390-04-snapshot-en.png` — `393accb3378871f1f31552ecef8f58108749ea7d4bed7b3c93f109131300ce64` (219256 bytes)
- `mobile-390-04-snapshot-sv.png` — `aadde14d7fa7681fdc59eaa2a480cc6b6ba1b549e8615cd5a40bfe9790022cd1` (203366 bytes)
- `mobile-390-05-snapshot-readonly-sv.png` — `aadde14d7fa7681fdc59eaa2a480cc6b6ba1b549e8615cd5a40bfe9790022cd1` (203366 bytes)
- `mobile-390-06-position-blocked-sv.png` — `b6cd7ae46d85a0af8cab422eee95021614daa12c0df769e1eb2e0763e9f98df6` (119725 bytes)
- `mobile-390-06-session-open-sv.png` — `11ee3ddae0092697e4941483612267beac95fa7b5433778d2a7a06deaa83e10d` (270403 bytes)
- `mobile-390-07-themes-en.png` — `f9c45175782fc29730d30c110f14fb615d9c78c52ea11c94a72465bf86cb3b64` (291048 bytes)
- `mobile-390-07-themes-sv.png` — `11ee3ddae0092697e4941483612267beac95fa7b5433778d2a7a06deaa83e10d` (270403 bytes)
- `mobile-390-08-entry-form-sv.png` — `403ca0c76ef739d2e25ba39b3991e964d8f37be7bd4a051150b5fc1523f9a1e6` (350130 bytes)
- `mobile-390-08-entry-saved-sv.png` — `945e4ab14f59ed26e746c9f7b0da73c6aa661ce3e4223d08b51adbc203b4d313` (320095 bytes)
- `mobile-390-09-entry-confirmed-sv.png` — `372f6bc1c4e7cb5e103518bf5138d998bafc8e16932abb05df5f06fca746215b` (345834 bytes)
- `mobile-390-09-entry-refused-sv.png` — `cbbe357bd7e9e00f37b7ed744f82411d1bdb26158f3cee99830aa43b89d82cbb` (399890 bytes)
- `mobile-390-10-correction-refused-sv.png` — `77f081a039e2bb38f0513e09ba9be4eec7acba73cc11cfe4da69836aa97e03a7` (416705 bytes)
- `mobile-390-10-correction-saved-sv.png` — `890e5d80d25be7dbee987eeb0ae58ec6e7d9a1e35f8fe1a315cf60e33baa1a85` (345721 bytes)
- `mobile-390-11-history-sv.png` — `1129a877596996916d9fd3f7d855c2f5b4bab9b4881bbb736f4264e436f311db` (446678 bytes)
- `mobile-390-12-verification-history-sv.png` — `545c9fae00fb4e422b4a33bbcd493f6b27272ab46bb803c67fb3d275b40b660a` (462848 bytes)
- `mobile-390-12-verification-refused-sv.png` — `4f1c245fee041e909a82b6d6486dca81d65b1387705a3bd5a8667b773792a1d3` (361516 bytes)
- `mobile-390-13-not-verified-neutral-en.png` — `ef181094fac240f8d965c90dbf579ffdd498f4df7f1faf21b37a5a2b72c1fbda` (377574 bytes)
- `mobile-390-13-not-verified-neutral-sv.png` — `2c336a669649e35eda50a6e7e4434a3929c11099120af39e7de99b98fbab216d` (354197 bytes)
- `mobile-390-14-before-lock-sv.png` — `63040658d0d0543181a18fb32a68a9d450d5f8aab3a2a54380698cd7d8a26991` (111411 bytes)
- `mobile-390-14-lock-dialog-sv.png` — `e615e88ed13de922b1bf5bc2a7e9f7d9d5301acb73a8e4a218054ce82bb33348` (114514 bytes)
- `mobile-390-14-locked-sv.png` — `f50ac8cd704b9adbf0ec22166cc890b060998b2ce5cd257590af19972aa45341` (111813 bytes)
- `mobile-390-15-entries-readonly-sv.png` — `23f2fcbd139fb2e35d844de5e0a79521e3cd41bef712b060c2b223b862a1403b` (346041 bytes)
- `mobile-390-15-locked-readonly-en.png` — `42fcdde340abe936695048a2955b4f3b8d8f3f324da5afbace7285ea54fcd9be` (113589 bytes)
- `mobile-390-15-locked-readonly-sv.png` — `f50ac8cd704b9adbf0ec22166cc890b060998b2ce5cd257590af19972aa45341` (111813 bytes)
- `mobile-390-16-second-assessor-joined-sv.png` — `5bdd480012173c42e933f6a7d7a4e821a747a0ddc77b86508d5a974f2724cc99` (288901 bytes)
- `mobile-390-16-withheld-en.png` — `e18d44917c2c1af975385bad4cda472d1d0de5ebb20e954e07d18696d94c02b8` (122677 bytes)
- `mobile-390-16-withheld-sv.png` — `b6cd7ae46d85a0af8cab422eee95021614daa12c0df769e1eb2e0763e9f98df6` (119725 bytes)
- `mobile-390-17-revealed-sv.png` — `816674c0858bdf735d8f5bd515773fe72b2087588688b5edfa2ce2b83b706810` (182090 bytes)
- `mobile-390-17-second-documented-sv.png` — `973ce6672a030ab01080f16937dc25d1b7183c0059a7e6452028f32e691449f4` (306547 bytes)
- `mobile-390-17-second-locked-sv.png` — `816674c0858bdf735d8f5bd515773fe72b2087588688b5edfa2ce2b83b706810` (182090 bytes)
- `mobile-390-18-side-by-side-en.png` — `587ba3556d1e55b54ef74d0953c0ceafbfb0bd15fade037daf2e81cb6e4a67c5` (155890 bytes)
- `mobile-390-18-side-by-side-sv.png` — `7e4c363f9c4d6d832b71651816c24e951f8c09fd8d2ff60d8c80a9c72a4dfa76` (153796 bytes)
- `mobile-390-19-relocked-sv.png` — `89fe661c535183932556d4b7897895b055c6c5c7d96890dc2e7b43d56f145447` (153741 bytes)
- `mobile-390-19-reopen-refused-sv.png` — `b8226f290f63e54b96288704d722ea49b642f42a17b397c14bdd0801c8537a4c` (166219 bytes)
- `mobile-390-19-reopened-sv.png` — `2c336a669649e35eda50a6e7e4434a3929c11099120af39e7de99b98fbab216d` (354197 bytes)
- `mobile-390-20-outsider-refused-sv.png` — `0712fd74071445afc9b98c41440bfd0b7a0886fc95a1e4e755d8f424c88fc8b1` (2742 bytes)
- `mobile-390-20-panel-refused-sv.png` — `ca15ac58931271fca875abcf0ee227446c28c0995fd904802f07868d56470a22` (158121 bytes)
- `mobile-390-20-panel-resolution-en.png` — `6e890b07baba6d6aa5b20eab0331ec432b8ea68b6c5bb5408782a68442a3800b` (162937 bytes)
- `mobile-390-20-panel-resolution-sv.png` — `a3d3e5983ebeac93da03e62ca0bef7c1e5212a01564723deb0b2c26b80f3973a` (156049 bytes)
- `mobile-390-20-panel-revealed-sv.png` — `b611d8fb926ba47d850ef0d6c239583068df10b25151884f9a233522ffd73a71` (145632 bytes)
- `mobile-390-20-positions-untouched-sv.png` — `23f2fcbd139fb2e35d844de5e0a79521e3cd41bef712b060c2b223b862a1403b` (346041 bytes)

## Traces (digested, not committed)

- `chromium/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-chromium.zip` — `2af2d940f8d19895e4c6734d282eb73ff73cdd1023651cf6d2d3b06ce16610e8` (1933287 bytes)
- `chromium/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-chromium.zip` — `ac4454bbfae44a6d7613997850177c10235f2945b6cc761b11e83b29f538f376` (1795752 bytes)
- `chromium/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-chromium.zip` — `97f5b3cd58ac5ce8c69cf44b26f6206cbda09c00f7dc9e8d074909444472fae5` (1926028 bytes)
- `chromium/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-chromium.zip` — `4a72471a58b9b4888513f5df3ba85654c8a2305924702b628bef38ade184476e` (2129749 bytes)
- `chromium/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-chromium.zip` — `02954e36599f9441b70185f5a6ebf3be527078c6211e3ebb3c9c2b7027c775c2` (1802526 bytes)
- `chromium/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-chromium.zip` — `f4f62e984277718e003a81cca97b1ce27faf68e6273babde67967acda152bd84` (1464344 bytes)
- `chromium/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-chromium.zip` — `d1979793c18162d0495ab12e0c63d9e0e25a4cf87dd9a148251d5adfd4cfe0d6` (1765452 bytes)
- `chromium/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-chromium.zip` — `375a94a218690fc0ecd3413815aa972b90c9b0caa22367b8a175dcc4e243a3ea` (1846843 bytes)
- `chromium/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-chromium.zip` — `887b2a704b0a91d118477f0ed4d9f4fec1460a72ea981fc87307722f35c69dd3` (1925116 bytes)
- `chromium/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-chromium.zip` — `203a609cdc3c1fec2cb1d09aeab1f32dd7b6ba458b859df09ee16f9785cf0bc2` (1793575 bytes)
- `chromium/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-chromium.zip` — `657d58293eddd8147e5f4b5e85723eebdcf789125ca520cfc8d04bd6aaccce76` (1979895 bytes)
- `chromium/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-chromium.zip` — `39d567333f1f5cc0baa249c1102f5f03b36c74da4509dfe6b819ac3423ffc335` (2104307 bytes)
- `chromium/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-chromium.zip` — `0d977d2cebd69bb55c0ce1fa65cbdd773e93a6f9b7a763836d4b3cefb18a5a0e` (1778891 bytes)
- `chromium/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-chromium.zip` — `ec1d385a51dbd6a2e271c5903a8e64510794afd51449926ab574fae27c423252` (2224920 bytes)
- `chromium/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-chromium.zip` — `1ae047a12a76526951313ba1af850a5c05eaa781bfc9fe2a7ffba2e396105925` (1567944 bytes)
- `chromium/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-chromium.zip` — `2d7a34998d49d048a3510ee66e06ceedf0c3c52ed565d7bec8b50e44d6e50910` (1914038 bytes)
- `chromium/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-chromium.zip` — `c2057ea4bd4f61958858805b86881cb40d8158b8ad1ddf9b0681504cb713b608` (1706295 bytes)
- `chromium/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-chromium.zip` — `cf4780ce19566b3819c4a87a0e7bb13209876d7b645f9159a351e97d5896e24b` (2192028 bytes)
- `chromium/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-chromium.zip` — `4c90e14f00b5b54c34bb1a8d538acba10e2bb6663e0c551e6678e81ecb46f09a` (1632484 bytes)
- `chromium/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-chromium.zip` — `1c284d5c26b3715b975e5fb2a63b910204a50a3cd62f3fb5f4b66c77d1e94a49` (4477836 bytes)
- `mobile-375/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-mobile-375.zip` — `984bed9bedb5f304b33ab31897cb14fba4946ba99bfc691588f753f8f9fbedd4` (2395974 bytes)
- `mobile-375/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-mobile-375.zip` — `1f7afe8c59d477078e85a5d42831a7cb465b3e57f00a934ef186a5541a0dd04f` (1968876 bytes)
- `mobile-375/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-mobile-375.zip` — `da4c5d56e188cb771133f590bda62656bb6be73848719bbcf7ec1a25ca0e8fe2` (2416346 bytes)
- `mobile-375/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-mobile-375.zip` — `ffea2b7cd4cc51f4f2406abc9caaf5bdb383f59c92cb3becf2b128a00a2d3bfc` (2025235 bytes)
- `mobile-375/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-mobile-375.zip` — `c7d1b1ef6d37c34e190e05a813fc9aab2b11a3096c41c6d415a8154366e0abf9` (1955640 bytes)
- `mobile-375/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-mobile-375.zip` — `6c41f493e3081fb14468f1a3fdec655fa3a483efb09e8614675af5076820af0e` (1538606 bytes)
- `mobile-375/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-mobile-375.zip` — `5acc632ed1cfa788ebfc3dbf44db9917cd4d45ef60697c1f21588180404c2d5d` (2341603 bytes)
- `mobile-375/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-mobile-375.zip` — `7d7640266838d502d4998516ed3d724945d81bc71de7242c685aa094980bdc67` (2017546 bytes)
- `mobile-375/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-mobile-375.zip` — `68084bb6c75e8f89b78b0acad966659b4a5e2589a17f176b8acb85bea051e769` (2280566 bytes)
- `mobile-375/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-mobile-375.zip` — `df1e2e63f57604690d3fd27ade3d924fecb14b467b039c4f933e45613d958fd7` (1866226 bytes)
- `mobile-375/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-mobile-375.zip` — `105bc4d38cdf2b97fa90e26e45ecef7c3952390fedc563531dbae94d713c2c10` (2036212 bytes)
- `mobile-375/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-mobile-375.zip` — `22a2284cf86921d7a8c5b40ed385ef1c5a29b5b6860af87023d81152603a9a01` (2395026 bytes)
- `mobile-375/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-mobile-375.zip` — `1bb900daaa15d38ff8dbc906c751ae8be52a53b0015a9f84daa73c171d2f0dbf` (2507692 bytes)
- `mobile-375/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-mobile-375.zip` — `7ed0ce2ad9fcbc6dbacb5233a8b127f6a0d4be7ba29fff599a82a83849476652` (2432843 bytes)
- `mobile-375/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-mobile-375.zip` — `5c69f8d29f4de14025ba7974ab339ae3b107423cfe2db976493417ae194d2b3b` (1845678 bytes)
- `mobile-375/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-mobile-375.zip` — `23bc71e5da9466aafe9a8bcc2790f3c8e030b791074f589ae5b4b583a3676068` (2580332 bytes)
- `mobile-375/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-mobile-375.zip` — `988eb6b4eb0d34259baaacac72bf3cff9cbb7e6c8890e0057733692a5eef3e4c` (1943638 bytes)
- `mobile-375/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-mobile-375.zip` — `9f87c25b03c707e6ceb8e8bc898764f9e99be842d4d8afe5c6930d1e842f74ab` (2968437 bytes)
- `mobile-375/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-mobile-375.zip` — `fbdd87704313fc15dd0bba688ec69fe1be34a086a16817642558fae824968055` (1511482 bytes)
- `mobile-375/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-mobile-375.zip` — `f1cfb21dae5025b8ab4be315c9cce8dd8f6dacb3b73c0e7dc1c97f53de7e9bac` (4892729 bytes)
- `mobile-390/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-mobile-390.zip` — `9db61a769005639374f4d2408a0b60055c850234fe765b681c76a62a90d734c6` (2237661 bytes)
- `mobile-390/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-mobile-390.zip` — `609e9dba029f6ff02cfbf86fbd19f59e35001d6e7a6d1287601d429b7d381ec3` (2017494 bytes)
- `mobile-390/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-mobile-390.zip` — `e242da2f0900cc3f31fe4113051eb96b652ef836062f502744aefe254f6a84e6` (1918835 bytes)
- `mobile-390/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-mobile-390.zip` — `b4aa60ffa0442b68ab03d1b28a840b1c81e3bbfd4865d961cef24fad7c4279e5` (2209984 bytes)
- `mobile-390/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-mobile-390.zip` — `b7d9eb182af813edc262c25fe4474958a982a24f5508f89d99981298f65f3c66` (1903447 bytes)
- `mobile-390/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-mobile-390.zip` — `d7ec7b20d99212e5c768d6e43c12246b4997288895693a3b933ea4f97725bfe7` (1469944 bytes)
- `mobile-390/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-mobile-390.zip` — `57ff8118ceaa9638908d6f1adda1f450c44faff4416ca6591de3e44fefb4ab77` (2222369 bytes)
- `mobile-390/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-mobile-390.zip` — `a632313dbc32b07dabf6e85e513abe62aee6479963b1fe633ec10dd39be14de0` (1784874 bytes)
- `mobile-390/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-mobile-390.zip` — `7fc4b290a4f6c364db55968051d5a4dadb612cd1e5a641e61c7dd2bd3a759941` (2316005 bytes)
- `mobile-390/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-mobile-390.zip` — `dacea8b9b5152c298d5b6d50a1574f913f2c32a31da2a58c6dcf709fafeed28a` (1941015 bytes)
- `mobile-390/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-mobile-390.zip` — `0619edbc5b3a4187697810d9fa294c7beff8f2ceeac96b45492ce97393295d5f` (1885291 bytes)
- `mobile-390/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-mobile-390.zip` — `2a71559993234e0b066d443a12d2b4d4edc7b30dc104f2b24ef16b494bdfd700` (2296514 bytes)
- `mobile-390/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-mobile-390.zip` — `0af5142863cc60b1746138d996529cb4fb7af423fa8ca6bb060bb33dc7f434e8` (2809531 bytes)
- `mobile-390/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-mobile-390.zip` — `cd2cc92c7edbb39cadc291d0cf4cc44d206b15fb0534a10c7bbd536865456364` (2230860 bytes)
- `mobile-390/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-mobile-390.zip` — `6c2c9859a994ff761f18a9928f43eb51e22a3616c607a2b2a48a2243468dcb8d` (1952224 bytes)
- `mobile-390/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-mobile-390.zip` — `a2a6e368f053bcab7f7018083afc0888a65d7609cb25ec785c1149c5c1899672` (2402691 bytes)
- `mobile-390/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-mobile-390.zip` — `2ed265a2f41d1fd40ae68086cb7a707d5fbaa5805854d7ffaee46d38bc2a263c` (1648925 bytes)
- `mobile-390/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-mobile-390.zip` — `29ddf3d7989b66663b955d9a3bf56d1c6dcb8ed4cb57917ac2beeed906279cde` (2630144 bytes)
- `mobile-390/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-mobile-390.zip` — `bd7add4c86f8094a1bf83c9d4c3ce334187fe08b6b4ac15cd3a8ec6e431ab986` (1426388 bytes)
- `mobile-390/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-mobile-390.zip` — `6026a15e598eee65406f0afe13d9ac660bb07748203cef66e6bf1e8a879019da` (4913836 bytes)
