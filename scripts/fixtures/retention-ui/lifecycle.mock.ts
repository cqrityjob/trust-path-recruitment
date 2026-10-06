// Synthetic UI seam only. This fixture never imports credentials or a backend.
const job = {
  id: "job",
  archivedAt: null as string | null,
  completedAt: "2026-04-06T10:00:00Z",
  state: "completed",
  canManage: true,
  missingDate: false,
  purgeAt: "2026-10-06T10:00:00Z",
};
const app = {
  id: "app",
  jobId: "job",
  archivedAt: null as string | null,
  recruitmentArchivedAt: null,
  status: "rejected",
};
let months = 6;
const erasures: unknown[] = [];
export const getLifecycleOverview = async () =>
  JSON.parse(
    JSON.stringify({ months, canSetRetention: true, jobs: [job], applications: [app], erasures }),
  );
export const archiveMaterial = async ({
  data,
}: {
  data: { applicationId: string | null; archive: boolean };
}) => {
  (data.applicationId ? app : job).archivedAt = data.archive ? "2026-10-06T12:00:00Z" : null;
};
export const previewErasure = async () => ({
  applications: 2,
  counts: {
    job_applications: 2,
    recruitment_messages: 3,
    scp_interview_reports: 1,
    assessment_assignments: 2,
    job_application_answers: 4,
  },
  files: 2,
  sharedFiles: 1,
  fingerprint: "f".repeat(32),
});
export const requestErasure = async () => {
  erasures.push({
    id: "erasure",
    jobId: "job",
    applicationIds: ["app"],
    completedAt: null,
    rowsDeletedAt: null,
    attempts: 1,
    error: "RETENTION_FILE_DELETE_FAILED",
    pendingFiles: 1,
  });
  return "erasure";
};
export const setEmployerRetention = async ({ data }: { data: { months: number } }) => {
  months = data.months;
};

export const retryErasure = async () => {};
