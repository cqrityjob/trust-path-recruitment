// One confirmation dialog for the employer workspace.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// A customer sent a screenshot of a browser dialog reading
//
//     trust-path-recruitment.lovable.app säger
//     Är du säker på att du vill stänga den här jobbannonsen? …
//
// window.confirm() puts the hostname above the question, cannot be styled,
// cannot be read by the product's own type scale, and gives a destructive
// action the same "OK" button as a harmless one. It also cannot say what will
// happen -- it gets one string, so the consequence and the question compete
// for the same sentence.
//
// So: the product's own dialog, with the consequence stated separately from
// the question, and a confirm button whose colour and wording match what it
// does. Deliberately generic -- every employer surface that destroys or ends
// something uses this one, because a second confirmation pattern is how the
// two eventually disagree about which button is the dangerous one.

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function ConfirmAction({
  open,
  onOpenChange,
  title,
  /** What will happen, in the employer's words. Separate from the title so a
   *  destructive consequence is never squeezed into the question. */
  consequence,
  confirmLabel,
  cancelLabel,
  /** Destructive gets the destructive colour AND the wording that names the
   *  act ("Ta bort annons"), never a bare "OK". */
  tone = "default",
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "destructive";
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* h-11 on both: 44px. The button default is 40px, which is under the
            practical touch minimum -- and these are the controls that end a
            job, withdraw an assignment or share a candidate's assessment. The
            height is set here rather than per caller so every confirmation in
            the workspace is the same size, which is the same reason there is
            only one of these dialogs. */}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="h-11">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={onConfirm}
            className={cn(
              "h-11",
              tone === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** What the surface is currently asking about, or null when it is not asking.
 *
 *  A single piece of state rather than one boolean per action: two booleans
 *  can both be true, and a list where every row has its own dialog can open
 *  two at once. This carries the row too, so the dialog always describes the
 *  advertisement the button belonged to. */
export type PendingConfirm<K extends string> = { kind: K; id: string } | null;

export function usePendingConfirm<K extends string>() {
  return useState<PendingConfirm<K>>(null);
}
