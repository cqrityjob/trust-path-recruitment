import { createClient } from "npm:@supabase/supabase-js@2.110.5";
import { runRetentionWorker } from "../_shared/retention-worker.ts";
Deno.serve(async (request: Request) => {
  const token = Deno.env.get("RECRUITMENT_RETENTION_TOKEN");
  if (
    request.method !== "POST" ||
    Deno.env.get("RECRUITMENT_RETENTION_WORKER_ENABLED") !== "true" ||
    !token ||
    token.length < 32 ||
    request.headers.get("authorization") !== `Bearer ${token}`
  )
    return new Response("Not found", { status: 404 });
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  try {
    const counts = await runRetentionWorker(client);
    return Response.json({ ok: counts.failed === 0, ...counts });
  } catch {
    return Response.json({ ok: false, code: "RETENTION_WORKER_FAILED" }, { status: 500 });
  }
});
