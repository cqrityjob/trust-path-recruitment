# BESKT PR 5B — the interview tool, ROUTED browser evidence

Captured at HEAD `8f21dcbdaa05bbc71f0570bc913f05a4d0f5cd0a`, 165 steps over
3 viewport(s), 226.6 s of measured step time.

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
| chromium | overview | 3 | 21.6 s |
| chromium | open | 4 | 4.7 s |
| chromium | binding | 1 | 0.9 s |
| chromium | snapshot | 4 | 1.6 s |
| chromium | session | 2 | 3.8 s |
| chromium | themes | 3 | 2.0 s |
| chromium | document | 3 | 1.4 s |
| chromium | confirm | 2 | 1.5 s |
| chromium | correct | 2 | 1.4 s |
| chromium | history | 1 | 0.7 s |
| chromium | verify | 2 | 1.6 s |
| chromium | neutral | 2 | 1.4 s |
| chromium | lock | 3 | 1.1 s |
| chromium | locked | 3 | 5.3 s |
| chromium | independence | 4 | 7.6 s |
| chromium | second | 3 | 4.1 s |
| chromium | compare | 3 | 0.7 s |
| chromium | reopen | 3 | 5.7 s |
| chromium | panel | 6 | 6.9 s |
| chromium | refusal | 1 | 4.8 s |
| mobile-375 | overview | 3 | 21.4 s |
| mobile-375 | open | 4 | 4.6 s |
| mobile-375 | binding | 1 | 0.7 s |
| mobile-375 | snapshot | 4 | 1.2 s |
| mobile-375 | session | 2 | 3.5 s |
| mobile-375 | themes | 3 | 1.7 s |
| mobile-375 | document | 3 | 1.1 s |
| mobile-375 | confirm | 2 | 1.1 s |
| mobile-375 | correct | 2 | 1.1 s |
| mobile-375 | history | 1 | 0.5 s |
| mobile-375 | verify | 2 | 1.4 s |
| mobile-375 | neutral | 2 | 1.3 s |
| mobile-375 | lock | 3 | 0.9 s |
| mobile-375 | locked | 3 | 5.0 s |
| mobile-375 | independence | 4 | 6.9 s |
| mobile-375 | second | 3 | 3.7 s |
| mobile-375 | compare | 3 | 0.5 s |
| mobile-375 | reopen | 3 | 5.6 s |
| mobile-375 | panel | 6 | 6.4 s |
| mobile-375 | refusal | 1 | 4.6 s |
| mobile-390 | overview | 3 | 21.4 s |
| mobile-390 | open | 4 | 4.6 s |
| mobile-390 | binding | 1 | 0.9 s |
| mobile-390 | snapshot | 4 | 1.3 s |
| mobile-390 | session | 2 | 3.3 s |
| mobile-390 | themes | 3 | 1.2 s |
| mobile-390 | document | 3 | 1.3 s |
| mobile-390 | confirm | 2 | 1.2 s |
| mobile-390 | correct | 2 | 1.2 s |
| mobile-390 | history | 1 | 0.6 s |
| mobile-390 | verify | 2 | 1.3 s |
| mobile-390 | neutral | 2 | 1.4 s |
| mobile-390 | lock | 3 | 0.9 s |
| mobile-390 | locked | 3 | 5.1 s |
| mobile-390 | independence | 4 | 6.9 s |
| mobile-390 | second | 3 | 3.8 s |
| mobile-390 | compare | 3 | 0.6 s |
| mobile-390 | reopen | 3 | 6.0 s |
| mobile-390 | panel | 6 | 6.5 s |
| mobile-390 | refusal | 1 | 5.3 s |

## Screenshots

