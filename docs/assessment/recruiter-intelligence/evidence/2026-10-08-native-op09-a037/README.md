# Original native OP09 evidence, a037

This package preserves unmodified public evidence from [run 37774303398](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37774303398), job `113301207464`, artifact `11549931289`. Evidence SHA: `a037191087620fed975fade51e5585a9b604b0bd`; app: `cce2c8a238522d51396b52697d25bc9d54a8a8bd`; schema: `9c8b8159ce5f350c6ace074c917823599d19ce99`.

- `manifest.json` is the exact original artifact file. It records all 387 migration hashes, 44 native SDK checks, four browser cases, all 12 original image hashes, phase populations and teardown.
- `independent-readback.json` is the reviewer's bounded readback, checked against that original manifest and exact Git sources.
- Two original, unedited PNGs are retained here: English desktop after confirmed cleanup and Swedish emulated375 with retained cleanup fence. Their hashes and byte counts match the original manifest. The other ten images and original ZIP remain preserved in the separate private local archive; they are not implied to be included in this two-image package.
- No credentials, actor/state files, private SDK/CLI/SQL logs, raw exceptions, signed URLs or JWTs are included.

The original ZIP SHA256 is `186f803c694fda8f5f3bf25335b56ae54692b05dfc51ad676adf1b0d22c48a33`; original manifest SHA256 is `123b460539bc74f8f74f245d9c95822d1d160d27e4de7cb61e5b5d4ee2f21d12`. The manifest's `bothRaceOrdersObserved=false` remains unchanged: both concurrent attempts observed registration winning, while sequential committed orders were verified separately. Native local logout tests demonstrate Passport live-session denial, not JWT expiry or global logout.

A visible layout limitation remains in the emulated375 image: the supporting-document filename wraps in individual characters in the existing narrow row. The run is ephemeral real GoTrue/Storage integration; it does not prove a published/hosted runtime, polished mobile layout, accessibility conformance or a physical phone.

See [the independent witness](../../2026-10-08-op09-native-actual-witness.md) for phase results, source hashes, original failed-run provenance, zero side-effect readback and remaining release boundaries.
