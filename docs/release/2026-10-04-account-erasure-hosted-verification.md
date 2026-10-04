# 20270208090000 account erasure with credential metadata: hosted verification

- PR: #416, merged to main as `abbc036e` (head `fbc6e4c3`). Every mandatory CI job was green.
- Independent pre-merge review: PR comment 5977855059. It found no blocking issue.
- Applied by: the official Supabase GitHub integration, on owner project `wrygicdfxwjnrugduxnt`.
- Verified: 2026-10-04 07:56 UTC, read-only, through the Supabase management connector.
  No production write was made and no personal data was read.

## Ledger

|                                                   | Value                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Rows                                              | 370                                                                         |
| Last row                                          | `20270208090000 account_erasure_credential_details`                         |
| md5 of `version:name` joined by newline, all rows | `538769fe5724a0d4561a645d3faf79d6` (equal to `supabase/hosted-ledger.json`) |
| Same over the first 369 rows                      | `01357df572629d745e667d2fedb20ba1` (unchanged)                              |

## Objects

| Object                                                  | Production                         | Strict local replay                 |
| ------------------------------------------------------- | ---------------------------------- | ----------------------------------- |
| `admin_delete_user_if_safe(uuid,text,text)` md5(prosrc) | `e44122cc2ac48d4eaf1519f7847cde65` | equal                               |
| `sp_evidence_extractions_append_only()` md5(prosrc)     | `51ce2c13e5e69429072577eead7b8e47` | equal                               |
| `sp_extractions_append_only()` md5(prosrc), shared      | `f195784ba992176f199734d548be6f43` | unchanged from before the migration |

Triggers:

- `sp_evidence_extractions.sp_extractions_append_only` runs `sp_evidence_extractions_append_only()`.
- `sp_credential_disclosure_policy.sp_credential_policy_immutable` still runs `sp_extractions_append_only()`.
- `sp_credential_share_events.sp_credential_events_immutable` still runs `sp_extractions_append_only()`.

ACLs:

- `admin_delete_user_if_safe` is unchanged: EXECUTE for postgres, authenticated and service_role. There is no anon or PUBLIC grant.
- The new trigger function is SECURITY INVOKER with an empty `search_path`, and EXECUTE is granted to postgres only.

## Not covered here

- Running the erasure on a real account. That is a separate, owner-approved production action performed by the superadmin through the admin UI.
