import { useT } from "@/i18n/context";
import { assessmentMessagePath } from "@/lib/recruitment/assessment-message-path";

export function InvitationMessageBody({ body }: { body: string }) {
  const { t } = useT();
  return (
    <div className="mt-2 whitespace-pre-wrap break-words text-sm">
      {body.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
        const path = assessmentMessagePath(part);
        return path ? (
          <a
            key={index}
            href={path}
            className="inline-flex min-h-11 items-center rounded-md px-2 font-semibold text-accent underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("academy.invitation.open")}
          </a>
        ) : (
          part
        );
      })}
    </div>
  );
}
