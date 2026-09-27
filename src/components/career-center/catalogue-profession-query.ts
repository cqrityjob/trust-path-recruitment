import { queryOptions } from "@tanstack/react-query";
import {
  getProfessionDetails,
  type ProfessionDetail,
} from "@/lib/career-discovery/profession-detail.functions";

/** The reviewed catalogue content for exactly one CIG profession. Public
 *  (anon RLS: published rows only), so it is not keyed on an account. */
export function catalogueProfessionQuery(cigSlug: string) {
  return queryOptions({
    queryKey: ["career-center", "catalogue-profession", cigSlug],
    queryFn: async (): Promise<ProfessionDetail | null> => {
      const res = await getProfessionDetails({ data: { slugs: [cigSlug] } });
      return res[cigSlug] ?? null;
    },
    staleTime: 10 * 60_000,
    retry: 1,
  });
}
