# BESKT PR 5B — the interview tool, ROUTED browser evidence

Captured at HEAD `e69efdb7d25f10da6faf03ff53f65b8689b990a5`, 165 steps over
3 viewport(s), 240.9 s of measured step time.

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
| chromium | overview | 3 | 21.8 s |
| chromium | open | 4 | 21.0 s |
| chromium | binding | 1 | 0.9 s |
| chromium | snapshot | 4 | 1.6 s |
| chromium | session | 2 | 3.8 s |
| chromium | themes | 3 | 1.9 s |
| chromium | document | 3 | 1.6 s |
| chromium | confirm | 2 | 1.3 s |
| chromium | correct | 2 | 1.5 s |
| chromium | history | 1 | 0.7 s |
| chromium | verify | 2 | 1.8 s |
| chromium | neutral | 2 | 1.6 s |
| chromium | lock | 3 | 1.0 s |
| chromium | locked | 3 | 5.4 s |
| chromium | independence | 4 | 7.0 s |
| chromium | second | 3 | 4.0 s |
| chromium | compare | 3 | 0.6 s |
| chromium | reopen | 3 | 6.0 s |
| chromium | panel | 6 | 7.2 s |
| chromium | refusal | 1 | 4.3 s |
| mobile-375 | overview | 3 | 22.0 s |
| mobile-375 | open | 4 | 4.5 s |
| mobile-375 | binding | 1 | 0.8 s |
| mobile-375 | snapshot | 4 | 1.2 s |
| mobile-375 | session | 2 | 3.6 s |
| mobile-375 | themes | 3 | 1.7 s |
| mobile-375 | document | 3 | 1.2 s |
| mobile-375 | confirm | 2 | 1.0 s |
| mobile-375 | correct | 2 | 1.1 s |
| mobile-375 | history | 1 | 0.5 s |
| mobile-375 | verify | 2 | 1.4 s |
| mobile-375 | neutral | 2 | 1.3 s |
| mobile-375 | lock | 3 | 0.9 s |
| mobile-375 | locked | 3 | 5.0 s |
| mobile-375 | independence | 4 | 7.0 s |
| mobile-375 | second | 3 | 3.6 s |
| mobile-375 | compare | 3 | 0.5 s |
| mobile-375 | reopen | 3 | 5.6 s |
| mobile-375 | panel | 6 | 6.4 s |
| mobile-375 | refusal | 1 | 4.2 s |
| mobile-390 | overview | 3 | 20.8 s |
| mobile-390 | open | 4 | 4.6 s |
| mobile-390 | binding | 1 | 0.8 s |
| mobile-390 | snapshot | 4 | 1.4 s |
| mobile-390 | session | 2 | 3.6 s |
| mobile-390 | themes | 3 | 1.3 s |
| mobile-390 | document | 3 | 1.2 s |
| mobile-390 | confirm | 2 | 1.1 s |
| mobile-390 | correct | 2 | 1.2 s |
| mobile-390 | history | 1 | 0.5 s |
| mobile-390 | verify | 2 | 1.3 s |
| mobile-390 | neutral | 2 | 1.4 s |
| mobile-390 | lock | 3 | 0.9 s |
| mobile-390 | locked | 3 | 5.0 s |
| mobile-390 | independence | 4 | 7.3 s |
| mobile-390 | second | 3 | 3.7 s |
| mobile-390 | compare | 3 | 0.5 s |
| mobile-390 | reopen | 3 | 5.7 s |
| mobile-390 | panel | 6 | 6.3 s |
| mobile-390 | refusal | 1 | 4.3 s |

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
- `chromium-08-entry-saved-sv.png` — `8d280262f37b2f4ecedb2d3e08b9e3ae1c806bb635b5895a9c3492e0339b5417` (369280 bytes)
- `chromium-09-entry-confirmed-sv.png` — `01e83cfa00facc0cc17ad8482a728b48b88e07da8dd24a76b727d4f03500a9d1` (397531 bytes)
- `chromium-09-entry-refused-sv.png` — `97cb68cf124b81effaae08bcc1b6690e21acf3069709ba922fa57fd4f853fb48` (451539 bytes)
- `chromium-10-correction-refused-sv.png` — `53454f3870bdda2baa41fe95d48be8aa3abbadc013c7f5ddc5a07c051f47bf0a` (469884 bytes)
- `chromium-10-correction-saved-sv.png` — `f65eed14ef446d797fc084f3d84e412fa21c8a6a2301a6777adf46b174f23622` (397393 bytes)
- `chromium-11-history-sv.png` — `34ebb9a4c70ee81160d53e41f0fa7fa6f6a24837b9765b327ef46134c3e682ea` (504500 bytes)
- `chromium-12-verification-history-sv.png` — `229ec11b088338ff87c93b0da624d030477fa9378356bcc2c0100e49c6aaf9e8` (521349 bytes)
- `chromium-12-verification-refused-sv.png` — `fd54b99860326a27c26ff2991b50f0bdfb044f4c56d8baa67d2fffb7ace71af7` (414237 bytes)
- `chromium-13-not-verified-neutral-en.png` — `d4ff6e31ff6705a13e31934810cdb050332f44f3d95fb91faf76e777e073dc93` (429994 bytes)
- `chromium-13-not-verified-neutral-sv.png` — `67f2a169d997c284d2808f3313956753b841faa4d3e76757ee04bf52942b952b` (406492 bytes)
- `chromium-14-before-lock-sv.png` — `f21caa6635be630e5f13382f984f497cfd5731901859d96f27d4f1b7c46a54df` (144736 bytes)
- `chromium-14-lock-dialog-sv.png` — `532dd674f7896d107e18455199e9c15e2a4deedb042f527b74177dbcbbce99ac` (154301 bytes)
- `chromium-14-locked-sv.png` — `28ac7108469aeae9a5f254cadfbe72dfff605782c80e609de94208ac46869cf7` (145809 bytes)
- `chromium-15-entries-readonly-sv.png` — `3ff623d27c4d5770d75752b9b252b8761bd41c66d8c2120441eed6fd9885f012` (397845 bytes)
- `chromium-15-locked-readonly-en.png` — `e7ddee4479275c82b84fd8478554c437a9c68cd64ac6ec4e84670059e98f4db0` (145932 bytes)
- `chromium-15-locked-readonly-sv.png` — `28ac7108469aeae9a5f254cadfbe72dfff605782c80e609de94208ac46869cf7` (145809 bytes)
- `chromium-16-second-assessor-joined-sv.png` — `94f66c508a266a13c941fad3715b36655fef9b78e88d5efffd46b2ddbfc51198` (335869 bytes)
- `chromium-16-withheld-en.png` — `13ab0af4c7ab4012461bce0d2ce7a1aabc04e5c856db1a9da1d39bb10bc738e7` (155345 bytes)
- `chromium-16-withheld-sv.png` — `9c41a26027cbd2892e5bd805d596ef8620f47c050590869666a46f781356dbe5` (153559 bytes)
- `chromium-17-revealed-sv.png` — `6ad5a1a45d6abe541624552d01d6e0b5d59036de6c86ffe8134558d0d4a2ad9c` (217573 bytes)
- `chromium-17-second-documented-sv.png` — `9fb45e7faf18f4f9749802d1709e60f85cf524a7520c487093b3d88697f798c0` (355583 bytes)
- `chromium-17-second-locked-sv.png` — `6ad5a1a45d6abe541624552d01d6e0b5d59036de6c86ffe8134558d0d4a2ad9c` (217573 bytes)
- `chromium-18-side-by-side-en.png` — `f39e947b0aca48845b99276854406cad0383eb86aa3ddf7cc9e71cedd6bd5038` (188606 bytes)
- `chromium-18-side-by-side-sv.png` — `c5149fa46e005d5e1d324f7232aa52f10a8116578059898c842c9f76be870adc` (188683 bytes)
- `chromium-19-relocked-sv.png` — `10cfc039fa96fd6783b84b420a3f357b190f81e1d770d6a4612cb25abddedf9d` (188669 bytes)
- `chromium-19-reopen-refused-sv.png` — `9efa86c51e97b46cc3b74e7d7d324330fdc68d35b6c2e608d431d0f3b987ebd9` (202128 bytes)
- `chromium-19-reopened-sv.png` — `67f2a169d997c284d2808f3313956753b841faa4d3e76757ee04bf52942b952b` (406492 bytes)
- `chromium-20-outsider-refused-sv.png` — `ef283a18b8918d0b48b2f3a4dc56ee99a8ad419404e2a2c6fe403b8d60093073` (4256 bytes)
- `chromium-20-panel-refused-sv.png` — `c6aec623fb2d496fa03b644be58d97e30653d5715308bf5d13b00b0902a7ba18` (192936 bytes)
- `chromium-20-panel-resolution-en.png` — `4ac447211ffcd41f02a3f75aa2451eab5195c8eb193e1ad0c703723aab862ce5` (198595 bytes)
- `chromium-20-panel-resolution-sv.png` — `7c1272d4475d7eb4b1b226ce35779cc45db537e23f305c904315397da925c1e4` (191341 bytes)
- `chromium-20-panel-revealed-sv.png` — `644da52d05c41c3030adbf6715b0122c71b006007d9dd641ca1eed27d751e142` (181013 bytes)
- `chromium-20-positions-untouched-sv.png` — `3ff623d27c4d5770d75752b9b252b8761bd41c66d8c2120441eed6fd9885f012` (397845 bytes)
- `mobile-375-01-overview-module-en.png` — `75e7ec2965d191b94f9a3f5464333288707801b9a413d97e5ebbcfc5a8e8f337` (216869 bytes)
- `mobile-375-01-overview-module-sv.png` — `a75959d058be22459198712ab0176a47d857c74a75aa721ac9570959777dd3f2` (209750 bytes)
- `mobile-375-02-tool-landing-en.png` — `afa24354978287250fb509f6c3429813bac0c2f1f8d982c9b3560c1d8251c318` (219352 bytes)
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
- `mobile-375-08-entry-saved-sv.png` — `187d7f3cc59547b0a89e0cfaff11781162b36dd2f8415c23f238e1d4d5fc6a1e` (321302 bytes)
- `mobile-375-09-entry-confirmed-sv.png` — `a561bb54fd6a4ece47d8f57b145f9e3c3a6de4738a0c09f5cf6ff219b1b1ad79` (347752 bytes)
- `mobile-375-09-entry-refused-sv.png` — `92c70c459d88d0a18b5d0d34dce773a169cda95056c1ece2613090acb7970bad` (402110 bytes)
- `mobile-375-10-correction-refused-sv.png` — `2d334659e52860ce00c180026e91db1a8e97c23a78dfc61990008ad4c8583e1b` (419112 bytes)
- `mobile-375-10-correction-saved-sv.png` — `45d445ee25796f3add78a34da6731a03fec1f7f32d9fa078c7c98f381a88f572` (347364 bytes)
- `mobile-375-11-history-sv.png` — `6e450c4e3bd803c4c3d4deb2e9183452b08b2ceb66571968352f17de8ffd7114` (448744 bytes)
- `mobile-375-12-verification-history-sv.png` — `7106fd04b9dfb47028cd0710feb2f2ab130d8d232e9bf17c4e58fdc0dc6f4f48` (464947 bytes)
- `mobile-375-12-verification-refused-sv.png` — `4014e7b045d01b811c9f20e10970d54c05acfa43a9ad2dbb15b5ce4cae4b5a28` (363097 bytes)
- `mobile-375-13-not-verified-neutral-en.png` — `ee47be9c7e7ceb909ec1866212ac40da80b763bf066947f1237fc31346fb9894` (377323 bytes)
- `mobile-375-13-not-verified-neutral-sv.png` — `cb229fab9e45389d6f098ecc3a06e414db1198646dcd5f6dbe422347f4ca480e` (356007 bytes)
- `mobile-375-14-before-lock-sv.png` — `a1c96f16311868ca211a15526f1c13bef668513d8939ccbc4150f1178c6263b3` (112068 bytes)
- `mobile-375-14-lock-dialog-sv.png` — `e684e3cd92f7b78fcc13f943847ff70521361c8afa10cfe357bb0aa38f4c0e7d` (115102 bytes)
- `mobile-375-14-locked-sv.png` — `4dbbb9201c77624e4c1289226142643e36b043441c09192d2f5cc148a9e4f34f` (112515 bytes)
- `mobile-375-15-entries-readonly-sv.png` — `9cec7849e32d993310f1bd25bf80433f1533f4ae9f4441f77d1de0cc3b341d78` (346349 bytes)
- `mobile-375-15-locked-readonly-en.png` — `90687a7ec67541e8b8fa6f4d5df81fb5a54284cd8845bc91d135d16e616e7666` (115164 bytes)
- `mobile-375-15-locked-readonly-sv.png` — `4dbbb9201c77624e4c1289226142643e36b043441c09192d2f5cc148a9e4f34f` (112515 bytes)
- `mobile-375-16-second-assessor-joined-sv.png` — `2d288212afdaada49acfce85a656f4d096d844ec7a697bdfe3acb6d6c9aac1ed` (289733 bytes)
- `mobile-375-16-withheld-en.png` — `94aec35bc081d62f83c690a4db07276b5e5ba34986db19658c2b776c2d399944` (123961 bytes)
- `mobile-375-16-withheld-sv.png` — `52e692ee1c9ad2cb4b54596ccb50f70db0ad68f6ee703089cf2ac256af3a92bb` (120363 bytes)
- `mobile-375-17-revealed-sv.png` — `d1cfaefb0567d29546ec1c07739f76239c3316a23f7bf8e532c369238eb36ba6` (182270 bytes)
- `mobile-375-17-second-documented-sv.png` — `add9443a362f13d9e835c621fbf7530eaa6535005008fe741671df5af85612bd` (307487 bytes)
- `mobile-375-17-second-locked-sv.png` — `d1cfaefb0567d29546ec1c07739f76239c3316a23f7bf8e532c369238eb36ba6` (182270 bytes)
- `mobile-375-18-side-by-side-en.png` — `03c20c75a87f06e69756c962c45089fc7950f894bcdc36cb905ccc94b13a0503` (156947 bytes)
- `mobile-375-18-side-by-side-sv.png` — `56a51f2ca55f5fc740b2ce1c16acdae66d7c66a89441dd67466cdb07aa3bb426` (154322 bytes)
- `mobile-375-19-relocked-sv.png` — `1269496aa77416de6b033e19d0a979dc9411449e46d11ff638a6e940db7fac19` (154326 bytes)
- `mobile-375-19-reopen-refused-sv.png` — `c7158fb17d3f2e1471dc17cc7bf89723b3725d9e4f0821a4c8f54df4ec5aa083` (167203 bytes)
- `mobile-375-19-reopened-sv.png` — `cb229fab9e45389d6f098ecc3a06e414db1198646dcd5f6dbe422347f4ca480e` (356007 bytes)
- `mobile-375-20-outsider-refused-sv.png` — `e002fd064ec7e54d15c4e5a8c09811e897517bdfc14fd81e3677dba637ac8a9c` (2540 bytes)
- `mobile-375-20-panel-refused-sv.png` — `508227a41d2f7e94f6a6ec6f0c48865e10d4475d1e0c217ac6e2d67c44126e78` (158592 bytes)
- `mobile-375-20-panel-resolution-en.png` — `105367ec408f9517159456ca1d124eb97861226e08f057f4d01f1e2896743238` (164145 bytes)
- `mobile-375-20-panel-resolution-sv.png` — `6547addfbf78523e200ae540321cdb122a23136e621467cc48bb62d678b17499` (156551 bytes)
- `mobile-375-20-panel-revealed-sv.png` — `42a0898264c4145b348cf97294781988541ea7ba2be910d47a66b05f20e4369f` (146330 bytes)
- `mobile-375-20-positions-untouched-sv.png` — `9cec7849e32d993310f1bd25bf80433f1533f4ae9f4441f77d1de0cc3b341d78` (346349 bytes)
- `mobile-390-01-overview-module-en.png` — `5de20353c08cffe309c5d96b8bc2e71efa41a3ded1b97be60dc07ab2f22d912f` (216105 bytes)
- `mobile-390-01-overview-module-sv.png` — `bd85218e62eec18fe4fe0d7d72883dd3242571916349295aae0c4fbd8c5ad390` (207568 bytes)
- `mobile-390-02-tool-landing-en.png` — `f194e02a631657f6f627e480d64a70dd97d216c0c7aaf917713c83f82eea1026` (219895 bytes)
- `mobile-390-02-tool-landing-sv.png` — `45b1a21b2137bd45da475fe100cd867433b98c56c2c9c4d0bf0d6f56d4a5b51c` (203977 bytes)
- `mobile-390-03-binding-disclosed-sv.png` — `bb1a8d2bc06f673af9726f086cfcaf410bc237d4be06c16a774091b6831d058d` (241161 bytes)
- `mobile-390-04-snapshot-en.png` — `72092112cbcc0cc953b7df6689911d7a8dcce4153e9cc13608afd430ccbea9ab` (219912 bytes)
- `mobile-390-04-snapshot-sv.png` — `45b1a21b2137bd45da475fe100cd867433b98c56c2c9c4d0bf0d6f56d4a5b51c` (203977 bytes)
- `mobile-390-05-snapshot-readonly-sv.png` — `45b1a21b2137bd45da475fe100cd867433b98c56c2c9c4d0bf0d6f56d4a5b51c` (203977 bytes)
- `mobile-390-06-position-blocked-sv.png` — `232b8957adf503bf1cf806e6ea54d3327fdb18f31dfc6e3bdb3afabece0ec739` (120370 bytes)
- `mobile-390-06-session-open-sv.png` — `144a6b7069d3c2a8d9dc2c3adc5a1d78a2c774441a8d7fe73cb9b9521d5b309d` (271088 bytes)
- `mobile-390-07-themes-en.png` — `96388987e92db8c998a36f9be1ba5b546243c1263e587b4f558b704f52e9eca8` (291728 bytes)
- `mobile-390-07-themes-sv.png` — `144a6b7069d3c2a8d9dc2c3adc5a1d78a2c774441a8d7fe73cb9b9521d5b309d` (271088 bytes)
- `mobile-390-08-entry-form-sv.png` — `0cc4b3e89d8f4dad1f000834aa40986429aa3219fe5c03341356ab86890a5c84` (350783 bytes)
- `mobile-390-08-entry-saved-sv.png` — `5a9e5a8326d452e6e05d86600eafd40e9f3cff3b908a17255469069230f93ee6` (320615 bytes)
- `mobile-390-09-entry-confirmed-sv.png` — `c27cce747922d3ca48627dcb9d717aef27db927c2d89a762ef52ba6ed1e145a9` (346267 bytes)
- `mobile-390-09-entry-refused-sv.png` — `628959e3e146f2695a098c177784d3bf14baf4b85263737b9f106e2609ec76ba` (400422 bytes)
- `mobile-390-10-correction-refused-sv.png` — `efb2d0afdbfc7c6fc147eec8133d1c904ee5b7c371f39a60bb356c6f90b19399` (417217 bytes)
- `mobile-390-10-correction-saved-sv.png` — `1e75461d947a789afa2d81f4403f1451ff0206a785ff1d3cf306aa5916cd56b7` (346187 bytes)
- `mobile-390-11-history-sv.png` — `bad682c971cd3d96b58edb812cb8b84f9bd1f4d7eb3208c975166c3a29b32902` (446910 bytes)
- `mobile-390-12-verification-history-sv.png` — `a657a7ff9e70a5dba4a6865a82e6aea152abeb70d9645439dedc84a2c6268c19` (463229 bytes)
- `mobile-390-12-verification-refused-sv.png` — `20b27eda5f828db142ccda9c22878ca0725e30e21c52add67cc6347a69457502` (361990 bytes)
- `mobile-390-13-not-verified-neutral-en.png` — `cf8ee11f0a950cfa28da2f8174c1f576cddb7958527088e60255f0de35b9c5e0` (377966 bytes)
- `mobile-390-13-not-verified-neutral-sv.png` — `ac163a4fc3443f90e9e5f8eeaba59c6773cb10bbf100b9a1b83bb126a69b4716` (354664 bytes)
- `mobile-390-14-before-lock-sv.png` — `6d78189490d5df49702f4d7cb873a8564b61d7931dde3a7f8db4fc4f8d4aa0ec` (111994 bytes)
- `mobile-390-14-lock-dialog-sv.png` — `f6adb70609815e58df90629bcb618ae86c624dbc65d0fd13eb17d8777598534f` (115117 bytes)
- `mobile-390-14-locked-sv.png` — `20b57fbdb1fddb98b0a654ed147bdd4eff1780f0de53a427b52ac4e97899f7a9` (112381 bytes)
- `mobile-390-15-entries-readonly-sv.png` — `e8779637f9cb84bad01ba7886e767276f66bf0389bc501e0a8b8276767cce9c9` (346525 bytes)
- `mobile-390-15-locked-readonly-en.png` — `dfd0a49f235e1e4e4d0a88dd68dfa5bd3a6f9fe2f25b451d23e59ca79575c367` (114168 bytes)
- `mobile-390-15-locked-readonly-sv.png` — `20b57fbdb1fddb98b0a654ed147bdd4eff1780f0de53a427b52ac4e97899f7a9` (112381 bytes)
- `mobile-390-16-second-assessor-joined-sv.png` — `07bf22fb9481a1b8f184e92f6240643dea0261786a3cad80ba70d70789d4629f` (289492 bytes)
- `mobile-390-16-withheld-en.png` — `5a334a181bd9862904b30f21c8c40249bf3623ce998ff54475027ca1031807f3` (123119 bytes)
- `mobile-390-16-withheld-sv.png` — `232b8957adf503bf1cf806e6ea54d3327fdb18f31dfc6e3bdb3afabece0ec739` (120370 bytes)
- `mobile-390-17-revealed-sv.png` — `53462bdf23771c9b200073f5aec8e553caeb3413704bd40172cf7fe14d1d8582` (182726 bytes)
- `mobile-390-17-second-documented-sv.png` — `21b6625fd3ebcf3e776bdd49abc9353eeaf5dd7e2da250182d4db7026a6d09d6` (307166 bytes)
- `mobile-390-17-second-locked-sv.png` — `53462bdf23771c9b200073f5aec8e553caeb3413704bd40172cf7fe14d1d8582` (182726 bytes)
- `mobile-390-18-side-by-side-en.png` — `8f9d277aeac69ff8bb4be95872fe728b7d75467921bc8b5d96bc5bd280c5776d` (156552 bytes)
- `mobile-390-18-side-by-side-sv.png` — `4a597ef791e17c9071c713229e19edad6ee3579d6aef212ea254342dd6ed21cd` (154413 bytes)
- `mobile-390-19-relocked-sv.png` — `33c524036b9cc58f77e1b2d190ca7f9f97990c83e8d5c763ba8ab4474843dabc` (154621 bytes)
- `mobile-390-19-reopen-refused-sv.png` — `954c85dfd879f3cc2907352f08736ed7446b7978045b5a9a83f5cd7358c3fc9f` (166803 bytes)
- `mobile-390-19-reopened-sv.png` — `ac163a4fc3443f90e9e5f8eeaba59c6773cb10bbf100b9a1b83bb126a69b4716` (354664 bytes)
- `mobile-390-20-outsider-refused-sv.png` — `0712fd74071445afc9b98c41440bfd0b7a0886fc95a1e4e755d8f424c88fc8b1` (2742 bytes)
- `mobile-390-20-panel-refused-sv.png` — `47a40d55b27f098ca082022d541a4d1f41b50c8268dc26082a45d287421f2877` (158857 bytes)
- `mobile-390-20-panel-resolution-en.png` — `d1af3597d18719b9f4b5887bd929ad6c6d214fc03dc5badfab47bdb1506b9867` (164293 bytes)
- `mobile-390-20-panel-resolution-sv.png` — `935d47386dd05cd264bd5b9fea441d9cb67999c01ae83e0ee3e7d8665eb90eb6` (156856 bytes)
- `mobile-390-20-panel-revealed-sv.png` — `0852953ea0c61b509fd3e1233c8a0363bf8dab53fe2b934e6519b8b3301ce306` (146434 bytes)
- `mobile-390-20-positions-untouched-sv.png` — `e8779637f9cb84bad01ba7886e767276f66bf0389bc501e0a8b8276767cce9c9` (346525 bytes)

