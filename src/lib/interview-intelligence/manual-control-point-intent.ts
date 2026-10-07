/** A repeated submit of the same draft is one intention, including a retry
 * after a lost response. A changed draft is an explicit new intention. */
export class ManualControlPointIntent {
  private readonly operations = new Map<string, string>();

  constructor(private readonly newId: () => string = () => crypto.randomUUID()) {}

  operationIdFor(input: object): string {
    const fingerprint = JSON.stringify(input);
    const existing = this.operations.get(fingerprint);
    if (existing) return existing;
    const id = this.newId();
    this.operations.set(fingerprint, id);
    return id;
  }

  completed(): void {
    this.operations.clear();
  }
}
