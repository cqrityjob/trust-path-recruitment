# Security Work Release B — activation

Release B works end to end only after the four owner steps below. Until then,
the product is installed but inactive. "Anslut officiell källa" lists no
approved publisher, and "Hämta nu" answers "Hämtning är inte aktiverad". Nothing
is fetched and nothing is billed. No step here activates AI or document
processing. Those stay behind their own activations (see
`processing-activation.md`).

Read-only state of production at 2026-11-22T09:40:17Z: 20270328090000 and
20270329090000 are **installed and verified**. 20270329 was installed after #502
merged; all 15 functions, 27 policies, triggers, columns and constraints match
the merged source, and the 408-row ledger keeps every earlier entry. See
[monitoring](../release/2026-11-21-security-work-monitoring-hosted-verification.json)
and [restricted records](../release/2026-11-22-security-work-restricted-records-hosted-verification.json).
`sw_private.worker_keys` still has **0 active rows**, and no feed host is approved.
Installation has not activated fetching.

## 1. Merge and publish

1. #500 is merged and 20270328090000 is installed. Its read-only verification
   and applied registration are recorded in #501; do not rerun the migration.
2. #502 is merged and 20270329090000 (restricted records, review acceptance,
   durable audit and report scope) is installed. Its read-only verification is
   recorded in #501; do not rerun the migration.
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

One deadline (10 seconds) covers DNS, the connection, TLS, every redirect and
the body. "Hämta nu" always ends with a result or a failure in words, with what
to do next. A response whose framing or feed cannot be read is a failed check
("misslyckas"), never "nothing new".

Tested so far (all controlled, none of it hosted evidence):

- controlled DNS and HTTP answers (`scripts/security-work-release-b-check.ts`),
  including hostile chunk framing, header limits and malformed feeds;
- real TLS on 127.0.0.1 under Node (`scripts/security-work-pinned-https-check.ts`):
  hostname and certificate checks, a stalled handshake, a stalled body, an
  already-cancelled request, a close before the handshake, and the whole fetch
  ending at its deadline;
- the same module inside workerd, the Workers runtime (pinned wrangler
  4.147.0, `scripts/security-work-pinned-https-workerd.ts`, in CI), against
  local servers with a throwaway CA: a pinned request succeeds and the feed
  parses; the same server refuses a different hostname and an untrusted
  certificate; stalls end at the deadline; hostile framing and a malformed
  feed are refused.

Known limits, both failing closed:

- **Cloudflare-served feed hosts** cannot be reached (step 3).
- **The TLS hostname option.** Pinning relies on `startTls({ expectedServerHostname })`.
  workerd accepts it today and verifies the certificate against that name, but
  Cloudflare does not document the option publicly and can switch the runtime
  to reject it. If that happens, every fetch fails with "Hämtning är inte
  tillgänglig i den här miljön" and nothing is fetched; it never falls back to
  an unpinned request. Report it to Claude.

Not yet tested: Cloudflare's hosted network. Do not treat hosted fetching as
working until this first supervised fetch has succeeded:

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
