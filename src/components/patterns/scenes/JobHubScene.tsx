import { BriefcaseBusiness } from "lucide-react";
import { ProductScene } from "../ProductScene";

export function JobHubScene() {
  return <TileScene icon={BriefcaseBusiness} bars={["75%", "52%", "84%"]} />;
}

export function TileScene({
  icon: Icon,
  bars,
}: {
  icon: typeof BriefcaseBusiness;
  bars: string[];
}) {
  return (
    <ProductScene className="h-full">
      <Icon className="h-6 w-6 text-[var(--cq-blue)]" />
      <div className="mt-8 space-y-3">
        {bars.map((width) => (
          <div
            key={width}
            className="h-2.5 rounded-full bg-[var(--cq-blue)]/15"
            style={{ width }}
          />
        ))}
      </div>
    </ProductScene>
  );
}
