import type { TranslationKey } from "@/i18n/dictionaries";
import type { ProfessionTransition } from "@/lib/career-center";

// The one sentence a next-profession card, a career-route branch and anything
// else that names a move prints about how its two ends compare — e.g.
// "Mellannivå – en nivå över Väktare." Kept in one place so two surfaces can
// never describe the same move in different words.
//
// Every clause is read from the two guides: the destination's level against
// the origin's (`levelDelta`), whether the destination is a separately
// regulated profession with its own requirements (`kind === "formal_gate"`),
// and whether it asks for more leadership (`leadershipRaised`). None of it is
// a claim about how common the move is or what it takes beyond what the
// destination's own guide states, so it may be printed at either evidence
// level.

/** The derived sentence that says how the subject relates to the other end
 *  of the move, e.g. "Mellannivå – en nivå över Väktare." */
export function connectionText(
  transition: ProfessionTransition,
  t: (key: TranslationKey) => string,
  lang: "sv" | "en",
): string {
  const { from, to, levelDelta } = transition;
  const fromTitle = lang === "sv" ? from.titleSv : from.titleEn;
  const n = Math.abs(levelDelta);
  const relation = (
    levelDelta === 0
      ? t("cc.next.rel.same")
      : levelDelta > 0
        ? t(n === 1 ? "cc.next.rel.up1" : "cc.next.rel.upN")
        : t(n === 1 ? "cc.next.rel.down1" : "cc.next.rel.downN")
  )
    .replace("{n}", String(n))
    .replace("{from}", fromTitle);
  const parts = [
    t("cc.next.levelLine")
      .replace("{level}", t(`cc.level.${to.level}` as TranslationKey))
      .replace("{relation}", relation),
  ];
  if (transition.kind === "formal_gate") parts.push(t("cc.next.regulated"));
  if (transition.kind === "long_term" && transition.leadershipRaised) {
    parts.push(t("cc.next.leadership"));
  }
  return parts.join(" ");
}
