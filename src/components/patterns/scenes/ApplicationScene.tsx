import { BriefcaseBusiness, FileCheck2, UserRoundCheck } from "lucide-react";
import { ProductScene } from "../ProductScene";

export function ApplicationScene({ caption }: { caption: string }) {
  return (
    <ProductScene caption={caption}>
      <div className="space-y-3">
        {[BriefcaseBusiness, FileCheck2, UserRoundCheck].map((Icon, index) => (
          <div
            key={index}
            className="flex items-center gap-4 rounded-xl border border-black/10 bg-white p-4 shadow-sm"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--cq-ice)] text-[var(--cq-blue)]">
              <Icon className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="h-2.5 w-2/3 rounded-full bg-[var(--cq-navy)]/80" />
              <div className="mt-2 h-2 w-5/6 rounded-full bg-[var(--cq-blue)]/15" />
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--cq-blue)]" />
          </div>
        ))}
      </div>
    </ProductScene>
  );
}
