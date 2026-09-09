const TOKEN_RE = /^[0-9a-f]{64}$/;
function siteOrigin(): string {
  const fallback = "https://trust-path-recruitment.lovable.app";
  try {
    const parsed = new URL(Deno.env.get("PUBLIC_SITE_URL") ?? fallback);
    return parsed.protocol === "https:" ? parsed.origin : fallback;
  } catch {
    return fallback;
  }
}
const SITE_ORIGIN = siteOrigin();
const POST_URL = `${SITE_ORIGIN.replace(/\/+$/, "")}/p/handoff`;

const securityHeaders = (contentType: string, nonce?: string): HeadersInit => ({
  "Content-Type": contentType,
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": `default-src 'none'; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; connect-src 'self'; form-action ${SITE_ORIGIN}; base-uri 'none'; frame-ancestors 'none'`,
});

function entryPage(): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const html = `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="viewport" content="width=device-width"><title>Öppnar Security Passport</title><body><p id="s">Öppnar den privata delningen…</p><script nonce="${nonce}">
const status=document.getElementById('s');
const token=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
if(!/^[0-9a-f]{64}$/.test(token)){status.textContent='Delningen är inte tillgänglig.';}else{fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})}).then(async r=>{if(!r.ok)throw new Error();const x=await r.json();if(!/^[0-9a-f]{64}$/.test(x.handoff))throw new Error();const f=document.createElement('form');f.method='POST';f.action=${JSON.stringify(POST_URL)};const i=document.createElement('input');i.type='hidden';i.name='handoff';i.value=x.handoff;f.append(i);document.body.append(f);f.submit();}).catch(()=>{status.textContent='Delningen är inte tillgänglig.';});}
</script></body></html>`;
  return new Response(html, { headers: securityHeaders("text/html; charset=utf-8", nonce) });
}

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function issue(token: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return null;
  const handoff = randomHex();
  const headers: Record<string, string> = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.Authorization = `Bearer ${secret}`;
  try {
    const response = await fetch(`${url}/rest/v1/rpc/sp_share_gateway_issue`, {
      method: "POST",
      headers,
      body: JSON.stringify({ _token: token, _handoff_hash: await sha256(handoff) }),
    });
    return response.ok && (await response.json()) === true ? handoff : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "GET") return entryPage();
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: securityHeaders("text/plain") });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 1024) {
    return new Response(JSON.stringify({ status: "unavailable" }), {
      status: 404,
      headers: securityHeaders("application/json; charset=utf-8"),
    });
  }
  let token = "";
  try {
    token = (await request.json())?.token ?? "";
  } catch {
    /* fail closed */
  }
  const handoff = TOKEN_RE.test(token) ? await issue(token) : null;
  return new Response(JSON.stringify(handoff ? { handoff } : { status: "unavailable" }), {
    status: handoff ? 200 : 404,
    headers: securityHeaders("application/json; charset=utf-8"),
  });
});
