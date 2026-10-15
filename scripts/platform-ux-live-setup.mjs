// Synthetic accounts for the task-owned stack. Never accepts a hosted endpoint.
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const root = "/private/tmp/cqrity-platform-ux-20261015";
const status = JSON.parse(fs.readFileSync(`${root}/status.json`, "utf8"));
if (status.API_URL !== "http://127.0.0.1:57721") throw Error("LOCAL_TEST_STACK_REQUIRED");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
if (bucketError) throw bucketError;
if (!buckets.some((bucket) => bucket.id === "job-application-cvs")) {
  const { error } = await admin.storage.createBucket("job-application-cvs", {
    public: false,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["application/pdf"],
  });
  if (error) throw error;
}
const roles = [
  "candidate",
  "candidate2",
  "employer",
  "otherEmployer",
  "colleague",
  "outsider",
  "removed",
  "reviewer",
  "admin",
];
const accounts = fs.existsSync(`${root}/accounts.json`)
  ? JSON.parse(fs.readFileSync(`${root}/accounts.json`, "utf8"))
  : {};
for (const role of roles) {
  if (accounts[role]) continue;
  const password = `LocalUx!${crypto.randomBytes(12).toString("hex")}`;
  const email = `platform-ux-${role.toLowerCase()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `UX ${role}` },
  });
  if (error) throw error;
  accounts[role] = { id: data.user.id, email, password };
  fs.writeFileSync(`${root}/accounts.json`, JSON.stringify(accounts, null, 2), { mode: 0o600 });
}
const employerIds = {
  a: "9e000000-0000-4000-8000-00000000000a",
  b: "9e000000-0000-4000-8000-00000000000b",
};
for (const [role, employer, level, state] of [
  ["employer", "a", "owner", "active"],
  ["otherEmployer", "b", "owner", "active"],
  ["colleague", "a", "member", "active"],
  ["removed", "a", "member", "removed"],
]) {
  const { error } = await admin.from("employer_memberships").upsert(
    {
      user_id: accounts[role].id,
      employer_id: employerIds[employer],
      role: level,
      status: state,
    },
    { onConflict: "user_id,employer_id" },
  );
  if (error) throw error;
}
// The existing job-navigation fixture supplies the public application vacancy.
const { error: navigationMemberError } = await admin.from("employer_memberships").upsert(
  {
    user_id: accounts.employer.id,
    employer_id: "b7100000-0000-4000-8000-000000000001",
    role: "owner",
    status: "active",
  },
  { onConflict: "user_id,employer_id" },
);
if (navigationMemberError) throw navigationMemberError;
// Keep the reviewer least-privileged, including on reruns.
const { error: revokeError } = await admin
  .from("user_roles")
  .delete()
  .eq("user_id", accounts.reviewer.id)
  .eq("role", "admin");
if (revokeError) throw revokeError;
for (const role of ["reviewer", "admin"]) {
  const { error } = await admin
    .from("user_roles")
    .upsert(
      { user_id: accounts[role].id, role: role === "reviewer" ? "passport_verifier" : "admin" },
      { onConflict: "user_id,role" },
    );
  if (error) throw error;
}
console.log(
  `Created ${roles.length} synthetic accounts; two employers; active and removed memberships. Reviewer has only passport_verifier.`,
);
