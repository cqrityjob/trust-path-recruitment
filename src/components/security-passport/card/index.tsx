// Direction registry.
//
// One entry point so every surface — studio, social formats, recipient page
// — renders the same three implementations, and so adding a fourth
// direction cannot accidentally miss a surface.

import type { CardDirection } from "@/lib/security-passport/design/trust-system";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { DirectionA } from "./DirectionA";
import { DirectionB } from "./DirectionB";
import { DirectionC } from "./DirectionC";
import type { CardDirectionProps } from "./useCardContent";

export const DIRECTION_META: Readonly<
  Record<
    CardDirection,
    {
      readonly component: (props: CardDirectionProps) => React.JSX.Element;
      readonly labelKey: PassportCopyKey;
      readonly recommended: boolean;
    }
  >
> = {
  "tenure-crest": {
    component: DirectionA,
    labelKey: "card.direction.tenureCrest",
    recommended: false,
  },
  collectible: {
    component: DirectionB,
    labelKey: "card.direction.collectible",
    recommended: false,
  },
  signature: {
    component: DirectionC,
    labelKey: "card.direction.signature",
    recommended: true,
  },
};

export function PassportCardDirection({
  direction,
  ...props
}: CardDirectionProps & { direction: CardDirection }) {
  const Cmp = DIRECTION_META[direction].component;
  return <Cmp {...props} />;
}

export { DirectionA, DirectionB, DirectionC };
export type { CardDirectionProps };
