// Where the report can send the reader. Every link target already exists;
// the report adds no route and no lifecycle transition of its own.
export type TrustReportNav = {
  employerSlug: string;
  /** The application this report was opened from, when it was. */
  applicationId: string | null;
  jobId: string | null;
};

export type TrustReportSubject = {
  /** The candidate as the employer's own application record names them. */
  candidateName: string | null;
  jobTitle: string | null;
};
