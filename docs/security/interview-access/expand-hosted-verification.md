# Expand production verification — 2026-10-03

Owner authorized fixing and merging #404–#406 in the implementation chat.
#404 was merged with a merge commit (no rewritten history):
`dae5c004b9d2d4c1adb74df5a1173d7679c410b7`, from reviewed head
`333d3d1a1ed129d5249d7b3754b703cba80a86ed`.
All seven workflow runs were successful before merge, including
[full CI](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37152693936).

The official Supabase GitHub integration applied the migration. No manual
production DDL or fixture writes were executed. Supabase connector read-only
metadata from explicit project `wrygicdfxwjnrugduxnt` at
`2026-10-03T21:11:18.678365+00:00` is saved in
[evidence/expand-hosted.json](evidence/expand-hosted.json).

- Ledger: 368 rows, ending at `20270206090000_interview_access_expand`.
  All 367 prior version/name identities are unchanged.
- Public RPC `scp_iv_case_capabilities(uuid)`: invoker, empty pinned search path,
  body md5 `3022f4137f432fe0a44f3fc8eca4b060`, authenticated EXECUTE true,
  anon EXECUTE false.
- Private helper `scp_private.case_capabilities(uuid)`: definer, empty pinned
  search path, body md5 `bebbd9f70ccc4b9078fe25235979d5f7`, authenticated EXECUTE
  true, anon EXECUTE false. Both hashes equal the synthetic local replay.
- Existing case gate remains `2571ec0fbacf29e84e4b4a320321c711`.
- `scp_scenario_versions_read` and its existing ALL author policy both require
  `scp_can_author(auth.uid())`; neither admits ordinary candidates/colleagues.
  RLS is enabled, anon cannot SELECT and authenticated cannot write the table.
- Config remains in expand state: legacy authenticated read still allowed,
  RLS enabled, no anon read and no client INSERT/UPDATE/DELETE.
- All five shared catalogue SELECT policies are still `USING (true)` as intended.

This verifies the deployed schema/rules against the tested implementation.
It does not claim a production positive customer journey with a test login.
Local synthetic role/API/actual app-reader proofs remain in the PR stack.

#405 now records this applied state and may proceed through normal CI and merge.
It must then be published and verified before #406 is merged: merging the
contract applies it automatically. The full-config finding is still open during
expand. Publication authorization was separately requested because the owner's
new instruction explicitly authorizes merges while the earlier instruction
prohibited deployment. No Lovable publication has been performed by this task.
