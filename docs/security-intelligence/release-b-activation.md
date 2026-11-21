# Security Work Release B — activation

Release B works end to end only after the four owner steps below. Until then,
the product is installed but inactive. "Anslut officiell källa" lists no
approved publisher, and "Hämta nu" answers "Hämtning är inte aktiverad". Nothing
is fetched and nothing is billed. No step here activates AI or document
processing. Those stay behind their own activations (see
`processing-activation.md`).

Read-only state of production at 2026-11-21T21:07:43.931516+00:00: 20270328090000 is
**installed and verified** after #500 merged. The 13 function bodies match the
merged source, and the restricted-brief policies and privileges are verified.
See [hosted verification](../release/2026-11-21-security-work-monitoring-hosted-verification.json).
`sw_private.worker_keys` still has **0 active rows**, and no feed host is approved.
Installation has not activated fetching.

## 1. Merge and publish

1. #500 is merged and 20270328090000 is installed. Its read-only verification
   and applied registration are recorded in #501; do not rerun the migration.
2. Merge #502 (20270329090000, the restricted-records and review-acceptance
   fix). The official integration installs it; Claude verifies it read-only and
   records it in #501. #501's schema-first gate stays red until then.
3. Merge #501, then **Publish** in Lovable. Lovable does not publish on merge.

## 2. Worker signing key (once)

The app signs every fetch result with a key that the database checks. Generate
a secret on your own machine and keep it out of chat, tickets and git:

```bash
openssl rand -hex 32
```

In the Supabase SQL editor for project `wrygicdfxwjnrugduxnt`, paste the
secret where shown:

```sql
INSERT INTO sw_private.worker_keys (key_id, secret)
VALUES ('sw-fetch-2026-11', '<the 64-character secret>');
```

In Lovable, add **server-only** environment variables (not `VITE_*`). Then
Publish again:

| Name               | Value                        |
| ------------------ | ---------------------------- |
| `SW_WORKER_KEY_ID` | `sw-fetch-2026-11`           |
| `SW_WORKER_SECRET` | the same 64-character secret |

To revoke the key later, run `UPDATE sw_private.worker_keys SET active = false WHERE key_id = 'sw-fetch-2026-11';`.
Fetching then stops at once.

## 3. Approve a publisher (per official source)

Only hosts in `sw_feed_hosts` can be connected. Choose an official publisher
whose RSS or Atom feed you are allowed to use. Record where its terms are.

Before approving, check that the feed host is **not served through
Cloudflare** (for example `curl -sI https://<host>/ | grep -i '^server:'` does
not say `cloudflare`). The app runs on Cloudflare Workers and connects to the
checked IP address with `cloudflare:sockets`, which Cloudflare documents
cannot reach Cloudflare's own address ranges. Such a host fails closed: the
fetch is refused and coverage shows "misslyckas". Nothing is fetched unpinned.

```sql
INSERT INTO public.sw_feed_hosts (host, publisher, terms_reference, approval_note)
VALUES ('<feed host, lower case, e.g. www.example.se>',
        '<publisher name>',
        '<URL or reference to the publisher''s terms of use>',
        '<who approved it, when, for what>');
```

To withdraw it later, run `UPDATE public.sw_feed_hosts SET active = false WHERE host = '<host>';`.
Fetches from that host stop.

## 4. First supervised fetch

The app server runs on Cloudflare Workers. Each fetch resolves the host
(Node's `dns.lookup`; Cloudflare DNS over HTTPS only if the runtime has no
lookup), refuses any non-public answer, and then connects to the checked
address itself: TLS is verified for the hostname, and the name is never
resolved again, so DNS rebinding cannot redirect the request.

Tested so far:

- controlled DNS and HTTP answers;
- real TLS on 127.0.0.1 under Node;
- locally, the same module inside workerd (pinned wrangler 4.147.0) against
  public hosts:
  - the correct name returned 200;
  - a wrong hostname pinned to a real address was refused at TLS;
  - a self-signed certificate was refused.

Not yet tested: Cloudflare's hosted network. The first fetch below is that
check:

- Coverage turns **aktuell** and new items appear: the integration works.
- Coverage turns **misslyckas** with a reason: send Claude the reason.
  Nothing is retried automatically.

## User test journey (about 10 minutes)

1. Mitt säkerhetsarbete → **Förändringar** → **Anslut officiell källa**. Enter
   the approved feed URL (https) and save. The source shows "aldrig
   kontrollerad".
2. **Hämta nu**. The page reports "N nya poster hämtade" and coverage
   "aktuell".
3. Under Händelser från källorna, open an item. Every relevance point names
   what matched in your operating profile. Lower or raise the relevance
   threshold and watch the count change.
4. **Bedöm påverkan** → write why it matters → **Skapa utkast**. Fill in what
   is known, what is uncertain and the proposed actions → **Spara utkast** →
   **Skicka för granskning**.
5. As a person who may approve: **Godkänn**. As an editor without that right,
   you see "Väntar på en person som får godkänna" instead.
6. **För in**. A risk and its actions are created once; the brief shows the
   Uppföljning section. Open **Till risker och åtgärder** to see them there.
7. **Exportera** downloads the brief with its status, approval and sources.
   **Skriv ut** prints it.
8. When the source later reports more on the same story, the brief shows "Ny
   information sedan godkännandet". **Revidera bedömningen** → submit →
   approve. The old version becomes "Ersatt av en senare version".
