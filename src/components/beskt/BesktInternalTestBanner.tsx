// Says, wherever a BESKT method is in use, that it is running under the
// owner's INTERNAL TEST activation — not a reviewed or published method.
// Drawn from the activation record itself, so it cannot disagree with it;
// a failed read draws nothing rather than a false "reviewed".

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n/context";
import { NoticePanel } from "@/components/admin/interview/PackGovernanceUi";
import { listBesktTestActivations } from "@/lib/beskt/internal-test.functions";

export function BesktInternalTestBanner({ methodVersionId }: { readonly methodVersionId: string }) {
  const { t } = useT();
  const listFn = useServerFn(listBesktTestActivations);
  const q = useQuery({
    queryKey: ["beskt", "test-activations", "version", methodVersionId],
    queryFn: () => listFn({ data: { methodVersionId } }),
    enabled: methodVersionId !== "",
    retry: false,
  });
  if (!q.data || q.data.length === 0) return null;
  return (
    <div data-testid="beskt-internal-test-banner">
      <NoticePanel tone="attention" title={t("beskt.internalTest.banner.title")}>
        <p>{t("beskt.internalTest.banner.body")}</p>
      </NoticePanel>
    </div>
  );
}
