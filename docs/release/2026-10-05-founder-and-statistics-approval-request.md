# Founder designation and statistics display — what is prepared, what needs approval

**Nothing in this document has been run.** It lists the production actions
prepared for ONE joint approval point: the founder designation, the statistics
display and publication. None of them is approved by the work order, and none has
been performed. Everything below was read-only against the hosted project
(`wrygicdfxwjnrugduxnt`) on 2026-10-05.

The founder account's internal id and e-mail address are deliberately **not**
written here: this file is a public review document. They are kept in the
operator's own session and passed to the statement at run time (`<founder-holder-id>`).

## 1. Identity, re-checked read-only before any account-bound action

The target was chosen by its **internal id** and confirmed against two further
facts, never by name or e-mail address alone:

| Check (read-only `select`)                                    | Result              |
| ------------------------------------------------------------- | ------------------- |
| The id matches the profile recorded in the earlier read-only match | yes            |
| The profile's display name                                    | `Mostafa Alshawi`   |
| The account's e-mail local part is the one recorded for the owner | yes             |
| Role                                                          | `superadmin`        |
| Passport profile completed and declared                       | yes / yes           |
| Privacy setting                                               | `full_name`         |
| Work jurisdiction                                             | `SE`                |
| Passport numbers assigned so far / #1 taken / #1 ever retired | 0 / no / no         |

**Two accounts, both the owner's, both kept.** A second completed profile with
the **same display name** exists (role `admin`, a different account). The owner
has confirmed that both accounts are theirs and that both are kept for admin
redundancy and tests, with **no merge, no deletion and no move of merits** between
them:

* the account with the role `superadmin` is the **founder account** and gets Passport #1;
* the account with the role `admin` stays a **separate admin account**, takes no number from this plan, and is left out of
  the statistics by the **existing staff rule** (`user_roles`), so **no extra
  exclusion row is needed**.

A statement that selected by name would have matched both. The designation below
takes the internal id of the `superadmin` account only, and the function itself
refuses anything that is not a `superadmin` with a completed, declared Passport.

No merit, evidence, number or setting was copied between accounts, and none is in
this plan.

## 2. Founder designation (Passport #1 and "Grundare av CQrityjob")

Server-controlled; not tied to a name, a role string typed by a client or any
client input; it changes no merit. Operator-only: the function refuses a
signed-in caller and is executable by `service_role` only.

```sql
-- Run as the operator (service role / SQL editor). One statement.
select public.sp_designate_founder('<founder-holder-id>'::uuid);   -- returns 1
```

The function is idempotent for the same holder, refuses a second founder, refuses
a retired #1 and refuses a holder who already has another number.

**Post-checks (read-only):**

```sql
select passport_number, designation
  from public.sp_passport_numbers
 where holder_user_id = '<founder-holder-id>'::uuid;            -- 1 | founder
select count(*) from public.sp_passport_numbers where designation = 'founder';   -- 1
select count(*) from public.sp_passport_numbers where passport_number = 1;       -- 1
```

Then, signed in as the founder, `/passport/share` shows **Passport #1** and the
line **Grundare av CQrityjob** on the card, and `/s/<id>` and `/og/share/<id>` for
a share they create show the same. The line is a product designation: it takes no
shield and never the gold of a verified credential.

**Reversibility, said plainly:** a number is never reissued. Removing the row
later retires #1 permanently (the retire trigger and the rollback guard both see
to that), so a mistaken designation could not simply be handed to someone else.
That is why the identity check above is the gate.

## 3. Exclusions

**None needed.** Staff accounts (`user_roles`) are excluded from the count without
being listed. The `admin` account is therefore left out of the statistics by the
existing staff rule, and the founder account is the one narrow exception the live
counter makes (`sp_network_counts_holder`). `sp_statistics_exclusions` stays empty.
If test or demo holders that are not staff turn up later, they are added by hand;
none is known to this work.

## 4. Statistics display

Current state: `hidden`; the public read answers `{"display":"hidden"}`. The live
counter on the Passport page shows nothing in that state and never a fake zero.

Two ways to change it, both existing and nothing new:

* **As a signed-in platform administrator** (the function checks `auth.uid()`):

  ```sql
  select public.sp_set_network_stats_display('passport_page',
         'Shown on the Passport page by owner approval 2026-10-05.');
  ```

* **As the operator** (service role has `UPDATE` on the policy row; the function
  needs a signed-in caller, so the operator updates the row directly and leaves
  `changed_by` empty):

  ```sql
  update public.sp_network_stats_policy
     set display = 'passport_page',
         note = 'Shown on the Passport page by owner approval 2026-10-05.',
         changed_at = now()
   where singleton;
  ```

`passport_page` shows the figures on the Passport page only; `public` would also
show them on the homepage and is **not** proposed. Per-market figures stay behind
the privacy threshold of five. Returning to `hidden` is the same statement with
`'hidden'` and takes effect on the next read (the page re-reads about once a
minute, on focus and when a Passport write invalidates it).

**Post-check:** `select public.sp_network_stats();` returns the figures with
`"display":"passport_page"`; with only the founder counted, expect `passports: 1`
and no per-market breakdown (below the threshold).

## 5. Publication

Merging the application PR makes the new share screen and the personal preview
image available; it publishes no post and shows no statistic. A real social post
is only ever made by a holder, in their own LinkedIn share box; nothing here
posts anything or contacts any external service.

## 6. Order

1. Merge the application PR (owner).
2. Re-run the identity read in section 1 (operator, read-only).
3. Founder designation, then its post-checks.
4. External tests on the HTTPS test environment (see the personal-share note):
   LinkedIn Post Inspector, the real share box, a real phone.
5. Statistics display, then its post-check.
6. Publication.

Steps 3, 5 and 6 each need the owner's explicit approval; the work order approved
none of them.
