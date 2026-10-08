/** A selected requirement citation is saved briefing material. It is distinct
 * from a separately attached CV and from confirmed interview evidence. */
export function countApplicationSourceReferences(
  sources: readonly {
    readonly kind: string;
    readonly passages: readonly { readonly index: number; readonly content: string }[];
  }[],
): number {
  return sources.filter((source) => {
    if (source.kind !== "employer_requirements") return false;
    try {
      const selected: unknown = JSON.parse(
        [...source.passages]
          .sort((a, b) => a.index - b.index)
          .map((p) => p.content)
          .join(""),
      );
      if (typeof selected !== "object" || selected === null || !("source" in selected))
        return false;
      const reference = selected.source;
      return (
        typeof reference === "object" &&
        reference !== null &&
        "kind" in reference &&
        (reference.kind === "application_answer" || reference.kind === "application_cv")
      );
    } catch {
      return false;
    }
  }).length;
}
