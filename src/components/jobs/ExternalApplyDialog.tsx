import { ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";

/** Interstitial that warns the user before leaving CQrityjob for an
 * employer's external site. Renders an accessible confirm dialog. */
export function ExternalApplyDialog({
  url,
  employerName,
  label,
}: {
  url: string;
  employerName: string | null;
  label: string;
}) {
  const { t } = useT();
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* ignore malformed URL — surface the raw string */
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="w-full">
          {label}
          <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("jobs.detail.leaving.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("jobs.detail.leaving.body")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("jobs.detail.leaving.destination")}
          </p>
          <p className="mt-1 break-all font-medium">
            {employerName ? `${employerName} — ` : ""}
            {host}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("jobs.detail.leaving.cancel")}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <a href={url} target="_blank" rel="noopener noreferrer nofollow">
              {t("jobs.detail.leaving.continue")}
            </a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}