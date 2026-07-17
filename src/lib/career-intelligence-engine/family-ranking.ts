// Layer 3 — Career Family ranking.
//
// Importance-weighted mean of member-profession scores. Deterministic
// tie-break: memberCount desc, then familyKey asc.

import type {
  DualScore,
  FamilyRankingEntry,
  TargetVector,
} from "./types";

export function rankFamilies(
  scored: Array<{ target: TargetVector; dual: DualScore }>,
): FamilyRankingEntry[] {
  const byFamily = new Map<
    string,
    {
      sumCurrent: number;
      sumPotential: number;
      count: number;
      members: Array<{ key: string; score: number }>;
    }
  >();

  for (const { target, dual } of scored) {
    const entry = byFamily.get(target.familyKey) ?? {
      sumCurrent: 0,
      sumPotential: 0,
      count: 0,
      members: [],
    };
    entry.sumCurrent += dual.currentFit.displayed;
    entry.sumPotential += dual.potential.displayed;
    entry.count += 1;
    entry.members.push({
      key: target.professionKey,
      score: dual.currentFit.displayed,
    });
    byFamily.set(target.familyKey, entry);
  }

  const list: FamilyRankingEntry[] = [];
  for (const [familyKey, agg] of byFamily.entries()) {
    agg.members.sort(
      (a, b) => b.score - a.score || a.key.localeCompare(b.key),
    );
    list.push({
      familyKey,
      currentFit: agg.count === 0 ? 0 : Math.round(agg.sumCurrent / agg.count),
      potential: agg.count === 0 ? 0 : Math.round(agg.sumPotential / agg.count),
      memberCount: agg.count,
      topProfessionKeys: agg.members.slice(0, 3).map((m) => m.key),
    });
  }

  list.sort(
    (a, b) =>
      b.currentFit - a.currentFit ||
      b.potential - a.potential ||
      b.memberCount - a.memberCount ||
      a.familyKey.localeCompare(b.familyKey),
  );
  return list;
}

// Family-diversity guard on the profession top-N. If all top-N belong to
// the same family, and a next-best other-family match is within `tolerance`
// of the last slot, promote it into that slot. Deterministic.
export function enforceFamilyDiversity(
  ranked: Array<{ target: TargetVector; dual: DualScore }>,
  topN: number,
  tolerance = 5,
): Array<{ target: TargetVector; dual: DualScore }> {
  if (ranked.length <= topN) return ranked;
  const top = ranked.slice(0, topN);
  const rest = ranked.slice(topN);
  const uniqueFamilies = new Set(top.map((r) => r.target.familyKey));
  if (uniqueFamilies.size > 1) return ranked;
  const singleFamily = top[0].target.familyKey;
  const candidate = rest.find(
    (r) => r.target.familyKey !== singleFamily &&
      top[topN - 1].dual.currentFit.displayed - r.dual.currentFit.displayed <= tolerance,
  );
  if (!candidate) return ranked;
  const swapped = [...top.slice(0, topN - 1), candidate];
  const remaining = ranked.filter((r) => !swapped.includes(r));
  return [...swapped, ...remaining];
}
