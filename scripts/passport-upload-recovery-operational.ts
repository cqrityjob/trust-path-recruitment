/** Actual isolated GoTrue/Storage probe, exported for the owned CI runner.
 * No admin account creation, application fixture/schema SQL, mail or worker.
 * Never call against hosted Supabase. Results contain labels only, no tokens,
 * keys, object paths, document bytes or bearer URLs. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import type { Database } from "../src/integrations/supabase/database";
import {
  cleanupOwnedUpload,
  listOwnedUploadAttempts,
  resumeOwnedUpload,
  uploadRecoverableEvidence,
} from "../src/lib/security-passport/evidence-upload-recovery-adapter.functions";
import { orNull } from "../src/lib/security-passport/rpc";

export async function verifyIsolatedUploadRecovery(input: {
  readonly apiUrl: string;
  readonly publicAnonKey: string;
  readonly owner: SupabaseClient<Database>;
  readonly otherHolder: SupabaseClient<Database>;
  readonly ownerId: string;
  readonly claimId: string;
}): Promise<{
  readonly checks: readonly string[];
  readonly completed: number;
  readonly kind: "actual_gotrue_storage_sdk";
}> {
  const url = new URL(input.apiUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    !["", "/"].includes(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error("OP09_PROBE_REQUIRES_ISOLATED_LOOPBACK");
  for (const client of [input.owner, input.otherHolder]) {
    if (
      new URL(String(Reflect.get(client, "supabaseUrl"))).origin !== url.origin
    )
      throw new Error("OP09_PROBE_CLIENT_TARGET_MISMATCH");
  }
  // Local CLI supplies an anon JWT; reject any privileged key before making
  // calls. A hosted publishable key is deliberately not accepted by this probe.
  let keyRole: unknown;
  try {
    keyRole = JSON.parse(
      Buffer.from(input.publicAnonKey.split(".")[1], "base64url").toString(),
    ).role;
  } catch {
    /* fixed failure below */
  }
  if (keyRole !== "anon") throw new Error("OP09_PROBE_REQUIRES_ANON_KEY");
  const actor = await input.owner.auth.getUser();
  const other = await input.otherHolder.auth.getUser();
  if (
    actor.error ||
    actor.data.user?.id !== input.ownerId ||
    other.error ||
    !other.data.user ||
    other.data.user.id === input.ownerId ||
    !actor.data.user.email?.endsWith(".invalid") ||
    !other.data.user.email?.endsWith(".invalid")
  )
    throw new Error("OP09_PROBE_REQUIRES_TWO_REAL_AUTH_HOLDERS");
  const session = await input.owner.auth.getSession();
  if (session.error || !session.data.session?.access_token)
    throw new Error("OP09_PROBE_REQUIRES_REAL_OWNER_SESSION");
  const token = session.data.session.access_token;
  const checks: string[] = [];
  const check = (pass: unknown, label: string) => {
    if (pass !== true) throw new Error(`OP09_ASSERTION_FAILED:${label}`);
    checks.push(label);
  };
  const make = (
    mode: "normal" | "lose_upload_reply" | "fail_cleanup" = "normal",
  ) =>
    createClient<Database>(url.origin, input.publicAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: async (raw, init) => {
          const target = new URL(
            typeof raw === "string"
              ? raw
              : raw instanceof URL
                ? raw.href
                : raw.url,
          );
          if (target.origin !== url.origin)
            throw new Error("OP09_PROBE_FETCH_TARGET_MISMATCH");
          if (
            mode === "fail_cleanup" &&
            target.pathname === "/storage/v1/object/passport-evidence" &&
            init?.method === "DELETE"
          )
            throw new Error("OP09_SYNTHETIC_CLEANUP_TRANSPORT_FAILURE");
          const response = await fetch(raw, init);
          if (
            mode === "lose_upload_reply" &&
            target.pathname.startsWith(
              "/storage/v1/object/passport-evidence/",
            ) &&
            init?.method === "POST" &&
            response.ok
          )
            throw new Error("OP09_SYNTHETIC_UPLOAD_RESPONSE_LOSS");
          return response;
        },
      },
    });
  const bytes = Buffer.from("%PDF-1.4\n% ri-op09 synthetic only\n%%EOF\n");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const journal = async (id: string) => {
    const r = await input.owner.rpc("sp_begin_evidence_upload", {
      _attempt_id: id,
      _claim_id: input.claimId,
      _period_id: null,
      _file_name: "op09-synthetic.pdf",
      _mime_type: "application/pdf",
      _size_bytes: bytes.length,
      _sha256: hash,
    });
    check(!r.error, "begin_own_journal");
  };
  const path = (id: string) => `${input.ownerId}/${id}.pdf`;
  const upload = async (id: string) => {
    const r = await input.owner.storage
      .from("passport-evidence")
      .upload(path(id), bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    check(!r.error, "actual_owner_storage_upload");
  };
  const attach = (id: string) =>
    input.owner.rpc("sp_attach_evidence", {
      _claim_id: input.claimId,
      _period_id: orNull<string>(null),
      _storage_path: path(id),
      _file_name: "op09-synthetic.pdf",
      _mime_type: "application/pdf",
      _size_bytes: bytes.length,
      _sha256: hash,
    });
  const owner = { supabase: input.owner, userId: input.ownerId };
  const reloaded = () => ({ supabase: make(), userId: input.ownerId });

  const lost = randomUUID();
  const uncertain = await uploadRecoverableEvidence({
    ...owner,
    supabase: make("lose_upload_reply"),
    attemptId: lost,
    claimId: input.claimId,
    periodId: null,
    fileName: "op09-synthetic.pdf",
    mimeType: "application/pdf",
    bytes,
    sha256: hash,
  });
  check(
    uncertain.status === "outcome_unknown",
    "lost_actual_storage_reply_unknown",
  );
  check(
    (
      await listOwnedUploadAttempts(reloaded(), {
        claimId: input.claimId,
        periodId: null,
      })
    ).some((a) => a.id === lost && a.status === "prepared"),
    "fresh_client_reload_retains_intent",
  );
  const saved = await resumeOwnedUpload(reloaded(), lost);
  check(saved.status === "registered", "fresh_client_explicit_resume");
  const repeat = await resumeOwnedUpload(reloaded(), lost);
  check(
    repeat.status === "registered" &&
      saved.status === "registered" &&
      repeat.evidence.id === saved.evidence.id,
    "resume_same_record_idempotent",
  );
  const count = await input.owner
    .from("sp_evidence")
    .select("id", { count: "exact" })
    .eq("storage_path", path(lost));
  check(!count.error && count.count === 1, "exactly_one_metadata_row");

  const ownOnly = await input.otherHolder.rpc("sp_reconcile_evidence_upload", {
    _attempt_id: lost,
  });
  check(
    ownOnly.error?.code === "42501",
    "other_holder_direct_reconcile_denied",
  );
  const otherCleanup = await input.otherHolder.rpc(
    "sp_authorize_evidence_upload_cleanup",
    {
      _attempt_id: lost,
    },
  );
  check(
    otherCleanup.error?.code === "42501",
    "other_holder_direct_cleanup_denied",
  );
  const otherRead = await input.otherHolder.storage
    .from("passport-evidence")
    .download(path(lost));
  check(!!otherRead.error, "other_holder_original_bytes_denied");

  const pending = randomUUID();
  await journal(pending);
  await upload(pending);
  const failed = await cleanupOwnedUpload(
    { ...owner, supabase: make("fail_cleanup") },
    pending,
  );
  check(
    failed.status === "unknown" || failed.status === "cleanup_pending",
    "actual_fence_cleanup_transport_failure_retained",
  );
  check(
    (
      await listOwnedUploadAttempts(reloaded(), {
        claimId: input.claimId,
        periodId: null,
      })
    ).some((a) => a.id === pending && a.status === "cleanup_pending"),
    "fresh_client_reload_retains_cleanup_fence",
  );
  const late = await attach(pending);
  check(
    late.error?.code === "23514" &&
      late.error.message.includes("SP_UPLOAD_CLEANUP_FENCED"),
    "actual_late_attach_after_fence_refused",
  );
  const lateWrite = await input.owner.storage
    .from("passport-evidence")
    .upload(path(pending), bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  check(!!lateWrite.error, "actual_late_storage_upsert_after_fence_refused");
  check(
    (await cleanupOwnedUpload(reloaded(), pending)).status === "cleaned",
    "fresh_client_explicit_cleanup_retry_confirmed",
  );
  check(
    (await cleanupOwnedUpload(reloaded(), pending)).status === "cleaned",
    "cleanup_repeat_idempotent",
  );
  const absent = await input.owner.storage
    .from("passport-evidence")
    .download(path(pending));
  check(!!absent.error, "actual_cleaned_object_not_downloadable");

  // The opposite committed order: registration wins, then cleanup must return
  // the registered record without removing its actual downloaded bytes.
  const registered = await cleanupOwnedUpload(reloaded(), lost);
  check(
    registered.status === "registered",
    "registration_wins_fence_preserves_record",
  );
  const still = await input.owner.storage
    .from("passport-evidence")
    .download(path(lost));
  check(
    !still.error &&
      !!still.data &&
      createHash("sha256")
        .update(Buffer.from(await still.data.arrayBuffer()))
        .digest("hex") === hash,
    "registered_actual_bytes_unchanged",
  );
  if (saved.status === "registered") {
    const withdrawal = await input.owner.rpc("sp_withdraw_evidence", {
      _evidence_id: saved.evidence.id,
    });
    check(!withdrawal.error, "existing_withdraw_rpc_preserved");
    const withdrawn = await cleanupOwnedUpload(reloaded(), lost);
    check(
      withdrawn.status === "registered" &&
        withdrawn.evidence.lifecycleState === "withdrawn",
      "withdrawn_record_never_orphan_cleanup",
    );
  }
  const altered = randomUUID();
  await journal(altered);
  await upload(altered);
  const changed = await input.owner.storage
    .from("passport-evidence")
    .upload(path(altered), Buffer.from("changed synthetic bytes"), {
      contentType: "application/pdf",
      upsert: true,
    });
  check(!changed.error, "prepared_own_bytes_change_for_integrity_probe");
  check(
    (await resumeOwnedUpload(reloaded(), altered)).status ===
      "integrity_mismatch",
    "actual_altered_bytes_never_registered",
  );
  check(
    (await cleanupOwnedUpload(reloaded(), altered)).status === "cleaned",
    "altered_unregistered_bytes_explicit_cleanup",
  );
  for (let round = 0; round < 2; round++) {
    const racing = randomUUID();
    await journal(racing);
    await upload(racing);
    const [attached, cleared] = await Promise.all([
      attach(racing),
      cleanupOwnedUpload(reloaded(), racing),
    ]);
    if (!attached.error) {
      check(
        cleared.status === "registered",
        "concurrent_registration_won_cleanup_preserved",
      );
      const present = await input.owner.storage
        .from("passport-evidence")
        .download(path(racing));
      check(
        !present.error && !!present.data,
        "concurrent_registered_original_bytes_survive",
      );
    } else {
      check(
        attached.error.code === "23514" &&
          attached.error.message.includes("SP_UPLOAD_CLEANUP_FENCED") &&
          cleared.status === "cleaned",
        "concurrent_cleanup_won_late_attach_denied",
      );
      const gone = await input.owner.storage
        .from("passport-evidence")
        .download(path(racing));
      check(!!gone.error, "concurrent_unregistered_cleanup_absence");
    }
  }
  // This must be a dedicated holder session after all other probes. GoTrue
  // logout revokes its session/refresh token; its already-issued JWT may still
  // verify until TTL. Passport's live-session guard must fence that replay.
  const logout = await input.owner.auth.signOut({ scope: "local" });
  check(!logout.error, "actual_gotrue_local_session_logout");
  const replay = make();
  const active = await replay.rpc("sp_passport_session_active");
  check(
    !active.error && active.data === false,
    "replayed_jwt_live_session_inactive",
  );
  const forbiddenRead = await replay.rpc("sp_reconcile_evidence_upload", {
    _attempt_id: lost,
  });
  check(
    forbiddenRead.error?.code === "42501",
    "revoked_session_direct_reconcile_denied",
  );
  const forbiddenFence = await replay.rpc(
    "sp_authorize_evidence_upload_cleanup",
    {
      _attempt_id: lost,
    },
  );
  check(
    forbiddenFence.error?.code === "42501",
    "revoked_session_direct_cleanup_denied",
  );
  const forbiddenConfirm = await replay.rpc(
    "sp_confirm_evidence_upload_cleanup",
    {
      _attempt_id: pending,
    },
  );
  check(
    forbiddenConfirm.error?.code === "42501",
    "revoked_session_direct_confirm_denied",
  );
  const forbiddenBegin = await replay.rpc("sp_begin_evidence_upload", {
    _attempt_id: randomUUID(),
    _claim_id: input.claimId,
    _period_id: null,
    _file_name: "op09-synthetic.pdf",
    _mime_type: "application/pdf",
    _size_bytes: bytes.length,
    _sha256: hash,
  });
  check(
    forbiddenBegin.error?.code === "42501",
    "revoked_session_direct_begin_denied",
  );
  let deniedList = false;
  try {
    await listOwnedUploadAttempts(
      { supabase: replay, userId: input.ownerId },
      { claimId: null, periodId: null },
    );
  } catch {
    deniedList = true;
  }
  check(deniedList, "revoked_session_cannot_claim_empty_attempt_list");
  const noCleanup = await cleanupOwnedUpload(
    { supabase: replay, userId: input.ownerId },
    pending,
  );
  check(
    noCleanup.status === "unknown",
    "revoked_session_never_claims_cleanup_confirmed",
  );
  const noResume = await resumeOwnedUpload(
    { supabase: replay, userId: input.ownerId },
    lost,
  );
  check(
    noResume.status === "unknown",
    "revoked_session_never_resumes_attachment",
  );
  const noBytes = await replay.storage
    .from("passport-evidence")
    .download(path(lost));
  check(!!noBytes.error, "revoked_session_original_bytes_denied");
  return {
    checks,
    completed: checks.length,
    kind: "actual_gotrue_storage_sdk",
  };
}