- `chromium-01-overview-module-en.png` — `c02d637b9d87f69b0035eb663a1eb3da72241c476d7e0e5bb7a5a376873a5481` (264374 bytes)
- `chromium-01-overview-module-sv.png` — `4c605ae6574c662a31900e0a80c361d8334c3a01e4d4baf41123e630a935f255` (257666 bytes)
- `chromium-02-tool-landing-en.png` — `2ecd54381ea6a6bf266f25f565b5dfc3a0193eec61e149acdf1fe64e3b148fee` (262209 bytes)
- `chromium-02-tool-landing-sv.png` — `f44d61ee1b59913a06894e483fa0369637fae9ea1e31da959ada616c642d6e97` (246459 bytes)
- `chromium-03-binding-disclosed-sv.png` — `2ccda8f7fbf5519b0eae81a9319dcfd09e87ac7e4a341e0c64d4cc1e66b4f065` (281345 bytes)
- `chromium-04-snapshot-en.png` — `2ecd54381ea6a6bf266f25f565b5dfc3a0193eec61e149acdf1fe64e3b148fee` (262209 bytes)
- `chromium-04-snapshot-sv.png` — `f44d61ee1b59913a06894e483fa0369637fae9ea1e31da959ada616c642d6e97` (246459 bytes)
- `chromium-05-snapshot-readonly-sv.png` — `f44d61ee1b59913a06894e483fa0369637fae9ea1e31da959ada616c642d6e97` (246459 bytes)
- `chromium-06-position-blocked-sv.png` — `fbe6df1ded055561f9e2e7a6620993d26736952a2b07e61527869225860fbc53` (153343 bytes)
- `chromium-06-session-open-sv.png` — `14b9fe5fd2e2a8e13d9a6a2868b2d20adda0a061ea7bf5992741450823c80a9e` (317022 bytes)
- `chromium-07-themes-en.png` — `dc6a44302b72f7b7cdf71831a0a608a75a84080540f30effbc2659907f36dda2` (339443 bytes)
- `chromium-07-themes-sv.png` — `14b9fe5fd2e2a8e13d9a6a2868b2d20adda0a061ea7bf5992741450823c80a9e` (317022 bytes)
- `chromium-08-entry-form-sv.png` — `944ad47b9c08e7b1a7372e790dd6ee79e7a0bfe585fe245b61e86a1c2a5a67ac` (398603 bytes)
- `chromium-08-entry-saved-sv.png` — `63d7f297bebaacac9d6628339328483dd11501eb708390745c6a2b3d129589c3` (369256 bytes)
- `chromium-09-entry-confirmed-sv.png` — `4fcc64548092b0a119e5dd8b5732626af33a9d5df13cd48071c4a1444d6e5b2a` (397633 bytes)
- `chromium-09-entry-refused-sv.png` — `fdab7457f2c7ec5ac5a543dd7799b0f465a0760ed302da32c1837ecc27b7a6f1` (451520 bytes)
- `chromium-10-correction-refused-sv.png` — `04cb1fdbff5a5ea380f23ede89c37e2caf1cab85f6a6c575301261152adcd81e` (469987 bytes)
- `chromium-10-correction-saved-sv.png` — `b2e5d25aa76be989d39c9bd5c8b0226da778f5d60fcd385ff3046ff3216164c3` (397505 bytes)
- `chromium-11-history-sv.png` — `28b21f08240c6655dde008d48b076f07ff6b1d4077518f4f282726b71b5b045c` (504313 bytes)
- `chromium-12-verification-history-sv.png` — `824a279407461a5572e7c96e0f153963e0a365d558524a4ff864592ebfd03453` (521317 bytes)
- `chromium-12-verification-refused-sv.png` — `f511400711c4d4ed64f7f3b806d86e2e6f432cc46c39a53a75cd097256d973fd` (414344 bytes)
- `chromium-13-not-verified-neutral-en.png` — `c23a2f20e187358683b345831891a955725185cf777ab840bb74c5745845282d` (430202 bytes)
- `chromium-13-not-verified-neutral-sv.png` — `fe1733a8c63af0595a233af2ea68820b67bbc3a3399d9dff2229fe29e166b16e` (406675 bytes)
- `chromium-14-before-lock-sv.png` — `f21caa6635be630e5f13382f984f497cfd5731901859d96f27d4f1b7c46a54df` (144736 bytes)
- `chromium-14-lock-dialog-sv.png` — `532dd674f7896d107e18455199e9c15e2a4deedb042f527b74177dbcbbce99ac` (154301 bytes)
- `chromium-14-locked-sv.png` — `50222fd7f53b6516466a75ff5bc16384de493c9ef7f28c0a1a9ae1ca010d8d55` (145856 bytes)
- `chromium-15-entries-readonly-sv.png` — `57c578d08c43b8c0482b5da4d0706064f6ecd9c5fdd19df8bdd1fd11ce1fd82e` (398035 bytes)
- `chromium-15-locked-readonly-en.png` — `956a27c32af2a011598c1efd32e276c6db2d155ebd8d7a9167795b7be710fa21` (145976 bytes)
- `chromium-15-locked-readonly-sv.png` — `50222fd7f53b6516466a75ff5bc16384de493c9ef7f28c0a1a9ae1ca010d8d55` (145856 bytes)
- `chromium-16-second-assessor-joined-sv.png` — `94f66c508a266a13c941fad3715b36655fef9b78e88d5efffd46b2ddbfc51198` (335869 bytes)
- `chromium-16-withheld-en.png` — `13ab0af4c7ab4012461bce0d2ce7a1aabc04e5c856db1a9da1d39bb10bc738e7` (155345 bytes)
- `chromium-16-withheld-sv.png` — `9c41a26027cbd2892e5bd805d596ef8620f47c050590869666a46f781356dbe5` (153559 bytes)
- `chromium-17-revealed-sv.png` — `aa00f519ade37752c943e3746ed14050ad1ee3c9bb6371e80e1c2dfb05265f44` (217757 bytes)
- `chromium-17-second-documented-sv.png` — `f6c8b0f89aecb020434e5d0ab9be186821b8a332fd6560d1fa553227633a46d1` (355834 bytes)
- `chromium-17-second-locked-sv.png` — `aa00f519ade37752c943e3746ed14050ad1ee3c9bb6371e80e1c2dfb05265f44` (217757 bytes)
- `chromium-18-side-by-side-en.png` — `a72294ef9a509cef97c590c4bfce3fdb062c25febba0063623a5a81a566030d1` (188906 bytes)
- `chromium-18-side-by-side-sv.png` — `e67313ea8b1401b02bb35677dab972a4d9b81297a1b05373a1fdccfa8a3dcbf9` (188840 bytes)
- `chromium-19-relocked-sv.png` — `5c05fecc3d7bc4a39d885f58dc185abee959fa9f3b1b1ba80d047f85078dded8` (188786 bytes)
- `chromium-19-reopen-refused-sv.png` — `65f1a8a1a28a09aef953399eb199f3a08a9bde8a64a04df7fb711bdca3361b16` (202287 bytes)
- `chromium-19-reopened-sv.png` — `fe1733a8c63af0595a233af2ea68820b67bbc3a3399d9dff2229fe29e166b16e` (406675 bytes)
- `chromium-20-outsider-refused-sv.png` — `ef283a18b8918d0b48b2f3a4dc56ee99a8ad419404e2a2c6fe403b8d60093073` (4256 bytes)
- `chromium-20-panel-refused-sv.png` — `83f2ac1b190fa27b4eb16dbd2e1609ec0617ee4958958a28aa390d1854295355` (194487 bytes)
- `chromium-20-panel-resolution-en.png` — `e1037d89e0f59d232a96aa9ab88069b2d0916777f732e192830ba279f77e7b54` (199750 bytes)
- `chromium-20-panel-resolution-sv.png` — `33fcf3809fb32a09f9b3e582f7edef3fddae35c73c89e7b910f568a4f7dfecc7` (192892 bytes)
- `chromium-20-panel-revealed-sv.png` — `31c1a5a09a95b7e38b2b7fe5b90ffe9ee54cbe065305f594694167d79c63d21b` (182551 bytes)
- `chromium-20-positions-untouched-sv.png` — `57c578d08c43b8c0482b5da4d0706064f6ecd9c5fdd19df8bdd1fd11ce1fd82e` (398035 bytes)
- `mobile-375-01-overview-module-en.png` — `455ed494fd63ae0e8e605ed1a2f072ffea62ff9101297f63db716ad52c2016f9` (216866 bytes)
- `mobile-375-01-overview-module-sv.png` — `a75959d058be22459198712ab0176a47d857c74a75aa721ac9570959777dd3f2` (209750 bytes)
- `mobile-375-02-tool-landing-en.png` — `64c83015a88f6c8b63c9fb33e1de8e76cf63d6745d1a2dbf6b043317b7764335` (219356 bytes)
- `mobile-375-02-tool-landing-sv.png` — `5d136371f3344eba25de3bd9532db098cf79ef79d8479e8d1d4df0f8543788e5` (203817 bytes)
- `mobile-375-03-binding-disclosed-sv.png` — `b0522da490d0be2a9b3428eb023100769417a3da32ca965fc8c919afeae03588` (240878 bytes)
- `mobile-375-04-snapshot-en.png` — `e4a6643db9243481f6317e15ba7f64a155fa49d47447947869042c2e6ae6a217` (219338 bytes)
- `mobile-375-04-snapshot-sv.png` — `5d136371f3344eba25de3bd9532db098cf79ef79d8479e8d1d4df0f8543788e5` (203817 bytes)
- `mobile-375-05-snapshot-readonly-sv.png` — `5d136371f3344eba25de3bd9532db098cf79ef79d8479e8d1d4df0f8543788e5` (203817 bytes)
- `mobile-375-06-position-blocked-sv.png` — `52e692ee1c9ad2cb4b54596ccb50f70db0ad68f6ee703089cf2ac256af3a92bb` (120363 bytes)
- `mobile-375-06-session-open-sv.png` — `4ed050cee742b28fcd7684f7b2f5c26483467dd450fb6eef421894739f939102` (271283 bytes)
- `mobile-375-07-themes-en.png` — `409d8e82bb9fbb7b2d2f4a635a75dd2d987e440e0fca1acb3564921df245017e` (291464 bytes)
- `mobile-375-07-themes-sv.png` — `4ed050cee742b28fcd7684f7b2f5c26483467dd450fb6eef421894739f939102` (271283 bytes)
- `mobile-375-08-entry-form-sv.png` — `cfc23d3134bad51274ebe400d897e73e39d3e31d1765a94cb4d7249d7422a510` (351879 bytes)
- `mobile-375-08-entry-saved-sv.png` — `ccd6b4898b93cdf6313cc77a772ad28f8dc89ea3590f2d02c8abd55eae7611e3` (321347 bytes)
- `mobile-375-09-entry-confirmed-sv.png` — `8691957cd665b0be64bd813fcd6aea48a21add615f154ac62996df8f35ecc0d9` (347864 bytes)
- `mobile-375-09-entry-refused-sv.png` — `c103bd0934ea757db984bfb6f69fd08c1940a36ef48c1133e811babaec9ad33f` (402165 bytes)
- `mobile-375-10-correction-refused-sv.png` — `c3e0e9a49f40e4c72a473f10e1f09147d3dd925cfb665183a61b1b61af6daa74` (419169 bytes)
- `mobile-375-10-correction-saved-sv.png` — `d86b9e1d8e262cd10fb3f60a9c6610952b4945c2d954f1cd42da9498fe13e403` (347503 bytes)
- `mobile-375-11-history-sv.png` — `2c3fe5bfb8afabcbfcd27fd4fbb66cd9f466ed9223aa60352ce84c8461a592c2` (449020 bytes)
- `mobile-375-12-verification-history-sv.png` — `819a8832352186043bf87d24801925c695093a9cf72f308ec30ec2717216b896` (465358 bytes)
- `mobile-375-12-verification-refused-sv.png` — `9fb41065a1f15a31edaa19f3aae6f7faf2ac9dd0f27cdb13ea36631794fb8628` (363232 bytes)
- `mobile-375-13-not-verified-neutral-en.png` — `e1b2c2a05c4908d57d02f49be8bebde2d1d5f2d4dc6ced1ab4e289ae63f1e296` (377391 bytes)
- `mobile-375-13-not-verified-neutral-sv.png` — `fd4a3a6c79d58967a7d3b0070d57c7e12c28326b8091be8d725a3f985c112c14` (356123 bytes)
- `mobile-375-14-before-lock-sv.png` — `a1c96f16311868ca211a15526f1c13bef668513d8939ccbc4150f1178c6263b3` (112068 bytes)
- `mobile-375-14-lock-dialog-sv.png` — `e684e3cd92f7b78fcc13f943847ff70521361c8afa10cfe357bb0aa38f4c0e7d` (115102 bytes)
- `mobile-375-14-locked-sv.png` — `1f29521f816ac0c706867ecaa246628c3caa464eceb42439c36da7e93192af0a` (112621 bytes)
- `mobile-375-15-entries-readonly-sv.png` — `c01d160639f8cc49a49eee2b49e36f3e886c41dd75799a03ce66f623e74827aa` (346470 bytes)
- `mobile-375-15-locked-readonly-en.png` — `38449610a972309508624121c8d808269d75f1566881d31608a584116ed1e8dc` (115268 bytes)
- `mobile-375-15-locked-readonly-sv.png` — `1f29521f816ac0c706867ecaa246628c3caa464eceb42439c36da7e93192af0a` (112621 bytes)
- `mobile-375-16-second-assessor-joined-sv.png` — `e2263e28d9cf0a495fff0b665fc9af533a51186c5a3839e26558c317dc877f68` (289733 bytes)
- `mobile-375-16-withheld-en.png` — `d2dc02a53f0d8ba005236793fee4cdb329664138709e87a66cb859728360eebc` (123940 bytes)
- `mobile-375-16-withheld-sv.png` — `52e692ee1c9ad2cb4b54596ccb50f70db0ad68f6ee703089cf2ac256af3a92bb` (120363 bytes)
- `mobile-375-17-revealed-sv.png` — `8e36ea87b516f4a3d03ed6a7c160bc1d46a6893f3dff4972e82f7742da9e7af4` (182418 bytes)
- `mobile-375-17-second-documented-sv.png` — `6f44e1d375617e2229a160c491af46a80558e15def0e0661b309c2decaa9fb5c` (307703 bytes)
- `mobile-375-17-second-locked-sv.png` — `8e36ea87b516f4a3d03ed6a7c160bc1d46a6893f3dff4972e82f7742da9e7af4` (182418 bytes)
- `mobile-375-18-side-by-side-en.png` — `bb5f0e3d9832adedbd2972a048f0d7c1c051f7acddce66152df6fe5607c961fd` (157316 bytes)
- `mobile-375-18-side-by-side-sv.png` — `97b682fecfeb6a99d94226016dad372921c8f97bfe70023666ec7fd257e9a82c` (154417 bytes)
- `mobile-375-19-relocked-sv.png` — `8daa297377f3dee7679a6544c419f1932f21558e737130b8c64551a9e8a81864` (154473 bytes)
- `mobile-375-19-reopen-refused-sv.png` — `c4b8603970d452ff77c577720895f9956670af072d16e76eb7a56b9ea95c1a96` (167301 bytes)
- `mobile-375-19-reopened-sv.png` — `fd4a3a6c79d58967a7d3b0070d57c7e12c28326b8091be8d725a3f985c112c14` (356123 bytes)
- `mobile-375-20-outsider-refused-sv.png` — `e002fd064ec7e54d15c4e5a8c09811e897517bdfc14fd81e3677dba637ac8a9c` (2540 bytes)
- `mobile-375-20-panel-refused-sv.png` — `e9a04b76d0ff0ed17e864d7e0df0c4ab2d3ee1a34870cbfd85e794d845a5d921` (160461 bytes)
- `mobile-375-20-panel-resolution-en.png` — `54cb7ed5ecc4deeff69b88316a5e10efa317ac6cac49cece5c7e842b09edf3da` (165296 bytes)
- `mobile-375-20-panel-resolution-sv.png` — `827ddda4b51a957c56f30736cf596d52c029b244317b71153d4087af1a0997f9` (158345 bytes)
- `mobile-375-20-panel-revealed-sv.png` — `1eba3f029d2b931c2ba0831622c256f66c77cf9335d061b84947f8816cf0ebd6` (148159 bytes)
- `mobile-375-20-positions-untouched-sv.png` — `c01d160639f8cc49a49eee2b49e36f3e886c41dd75799a03ce66f623e74827aa` (346470 bytes)
- `mobile-390-01-overview-module-en.png` — `5dd8d35c180895e4c98f5f82c72eaef018a8e443767f23b08294172563d6d375` (216105 bytes)
- `mobile-390-01-overview-module-sv.png` — `bd85218e62eec18fe4fe0d7d72883dd3242571916349295aae0c4fbd8c5ad390` (207568 bytes)
- `mobile-390-02-tool-landing-en.png` — `d4dbca3cb4893438048bc3aef3c200e62922c241f5525586eee74e01a8e31728` (219811 bytes)
- `mobile-390-02-tool-landing-sv.png` — `45b1a21b2137bd45da475fe100cd867433b98c56c2c9c4d0bf0d6f56d4a5b51c` (203977 bytes)
- `mobile-390-03-binding-disclosed-sv.png` — `bb1a8d2bc06f673af9726f086cfcaf410bc237d4be06c16a774091b6831d058d` (241161 bytes)
- `mobile-390-04-snapshot-en.png` — `213ec937c9c89d659a30245940ebb71f38aa18ba1c0a7238a1696fd7343778dc` (219906 bytes)
- `mobile-390-04-snapshot-sv.png` — `45b1a21b2137bd45da475fe100cd867433b98c56c2c9c4d0bf0d6f56d4a5b51c` (203977 bytes)
- `mobile-390-05-snapshot-readonly-sv.png` — `45b1a21b2137bd45da475fe100cd867433b98c56c2c9c4d0bf0d6f56d4a5b51c` (203977 bytes)
- `mobile-390-06-position-blocked-sv.png` — `232b8957adf503bf1cf806e6ea54d3327fdb18f31dfc6e3bdb3afabece0ec739` (120370 bytes)
- `mobile-390-06-session-open-sv.png` — `144a6b7069d3c2a8d9dc2c3adc5a1d78a2c774441a8d7fe73cb9b9521d5b309d` (271088 bytes)
- `mobile-390-07-themes-en.png` — `918d96513e89ccbb94a61f3858f67325f1faa1e204aaa99902edc40b38f5fba6` (291632 bytes)
- `mobile-390-07-themes-sv.png` — `144a6b7069d3c2a8d9dc2c3adc5a1d78a2c774441a8d7fe73cb9b9521d5b309d` (271088 bytes)
- `mobile-390-08-entry-form-sv.png` — `0cc4b3e89d8f4dad1f000834aa40986429aa3219fe5c03341356ab86890a5c84` (350783 bytes)
- `mobile-390-08-entry-saved-sv.png` — `23f557503cc3f5d11d3c755c35b29802611fdda6d657b813d9f122aa90628fca` (320757 bytes)
- `mobile-390-09-entry-confirmed-sv.png` — `ee75499bca393486f095eaa6e9e74e77e6bdca1de00fb81af29b75adec540d3f` (346522 bytes)
- `mobile-390-09-entry-refused-sv.png` — `317045c8a3ff671cec3029846a47d56bdfdc9ce45a46b7f3b768913e628c7845` (400550 bytes)
- `mobile-390-10-correction-refused-sv.png` — `65f0106f150f64284c4f885aca555c8aa901e57fe4a69a5323e2dc2c2261863b` (417340 bytes)
- `mobile-390-10-correction-saved-sv.png` — `aefafc154df39774e93730523682fcd879d593b00034272bdbdb71e2543ed1f3` (346423 bytes)
- `mobile-390-11-history-sv.png` — `c7a904639897d89af303e51ee16e7f0f455bea1dce450eb8e12591401a74b2c8` (447425 bytes)
- `mobile-390-12-verification-history-sv.png` — `288d10e6d209b92523212633ebd6d4627b191181e21cea6c39f1d15c7c9734c7` (463731 bytes)
- `mobile-390-12-verification-refused-sv.png` — `1132cd88930e6168e68d59f04480efa18cc57ad0f3cb4bb51879e05715a44aaa` (362227 bytes)
- `mobile-390-13-not-verified-neutral-en.png` — `406b37553fd745795de1b9e1a6b9bd082f72f3579cc77d4ce1381856a276a193` (377990 bytes)
- `mobile-390-13-not-verified-neutral-sv.png` — `dee6c77832fc905d1a9786f0fdff2ee5367c14ef915f84ca2d4afcd90bdbf89d` (354916 bytes)
- `mobile-390-14-before-lock-sv.png` — `6d78189490d5df49702f4d7cb873a8564b61d7931dde3a7f8db4fc4f8d4aa0ec` (111994 bytes)
- `mobile-390-14-lock-dialog-sv.png` — `f6adb70609815e58df90629bcb618ae86c624dbc65d0fd13eb17d8777598534f` (115117 bytes)
- `mobile-390-14-locked-sv.png` — `32a8025cbee4c0602a51cccc568557c0a0e885188e7d55411e82ed267dbe2716` (112487 bytes)
- `mobile-390-15-entries-readonly-sv.png` — `81b95201bf4b2190a4b54b70f75f4af22e338a35a870deea607da6cb01e2d76b` (346779 bytes)
- `mobile-390-15-locked-readonly-en.png` — `f1f85f094f3922566f8190a44b787ddd74f4077d604c1a75ec7072de36394a74` (114272 bytes)
- `mobile-390-15-locked-readonly-sv.png` — `32a8025cbee4c0602a51cccc568557c0a0e885188e7d55411e82ed267dbe2716` (112487 bytes)
- `mobile-390-16-second-assessor-joined-sv.png` — `07bf22fb9481a1b8f184e92f6240643dea0261786a3cad80ba70d70789d4629f` (289492 bytes)
- `mobile-390-16-withheld-en.png` — `99da7531e75b3a5e7d9e63b1177e29472fa4b0d746cc1880d47972dc871ce7d0` (123263 bytes)
- `mobile-390-16-withheld-sv.png` — `232b8957adf503bf1cf806e6ea54d3327fdb18f31dfc6e3bdb3afabece0ec739` (120370 bytes)
- `mobile-390-17-revealed-sv.png` — `0123ddd506e2363941989146cb78e5823598556530d67309cdd3ba92fe50dee1` (182947 bytes)
- `mobile-390-17-second-documented-sv.png` — `8a6bb65130a98f34900a507fc9a2918e4dc7c4ef6375fe2883a9c705c416bcc3` (307295 bytes)
- `mobile-390-17-second-locked-sv.png` — `0123ddd506e2363941989146cb78e5823598556530d67309cdd3ba92fe50dee1` (182947 bytes)
- `mobile-390-18-side-by-side-en.png` — `d0db72998a31e08b4ce41e25ca80f1b874d8b7bcf41baa3d84155b555aaf71f6` (156743 bytes)
- `mobile-390-18-side-by-side-sv.png` — `a61384ed76ee7fff9a8f91b15ae1eac194a176a7c0366cf1b292a6500e748116` (154632 bytes)
- `mobile-390-19-relocked-sv.png` — `2625ad3dd8570ffffdbb7fcf638ca0afd229ef8f2d9f9fcf35bb89ef2b71aad2` (154689 bytes)
- `mobile-390-19-reopen-refused-sv.png` — `d960d12eb959651420a065b97a61b18675dd80bd9ce6a66f0dc711a0dde667e5` (167018 bytes)
- `mobile-390-19-reopened-sv.png` — `dee6c77832fc905d1a9786f0fdff2ee5367c14ef915f84ca2d4afcd90bdbf89d` (354916 bytes)
- `mobile-390-20-outsider-refused-sv.png` — `0712fd74071445afc9b98c41440bfd0b7a0886fc95a1e4e755d8f424c88fc8b1` (2742 bytes)
- `mobile-390-20-panel-refused-sv.png` — `9680bdb0e63f5b5171ba3f873847397d5f5d520442efc16097c3958534bd9cd7` (160742 bytes)
- `mobile-390-20-panel-resolution-en.png` — `c940977a3dc1678912c7810e0bd40c39bfe25408761755191fcf86099d714691` (165150 bytes)
- `mobile-390-20-panel-resolution-sv.png` — `8d7d783c53c80a92b3cfc0f15618d7a18acc44c34617e1b52be009fe5a19cff6` (158621 bytes)
- `mobile-390-20-panel-revealed-sv.png` — `755c64c5a36a127b803b0565feb23b17da31203a74127fac0be3532121845efa` (148229 bytes)
- `mobile-390-20-positions-untouched-sv.png` — `81b95201bf4b2190a4b54b70f75f4af22e338a35a870deea607da6cb01e2d76b` (346779 bytes)

