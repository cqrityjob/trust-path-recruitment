/** Optimistic, single-flight persistence for the interviewer's own process
 * reflection and protocol deviations. No candidate assessment is made here. */
export interface SessionProcessRecord {
  readonly id: string;
  readonly updatedAt: string;
  readonly processReflection: string | null;
  readonly protocolDeviations: string | null;
}

export interface SessionProcessDraft {
  readonly processReflection: string;
  readonly protocolDeviations: string;
}

export type SessionProcessWriter = (
  input: SessionProcessDraft & {
    readonly sessionId: string;
    readonly expectedUpdatedAt: string;
  },
) => Promise<{ readonly sessionId: string; readonly updatedAt: string }>;

const fieldsOf = (record: SessionProcessRecord): SessionProcessDraft => ({
  processReflection: record.processReflection ?? "",
  protocolDeviations: record.protocolDeviations ?? "",
});
const equal = (a: SessionProcessDraft, b: SessionProcessDraft) =>
  a.processReflection === b.processReflection && a.protocolDeviations === b.protocolDeviations;
// PostgreSQL versions carry microseconds. Date.parse alone truncates them
// and could treat an older read in the same millisecond as the current one.
const versionTime = (stamp: string) => {
  const fraction = stamp.match(/\.(\d+)(?:Z|[+-]\d\d(?::?\d\d)?)$/)?.[1] ?? "";
  return BigInt(Date.parse(stamp)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3, 6));
};

export class SessionProcessSave {
  readonly sessionId: string;
  draft: SessionProcessDraft;
  saved: SessionProcessDraft;
  updatedAt: string;
  pending = 0;
  error: unknown = null;
  conflict = false;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    record: SessionProcessRecord,
    private readonly write: SessionProcessWriter,
    private readonly changed: () => void = () => undefined,
  ) {
    this.sessionId = record.id;
    this.updatedAt = record.updatedAt;
    this.draft = fieldsOf(record);
    this.saved = this.draft;
  }

  get dirty(): boolean {
    return !equal(this.draft, this.saved);
  }

  edit(fields: Partial<SessionProcessDraft>): void {
    this.draft = { ...this.draft, ...fields };
    this.changed();
  }

  /** Reconcile a read after our own phase/pause write. A refetch must never
   * move an unsaved draft's concurrency token past somebody else's edit. */
  reconcile(record: SessionProcessRecord): void {
    if (record.id !== this.sessionId || this.dirty || this.pending || this.conflict) return;
    if (versionTime(record.updatedAt) <= versionTime(this.updatedAt)) return;
    this.updatedAt = record.updatedAt;
    this.draft = fieldsOf(record);
    this.saved = this.draft;
    this.changed();
  }

  /** Explicitly chosen after a conflict. This is the only operation allowed
   * to replace a local unsaved draft with another tab's stored text. */
  takeStored(record: SessionProcessRecord): void {
    if (record.id !== this.sessionId || this.pending) return;
    this.updatedAt = record.updatedAt;
    this.draft = fieldsOf(record);
    this.saved = this.draft;
    this.error = null;
    this.conflict = false;
    this.changed();
  }

  async flush(): Promise<boolean> {
    if (!this.dirty && !this.pending && !this.conflict) return true;
    this.pending += 1;
    this.changed();
    const run = this.chain.then(async () => {
      if (this.conflict) return false;
      // A guarded pause or completion waits for the current draft, including
      // edits made while a request was in flight. Saving one snapshot is not
      // enough to allow the guard to leave an unsaved newer draft behind.
      while (this.dirty) {
        const fields = this.draft;
        try {
          const result = await this.write({
            sessionId: this.sessionId,
            expectedUpdatedAt: this.updatedAt,
            ...fields,
          });
          this.updatedAt = result.updatedAt;
          this.saved = fields;
          this.error = null;
        } catch (error) {
          this.error = error;
          this.conflict = /SCP_IV_SESSION_PROCESS_STALE/.test(
            error instanceof Error ? error.message : String(error),
          );
          return false;
        }
      }
      return true;
    });
    this.chain = run;
    try {
      return await run;
    } finally {
      this.pending -= 1;
      this.changed();
    }
  }
}
