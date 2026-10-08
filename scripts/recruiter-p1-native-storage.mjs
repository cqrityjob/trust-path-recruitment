// Privileged fixture setup only, after the runner has validated the exact
// GitHub ephemeral loopback target. No bucket or object SQL mutations.
export const CV_BUCKET = "job-application-cvs";

export function storageFailure(operation, result) {
  const safeDiagnostic = {
    operation: ["storage_create_bucket", "storage_get_bucket", "storage_upload"].includes(operation)
      ? operation
      : "unknown",
  };
  const status = Number(result?.error?.statusCode ?? result?.error?.status);
  if (Number.isInteger(status) && status >= 100 && status <= 599) safeDiagnostic.status = status;
  return Object.assign(Error("P1_NATIVE_STORAGE_SETUP_FAILED"), { safeDiagnostic });
}

export async function createNativeCvBucket(admin, freshBucketCount) {
  if (freshBucketCount !== 0) throw Error("P1_NATIVE_FRESH_CV_BUCKET_REQUIRED");
  let created;
  try {
    created = await admin.storage.createBucket(CV_BUCKET, { public: false });
  } catch {
    throw storageFailure("storage_create_bucket");
  }
  // Stop on an unknown result. Never retry a creation or change an existing
  // bucket to make the test pass.
  if (!created || created.error || created.data?.name !== CV_BUCKET)
    throw storageFailure("storage_create_bucket", created);
  let read;
  try {
    read = await admin.storage.getBucket(CV_BUCKET);
  } catch {
    throw storageFailure("storage_get_bucket");
  }
  if (
    !read ||
    read.error ||
    read.data?.id !== CV_BUCKET ||
    read.data.name !== CV_BUCKET ||
    read.data.public !== false ||
    read.data.file_size_limit !== null ||
    read.data.allowed_mime_types !== null
  )
    throw storageFailure("storage_get_bucket", read);
  return { id: CV_BUCKET, public: false, fileSizeLimit: null, allowedMimeTypes: null };
}
