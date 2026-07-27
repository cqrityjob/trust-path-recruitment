# Publishing and versioning

Spec chapters 13.2 and 13.3.

## The rule

No published question, option, scoring key, weight, norm or report template is ever updated in place. Any change creates a new version.

This is enforced by `BEFORE UPDATE` triggers (`scp_guard_published_immutable`, `scp_guard_child_of_published`), which apply to **every** caller — the UI, a server function, a service-role client and raw SQL alike. There is no bypass path, by design (acceptance criterion 8, spec T-004).

Immutability begins at `content_status = 'approved'`, not at `published`. Approving content is the point at which a second person has signed off on it; letting it change afterwards would make the approval meaningless.

Lifecycle columns stay writable so legitimate transitions still work: `content_status`, `validation_status`, `approved_by/at`, `published_by/at`, `retired_at`, `retired_reason`, `content_hash`, `updated_at`, `pilot_stats`.

## Content lifecycle

```
draft ──► in_review ──► approved ──► published ──► retired
  ▲           │
  └───────────┘  (rejected — back to draft, freely editable again)
```

Draft and in-review content is freely editable. That is the point of a draft.

## Separation of duties

| Role | May |
|---|---|
| `editor` | Create and edit drafts within scope |
| `reviewer` | Approve content, scoring rationale and bias review. Cannot silently change an object after approving it. |
| `publisher` | Publish, but only once the required approvals exist |
| platform admin | Technical administration; break-glass is logged |

Roles live in `scp_content_roles`, separate from `public.app_role` (which was left untouched — see the gap analysis for why).

**The two-person principle:** publishing requires at least one `scp_publication_approvals` row recorded by a reviewer who is **not** the publisher. A user may hold several roles, but they cannot satisfy both sides alone. RLS already restricts approval rows to reviewers acting in their own name; the enforcing publish RPC lands in PR-B.

## Version locking

Every assignment pins, before the candidate starts:

- Core assessment version
- Profession module version
- Both form versions
- Scoring version
- Language / adaptation version
- Report version and disclaimer version

`scp_bundle_versions` holds this lineage in one immutable published row (acceptance criterion 7). Retiring a version stops new assignments; assignments already in flight continue against their locked version.

## Content hashes

Every published version gets a SHA-256 hash over its canonical payload. Columns exist on assessment versions, item versions, forms, bundle versions and role-weight profiles; computation lands in PR-B. A hash mismatch at scoring time stops scoring and raises an incident (spec T-018).

## Correcting a serious scoring error

Never by editing the key. Create a new scoring version, run a new scoring run with an explicit reason code, and keep the previous result for audit. Historical results are not silently recalculated.

## Language adaptations

A translation is an adaptation with its own review gate, not a second text column. `scp_item_texts.adaptation_status` runs `adaptation_pending` → `adaptation_reviewed` → `approved`; the authoring language is `source`. Machine translation alone may never reach `approved`. A language cannot be published for a form until every item text in that language is approved (spec T-012).