## Traces (digested, not committed)

- `chromium/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-chromium.zip` — `2770ca2c3483f30404d996ababee9edd0a6ff6133f959509ebae551e530f9924` (2040821 bytes)
- `chromium/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-chromium.zip` — `36ec894b2ddeaee384db3753498ea09b85aa59b4754a35cd164ac75c22f38e56` (1994662 bytes)
- `chromium/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-chromium.zip` — `f24b2961b763736cd32965c58a2b0670b9dd62e9a09afeb13c27f7bfd2a1a85e` (2030156 bytes)
- `chromium/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-chromium.zip` — `1445c0b82baacf4bbe6399284b0312a9cee31712932cbd0840aa9a54cc742b1c` (1533510 bytes)
- `chromium/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-chromium.zip` — `8f15855894f9bbdb4c22352bd93ff0a776725153b7c420ab7c0974ba92ea0998` (1740719 bytes)
- `chromium/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-chromium.zip` — `dade0db5419a7c361ffefe8db0b4ecf06ec3eb15df01502019c5d10e46ae84b4` (1404328 bytes)
- `chromium/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-chromium.zip` — `ee31b0be6a081f054e6b01f55463bfc228bb42478daa369176c922682c2e021f` (1751158 bytes)
- `chromium/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-chromium.zip` — `5aa212a57480c51592299c549019882e3aa5c9b3127d100940d716fc8439ece6` (1804287 bytes)
- `chromium/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-chromium.zip` — `49d7231e619f044732e0b0ebd03abb9d226cc6414cddfe3c8aadfdba91ce6cef` (1981261 bytes)
- `chromium/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-chromium.zip` — `8e5ca8b48d745a553655b4b753c43c592c25a007bbb82ff5920338b4c340b752` (1792090 bytes)
- `chromium/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-chromium.zip` — `76a78141df9d51a6d31cbb1c9e50066bfd57bcce37d529ea6cfaf1cf643b69b3` (1993106 bytes)
- `chromium/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-chromium.zip` — `f1a80ea06c701d4d5147d7f2d6a6748f47157bbcafec9041525c67a45ebbfcd3` (1970267 bytes)
- `chromium/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-chromium.zip` — `e64740b7198e9bf7da3ab0196678ed5092f521dc034834b35a67b940bb05fc6f` (1770080 bytes)
- `chromium/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-chromium.zip` — `4ba5877e5940ef9d512c65662d721b3fe72f6d6e07645befc3357e8ac8485c93` (2498009 bytes)
- `chromium/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-chromium.zip` — `a6d5660d2f8cd83d8a0789525eabb304ad7cc8414d8aac34184513038b8f401e` (1566638 bytes)
- `chromium/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-chromium.zip` — `72cc1bba8095d17f9d2bde1fd068be7b3f1a97cb118f8efc3fe4440f9eab2dee` (1861801 bytes)
- `chromium/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-chromium.zip` — `dc78ffcc9bbadb566d729d21f6c8d887c93e970ce09f2434709504f93cffb145` (1968063 bytes)
- `chromium/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-chromium.zip` — `f1c3b854793cc208dea03c51e9c22d9b63f1157aec5109908ef3ba091a0973d4` (2212747 bytes)
- `chromium/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-chromium.zip` — `fe118bb8fe36596e4817becdaf945d28a5ffd0b8d3811118c57fd79642796b11` (1532356 bytes)
- `chromium/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-chromium.zip` — `e86dec6c3b617d810aa152da358a9b2eb9e906d6ad79b3c793e2d8d96334f670` (4368035 bytes)
- `mobile-375/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-mobile-375.zip` — `186c1b950ae1d01ecfd49319c14164e422e840b540e6ddd8298d02f4e53d6906` (2412125 bytes)
- `mobile-375/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-mobile-375.zip` — `a079d1ed756880f9567d533de48ab1f68138143847418b0400ff47c1d026d5a3` (2059218 bytes)
- `mobile-375/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-mobile-375.zip` — `6c61dbb0a57ff43713389568577f783b27bd1f1d8ea9008c7e0941847ddab7fd` (2178415 bytes)
- `mobile-375/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-mobile-375.zip` — `1d50db9a510aaa4dd19482f3dc1a3aee468081241366a490f3362ec944085613` (2090053 bytes)
- `mobile-375/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-mobile-375.zip` — `e9b1799ff0f46adc5986e1a45c6e4358e86eb80c13ec23b1885bd5f4ffdaa275` (2069659 bytes)
- `mobile-375/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-mobile-375.zip` — `c3e9851e9413b589ea8c047f2f83f77090ce89a9be5c299d9d1b543b92eb1095` (1430658 bytes)
- `mobile-375/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-mobile-375.zip` — `8ac46dd9cb31a922f1a0aa291d383d14fdf594ab47a218744022d0b51b1aac58` (2357953 bytes)
- `mobile-375/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-mobile-375.zip` — `c32b2c0530bc64b7984cb321129a3ea3d14ed9341efe0f90e8477fe200a0a713` (1964766 bytes)
- `mobile-375/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-mobile-375.zip` — `f5591e35571744d57ced60e8708ae405ceb5a9c4311f03383d66b4dbe733fa6b` (2196504 bytes)
- `mobile-375/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-mobile-375.zip` — `5a153d6d27407d4d870cdc348eef13e3a055da603d1e6e69a39bd1fb20c7febe` (1786027 bytes)
- `mobile-375/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-mobile-375.zip` — `e8e4b94cdb377ef65ece75294c29f5ba321ca16c3e01293aba46762aebee1f34` (2034146 bytes)
- `mobile-375/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-mobile-375.zip` — `530ef456ce1587fe42bc41a45b8822c663b6925681df0846ff50d402f9c1c5d8` (2448138 bytes)
- `mobile-375/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-mobile-375.zip` — `c062afb3e08ea3f1aa5eb3595772e40f5961675567fb46c010db09efe2508d82` (2474372 bytes)
- `mobile-375/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-mobile-375.zip` — `05af55166cdc8e30898a14d70006dc22bbc38a6a13669b58d49d5b9eac2c381d` (2411044 bytes)
- `mobile-375/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-mobile-375.zip` — `552ff1b2175206fbbf42970f47254bce1ba825860d02e25fc47cdc96968a0901` (2041812 bytes)
- `mobile-375/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-mobile-375.zip` — `1484a61fb843735e0088ebfd275feae7338caca5f433180378caa39309c4d662` (2362106 bytes)
- `mobile-375/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-mobile-375.zip` — `142426237c5fe46a76e73c09bbdae8592dd9a5e707e4e87c93742b7fc9a0d0ce` (2046358 bytes)
- `mobile-375/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-mobile-375.zip` — `5bb0e0c3e7ebc826d367239dd943e004d60b59bb8b684d70a7dd7cebf7813d2a` (2415346 bytes)
- `mobile-375/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-mobile-375.zip` — `d67e506d0e0b8d1ce4e618f66172b977ebaf5d0b2f05b97e00e7f30aa309f075` (1463941 bytes)
- `mobile-375/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-mobile-375.zip` — `82520f972a678ad353b3412f8bb9c0471d3178dbda68150269d1c27bacf61e56` (5058718 bytes)
- `mobile-390/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-mobile-390.zip` — `b81b49910ae3cd15d43afa7a862af5efa419d8fc9ebdfdf5203cd8a3d2534060` (2388678 bytes)
- `mobile-390/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-mobile-390.zip` — `8f2b3ffedd54d19bf88903b7c837e56e14267d7ff624f55be52c2decb480d824` (1965891 bytes)
- `mobile-390/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-mobile-390.zip` — `8aedf9fb6bd1018456cbf1187d61b6a1f8a1fd6e8ce709e9000b5131fb1451cb` (1868197 bytes)
- `mobile-390/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-mobile-390.zip` — `bec6fba478da5faed607c08205d12c1254e011928a24c08af0320e2ca9cad706` (2148703 bytes)
- `mobile-390/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-mobile-390.zip` — `3986f7dd818a24a0c55e0062bbb828d7972e18c0198904fce46462a384aab143` (2050788 bytes)
- `mobile-390/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-mobile-390.zip` — `87c7e0707c862f8ada783166267b3efda7611c58937104f592c9a2ad7159b557` (1571869 bytes)
- `mobile-390/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-mobile-390.zip` — `abab7dda21161186d10defe8078cc04b62eef7c343b734b00bf7137d965408f0` (2285736 bytes)
- `mobile-390/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-mobile-390.zip` — `da0972edb65faf8c617ade4649eb90ff22c4944cb8bdf7fe2ecd99b45264afd5` (1916240 bytes)
- `mobile-390/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-mobile-390.zip` — `f3c24658d03b08a3315c8e8e0f5809b1a2c1dbf2ecd551002d0dd73430a01ac9` (2304630 bytes)
- `mobile-390/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-mobile-390.zip` — `add2b348b7aa2b1017c0678bc681f77aa09ac727e524792e00f28763bc85bc64` (1898534 bytes)
- `mobile-390/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-mobile-390.zip` — `92811e6e4f4a21e54802d34bd83bf1f669abc286f35ee8b5e997f5791ee36360` (1896679 bytes)
- `mobile-390/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-mobile-390.zip` — `c6c61c99d7de164c4a895c39674ccd07b333fbe9a0d1834c521391a13bc79941` (2310392 bytes)
- `mobile-390/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-mobile-390.zip` — `6dfde1d67b7271fe8fb9d40a8e8ff4706460b33902e5a59e39042896d983912a` (2741050 bytes)
- `mobile-390/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-mobile-390.zip` — `46cc66cb4deeed5b80f498e168b8cf98ea062549b27295742a40c9a4ab4cea5d` (2292420 bytes)
- `mobile-390/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-mobile-390.zip` — `bb8997ad07e51e237b17db1c420da03362e217f08dcb30c69a42bcea00718751` (2041355 bytes)
- `mobile-390/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-mobile-390.zip` — `c906f0e11fec490c8122ef88a0099c2e4091972ed7378d4211d83fe0be4e7315` (2290729 bytes)
- `mobile-390/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-mobile-390.zip` — `effe44d2f9d01a128f8378d551e05ca66e7fcc0a172ec0ef78384922c703da42` (1582801 bytes)
- `mobile-390/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-mobile-390.zip` — `036b7e255fef2550cadda5f5319172cd57f7af26bfe98e2696c534aab9c7f00e` (2212490 bytes)
- `mobile-390/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-mobile-390.zip` — `db393a06069a028122345770130d989cf354e421cb29a422374014acf3c27fb4` (1593645 bytes)
- `mobile-390/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-mobile-390.zip` — `e4442464fe1f7d9ea622af027c8ce357086b2d0760903b534601437c38625cb3` (4721092 bytes)