## Traces (digested, not committed)

- `chromium/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-chromium.zip` — `8d9e162e067fca11be430e3a3917c5ae8689b694086279189680d9de1322ea94` (1885234 bytes)
- `chromium/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-chromium.zip` — `d3dd3392b249db1e04eec4fc9902b5756d88deea1f6904e3dbbcde875040cdaa` (1705996 bytes)
- `chromium/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-chromium.zip` — `ab9b2a531d5762b9bba2f3fedb705a9f771a2266f91fda48c19eceed3c528d3b` (2244484 bytes)
- `chromium/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-chromium.zip` — `da1905da99a4c32dcef21098085478fa5763dee7c9806ea67e9f92fc92745248` (1536127 bytes)
- `chromium/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-chromium.zip` — `c9ce5d4d6fb7d4354815126f7851f5a439cec48b5fbbc3df8fbf82b08591e180` (1774786 bytes)
- `chromium/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-chromium.zip` — `978363f3e3431f72aa13d780d8caa677542ede521e75b634da3866873880aac1` (1482790 bytes)
- `chromium/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-chromium.zip` — `05dbb1c10e741defa149aeac464e15555d2b4d5c3e7e7f6297c077a88d2d308a` (1802109 bytes)
- `chromium/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-chromium.zip` — `0d37ddb5e687bccbf8a42427adca893e67a6fde2ad0954b9ba8ff7ef2c41d59b` (1704578 bytes)
- `chromium/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-chromium.zip` — `bfff0b7f798406432aa2c905bfc2781310e1c296d0e8f12951af46c82d1ae150` (1944997 bytes)
- `chromium/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-chromium.zip` — `82c3d905d8ff80e0e545077213e2cbf2edb3ba3bf176adea2f2c0c08cdd0e73b` (1649564 bytes)
- `chromium/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-chromium.zip` — `e1ea22e0eecc5d450456fb895b24e93cb54a6397e9170b80f58df8fc36f5a127` (2102149 bytes)
- `chromium/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-chromium.zip` — `bd2c7d72acb6f1436ef070011b01b42d2a0d7a5257dc6901678df0c4b13a0bc2` (2081169 bytes)
- `chromium/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-chromium.zip` — `7091d8c51af8d939f7432b42aa71413181df6608c9af098b79840b69a055d2f6` (1878380 bytes)
- `chromium/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-chromium.zip` — `208bad1eb0d88d2b4048a3c03ae37bebea9b29a9dc36a271e248e9c7a54b47ad` (2490050 bytes)
- `chromium/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-chromium.zip` — `1719795e4406aee17ed37c646a18929adcd36450aeb939eb83eb492b2848c0b3` (1749978 bytes)
- `chromium/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-chromium.zip` — `a110ddc601132f4908de8167ca08555c09988d0919acabda7c6d3bca3ce0e76b` (2007626 bytes)
- `chromium/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-chromium.zip` — `4074954edebf7e00b421f4ba26301674f293a2242d05107c8809958bf0f0a663` (1776079 bytes)
- `chromium/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-chromium.zip` — `9774d2665dd1294bb9757f3a300c5baadcebf9fe0d7032fced266cf0f1e2aa62` (2425370 bytes)
- `chromium/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-chromium.zip` — `8d0b7dbf3a27c771005798aad6a25ded6d12b1ec0ba9e51e318445480065eb90` (1489987 bytes)
- `chromium/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-chromium.zip` — `94f71a90b87acdacb3ef2e6d72b008e221429b971cdce480a567e0043666f71d` (4446007 bytes)
- `mobile-375/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-mobile-375.zip` — `b5111ace1e77ecbe851bc17628386e02ee0977f3578cb5daf8e822349464b90a` (2239487 bytes)
- `mobile-375/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-mobile-375.zip` — `eb1c9503110edaee67c14cc04fe1a9f809c6962835d78e1fffe95862fcfe214f` (2103621 bytes)
- `mobile-375/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-mobile-375.zip` — `f4130ffd72ce44086bebcee15e9c9ec6bd21ca1907c24fc422d2b7275b4b1b77` (2470202 bytes)
- `mobile-375/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-mobile-375.zip` — `84ff30acf249bc01f4fcf1897dd8e4a91a034cb4dc21411f997621e9776fc202` (2074637 bytes)
- `mobile-375/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-mobile-375.zip` — `54a5fd35dfc5b1873da0c40bc807a3ce8bb32fc17323a8cc71a04241ce3f92a8` (1887586 bytes)
- `mobile-375/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-mobile-375.zip` — `71d087d8e2f7b5a96a2f60f6119cab3c7dd17e955bbb9c938753e33cb1280ef1` (1637671 bytes)
- `mobile-375/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-mobile-375.zip` — `148f795a2af3bdb18a7b61bec5e7b28bc061005084decfe8166c73a4c0eed188` (2342289 bytes)
- `mobile-375/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-mobile-375.zip` — `db9cf3127bda3109229aa4f45e47215014c16ab3500cf60bdf7cb922d540a7cf` (1834724 bytes)
- `mobile-375/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-mobile-375.zip` — `3cf5756b47c06c45ee9f74657168639ca4af3421484ef5587813c6f8321a1c9f` (2250042 bytes)
- `mobile-375/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-mobile-375.zip` — `8cb94952621df4ff1b70c282b45c8991b07b8a8b95391f3dd6637ad5148aa97a` (1794748 bytes)
- `mobile-375/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-mobile-375.zip` — `70ea92d4e00f33d6d513721dc1018137cfa3fcb28b6eba259af0c9cf608a6cec` (2035162 bytes)
- `mobile-375/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-mobile-375.zip` — `f7cf1a6102409663ce6249ca6a9193b9b1862d8160ad8ae8728b65df1199bb96` (2444166 bytes)
- `mobile-375/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-mobile-375.zip` — `ab11223e40635a18aad2c6a7e13ea91e716626833307ee74303d786505218d5d` (2382505 bytes)
- `mobile-375/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-mobile-375.zip` — `2b5505914767e111a44405b186e8f2c534bbdadc3c47af7687dc8cffe78cf909` (2558017 bytes)
- `mobile-375/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-mobile-375.zip` — `ee1a1d3533d041fc1992427b22f9b12bb11b64bd4128ab47ea4e03d40aab5d1e` (1982837 bytes)
- `mobile-375/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-mobile-375.zip` — `e323708610dfb674961a4f904a50a2ee52019f62859a72c6a7972d91906f04ad` (2593306 bytes)
- `mobile-375/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-mobile-375.zip` — `8f94a52d232d4a0f0bf7a5c156626ad904d01f3a35e5ff873b98c32e40ceeb56` (2102805 bytes)
- `mobile-375/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-mobile-375.zip` — `ea525fa28cf6f3b7ac1c543458ead2d3c402376bcd97327430d747b587217cdb` (2617925 bytes)
- `mobile-375/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-mobile-375.zip` — `c09c1c7b6ad9dce449b221658261d7bd44806b7d5afbce8b5f7a1ef38e598b31` (1556248 bytes)
- `mobile-375/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-mobile-375.zip` — `6c8329cb791a5faf2fd2191b115d4e0e5eb3acf84a54e2cdee343f3030bf30a5` (4881214 bytes)
- `mobile-390/beskt-interview-tool-BESKT-120fb-er-rendered-as-a-conclusion-mobile-390.zip` — `15bd9f8eaab66c02181399e6240ad102becbf88462470a5a3c603997d2e3779c` (2242951 bytes)
- `mobile-390/beskt-interview-tool-BESKT-12f51-s-shown-whole-and-neutrally-mobile-390.zip` — `685aa5f9beaa499a3389ab431079fb0f5c6b4451f8ab461cd97ed5aeeaf3e161` (1976542 bytes)
- `mobile-390/beskt-interview-tool-BESKT-13e1e-y-position-cannot-be-locked-mobile-390.zip` — `a6da697d2fce66a729b7131ba91f6157d651fbe8fdc6e914475215cc4f742a8e` (1941683 bytes)
- `mobile-390/beskt-interview-tool-BESKT-2735a-the-server-has-confirmed-it-mobile-390.zip` — `376723c8232820ebeb9bc57bad729e9cc69af45dba7dce0b6f40e47e86d41154` (2073739 bytes)
- `mobile-390/beskt-interview-tool-BESKT-34791-ide-factually-with-no-total-mobile-390.zip` — `50ff833d5cb36b9bd91e1f47ddce0a616c93812291b068e0d1e4d7713bc0a4a9` (1901168 bytes)
- `mobile-390/beskt-interview-tool-BESKT-378eb--edit-the-candidate-s-words-mobile-390.zip` — `ee367a2901c6429cc2a2d7b27676e94254c3ab916a5b41effb91b5dbe9fcc0dc` (1575101 bytes)
- `mobile-390/beskt-interview-tool-BESKT-43f83-n-and-creates-a-new-version-mobile-390.zip` — `37ca8430eecef2ca394f0dd8963712e5ec8272c228fc2eb42166abc8861dc0f6` (2388194 bytes)
- `mobile-390/beskt-interview-tool-BESKT-486b7-d-names-what-it-is-bound-to-mobile-390.zip` — `1778de237105c2d93f58434a924e9e22b55b8729ae9828a7dc347316298940d7` (1945244 bytes)
- `mobile-390/beskt-interview-tool-BESKT-6a5db-n-and-nothing-is-lost-by-it-mobile-390.zip` — `deb913bcf19df465fc94e9febd5ac32dcc526aa1455c3ab11286fc4d5be9f587` (2108806 bytes)
- `mobile-390/beskt-interview-tool-BESKT-6ff5a--through-a-described-dialog-mobile-390.zip` — `d4618e8cf57155562d19dab00d70a5a498b438440788e631dbdc237db5faec60` (1819643 bytes)
- `mobile-390/beskt-interview-tool-BESKT-773c4--module-gated-by-the-server-mobile-390.zip` — `ff973af05ec06c4540459d4974d8f1c9904d9bd0cb6bf875fce1ea400c49f5ba` (2104055 bytes)
- `mobile-390/beskt-interview-tool-BESKT-8476b-nly-and-shows-its-own-facts-mobile-390.zip` — `a552de9f1a4e5e8e5a63f0593ba782a76f8ff0b59ddeaae173fa10d1f90339f3` (2374813 bytes)
- `mobile-390/beskt-interview-tool-BESKT-8be80-ed-in-eight-separate-fields-mobile-390.zip` — `c42eb807e1bdf060aaeb7676f62a686f6705aaeb5b7bbc054b880ac23899d76a` (2540801 bytes)
- `mobile-390/beskt-interview-tool-BESKT-92673-st-—-not-even-over-the-wire-mobile-390.zip` — `f8c7ba5e321327678271e54f880b2cf021f4118d92002adb2922e2974e6c0ea4` (2282947 bytes)
- `mobile-390/beskt-interview-tool-BESKT-973fd-ir-exact-identity-on-screen-mobile-390.zip` — `cc6a7e680be32f12a12d4f0f3b62ac018c2f0e6aa5cacd82c9ab838a7416023b` (1997705 bytes)
- `mobile-390/beskt-interview-tool-BESKT-9d975-ted-and-the-history-is-kept-mobile-390.zip` — `b361dd43f7d93e64f8f708e77670088485f37bc13d3f162c701eaafda4d00603` (2493379 bytes)
- `mobile-390/beskt-interview-tool-BESKT-b3d46--with-who-wrote-it-and-when-mobile-390.zip` — `01d0ebc587f0adf589636ccb662d6d9b3165373d001f979cae9adc015df3f388` (1547474 bytes)
- `mobile-390/beskt-interview-tool-BESKT-bd849-nd-locks-their-own-position-mobile-390.zip` — `431c258a89cc7a63c92a4ecee94b8681e78aed39148b5691025cd3017a2cb765` (2108525 bytes)
- `mobile-390/beskt-interview-tool-BESKT-e868e-closed-rather-than-asserted-mobile-390.zip` — `12e1bdd7a33da7ea7f7fa6b33bb9b893860ea55a97a071b68f3680c3cc5df04b` (1617231 bytes)
- `mobile-390/beskt-interview-tool-BESKT-f82ca-ent-and-refuses-an-outsider-mobile-390.zip` — `df7b4423ccb66220dc2c7e7d5450d07c09471bfeda293f7cfa29ad0d5a77de5b` (4636405 bytes)
