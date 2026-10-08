/** Withdrawal is the durable access decision; deleting bytes is a separate,
 * retryable operation. A Storage failure must never restore withdrawn access. */
export interface WithdrawEvidenceResult {
  readonly accessWithdrawn: true;
  readonly fileDeletion: "confirmed" | "pending";
}

export async function withdrawAndDeleteEvidence(input: {
  readonly withdraw: () => Promise<void>;
  readonly remove: () => Promise<{ readonly deleted: boolean; readonly failed: boolean }>;
  readonly confirmMissing: () => Promise<boolean>;
}): Promise<WithdrawEvidenceResult> {
  // Failures here are not reported as a successful withdrawal.
  await input.withdraw();
  try {
    const result = await input.remove();
    if (!result.failed && (result.deleted || (await input.confirmMissing()))) {
      return { accessWithdrawn: true, fileDeletion: "confirmed" };
    }
  } catch {
    // The holder can retry after a network or Storage service failure.
  }
  return { accessWithdrawn: true, fileDeletion: "pending" };
}
