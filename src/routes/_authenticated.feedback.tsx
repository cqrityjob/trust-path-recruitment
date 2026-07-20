// H3.4B — minimal closed-beta feedback form. Reachable from the site
// footer (visible on every page). Any signed-in user (candidate,
// employer, admin) can submit; submissions are readable only by platform
// admins (see /admin/feedback and beta-feedback.functions.ts).

import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { submitBetaFeedback } from "@/lib/job-intelligence/beta-feedback.functions";

export const Route = createFileRoute("/_authenticated/feedback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Beta feedback — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { t } = useT();
  const submitFn = useServerFn(submitBetaFeedback);
  const [category, setCategory] = useState<"bug" | "idea" | "other">("bug");
  const [message, setMessage] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          category,
          message: message.trim(),
          pagePath: typeof document !== "undefined" ? document.referrer || null : null,
        },
      }),
    onSuccess: () => setMessage(""),
  });

  return (
    <SiteLayout>
      <Section containerClassName="max-w-xl">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("feedback.heading")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("feedback.intro")}</p>

        {submit.isSuccess ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-foreground">{t("feedback.success")}</p>
            <button
              type="button"
              onClick={() => submit.reset()}
              className="text-sm font-medium text-accent hover:underline"
            >
              {t("feedback.sendAnother")}
            </button>
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!message.trim()) return;
              submit.mutate();
            }}
          >
            <div>
              <Label htmlFor="feedback-category">{t("feedback.field.category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger id="feedback-category" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">{t("feedback.category.bug")}</SelectItem>
                  <SelectItem value="idea">{t("feedback.category.idea")}</SelectItem>
                  <SelectItem value="other">{t("feedback.category.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="feedback-message">{t("feedback.field.message")}</Label>
              <Textarea
                id="feedback-message"
                rows={6}
                maxLength={4000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1"
                required
              />
            </div>

            {submit.isError && (
              <p role="alert" className="text-sm text-destructive">
                {t("feedback.error")}
              </p>
            )}

            <PrimaryButton type="submit" disabled={submit.isPending || !message.trim()}>
              {submit.isPending ? t("feedback.submitting") : t("feedback.submit")}
            </PrimaryButton>
          </form>
        )}
      </Section>
    </SiteLayout>
  );
}
