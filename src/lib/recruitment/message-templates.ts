// Starting points for a message to a candidate. Every one is an editable
// draft: nothing here is ever sent without a person reading it and pressing
// send.
//
// What a template may NOT say mirrors send-application-status-email.server.ts:
// no score, no assessment content, and no reason for a decision -- a rejection
// that explains itself with test results would be the product arguing the
// employer's case. The rejection says the organisation went ahead with other
// candidates, and stops.

export type MessageKind =
  | "general"
  | "interview_invitation"
  | "rejection"
  | "offer"
  | "information";
export const MESSAGE_KINDS: readonly MessageKind[] = [
  "interview_invitation",
  "rejection",
  "offer",
  "information",
  "general",
];

export type BookingForTemplate = {
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  locationKind: "onsite" | "video" | "phone";
  locationText: string | null;
  meetingUrl: string | null;
  interviewerNames: string | null;
};

export type TemplateInput = {
  kind: MessageKind;
  language: "sv" | "en";
  candidateName: string | null;
  employerName: string;
  jobTitle: string;
  booking?: BookingForTemplate | null;
};

/** "tisdag 6 oktober 2026 kl. 14:00–14:45 (Europe/Stockholm)", in the
 *  booking's own zone, so the time is the same whoever reads it. */
export function formatBookingWhen(b: BookingForTemplate, language: "sv" | "en"): string {
  const start = new Date(b.startsAt);
  const end = new Date(start.getTime() + b.durationMinutes * 60_000);
  const locale = language === "sv" ? "sv-SE" : "en-GB";
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: b.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: b.timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const at = language === "sv" ? "kl." : "at";
  return `${day} ${at} ${time.format(start)}–${time.format(end)} (${b.timezone})`;
}

export function formatBookingWhere(b: BookingForTemplate, language: "sv" | "en"): string {
  if (b.locationKind === "video") {
    return (language === "sv" ? "Videomöte: " : "Video meeting: ") + (b.meetingUrl ?? "");
  }
  if (b.locationKind === "phone") {
    return language === "sv"
      ? "Telefon – vi ringer dig på det nummer du angav i ansökan."
      : "Telephone – we will call you on the number in your application.";
  }
  return (language === "sv" ? "Plats: " : "Location: ") + (b.locationText ?? "");
}

export function messageTemplate(input: TemplateInput): { subject: string; body: string } {
  const sv = input.language === "sv";
  const hello = input.candidateName
    ? `${sv ? "Hej" : "Hello"} ${input.candidateName},`
    : sv
      ? "Hej,"
      : "Hello,";
  const regards = sv
    ? `Vänliga hälsningar\n${input.employerName}`
    : `Kind regards\n${input.employerName}`;

  switch (input.kind) {
    case "interview_invitation": {
      const b = input.booking;
      const details = b
        ? [
            `${sv ? "När" : "When"}: ${formatBookingWhen(b, input.language)}`,
            formatBookingWhere(b, input.language),
            b.interviewerNames
              ? `${sv ? "Du träffar" : "You will meet"}: ${b.interviewerNames}`
              : null,
          ]
            .filter(Boolean)
            .join("\n")
        : sv
          ? "[Ange tid, plats eller länk]"
          : "[Add time, place or link]";
      return {
        subject: sv
          ? `Inbjudan till intervju – ${input.jobTitle}`
          : `Invitation to interview – ${input.jobTitle}`,
        body: [
          hello,
          sv
            ? `Tack för din ansökan till tjänsten ${input.jobTitle}. Vi vill gärna träffa dig för en intervju.`
            : `Thank you for applying for ${input.jobTitle}. We would like to meet you for an interview.`,
          details,
          sv
            ? "Bekräfta eller avböj tiden under Mina ansökningar i CQrityjob. Passar tiden inte, svara så hittar vi en annan."
            : "Please confirm or decline the time under My applications in CQrityjob. If it does not suit you, let us know and we will find another.",
          regards,
        ].join("\n\n"),
      };
    }
    case "rejection":
      return {
        subject: sv
          ? `Besked om din ansökan – ${input.jobTitle}`
          : `About your application – ${input.jobTitle}`,
        body: [
          hello,
          sv
            ? `Tack för ditt intresse för tjänsten ${input.jobTitle} och för tiden du lade på din ansökan.`
            : `Thank you for your interest in ${input.jobTitle} and for the time you put into your application.`,
          sv
            ? "Vi har nu valt att gå vidare med andra kandidater i den här rekryteringen."
            : "We have now decided to proceed with other candidates in this recruitment.",
          sv
            ? "Ditt Security Passport och din profil i CQrityjob är fortfarande dina och påverkas inte av det här beskedet."
            : "Your Security Passport and your CQrityjob profile remain yours and are not affected by this decision.",
          regards,
        ].join("\n\n"),
      };
    case "offer":
      return {
        subject: sv ? `Erbjudande – ${input.jobTitle}` : `Offer – ${input.jobTitle}`,
        body: [
          hello,
          sv
            ? `Vi är glada att kunna erbjuda dig tjänsten ${input.jobTitle}.`
            : `We are pleased to offer you the position of ${input.jobTitle}.`,
          sv
            ? "[Beskriv villkor, startdatum och nästa steg]"
            : "[Describe terms, start date and next steps]",
          regards,
        ].join("\n\n"),
      };
    case "information":
      return {
        subject: sv
          ? `Information om din ansökan – ${input.jobTitle}`
          : `Update on your application – ${input.jobTitle}`,
        body: [
          hello,
          sv
            ? `Här kommer en uppdatering om rekryteringen till ${input.jobTitle}.`
            : `Here is an update on the recruitment for ${input.jobTitle}.`,
          sv ? "[Skriv uppdateringen]" : "[Write the update]",
          regards,
        ].join("\n\n"),
      };
    default:
      return {
        subject: input.jobTitle,
        body: [hello, "", regards].join("\n\n"),
      };
  }
}

/** A calendar file for an invitation, so the candidate's own calendar holds
 *  the same time the message states. Plain RFC 5545, UTC times. */
export function bookingIcs(input: {
  uid: string;
  title: string;
  booking: BookingForTemplate;
  organiser: string;
}): string {
  const start = new Date(input.booking.startsAt);
  const end = new Date(start.getTime() + input.booking.durationMinutes * 60_000);
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const location =
    input.booking.locationKind === "video"
      ? (input.booking.meetingUrl ?? "")
      : input.booking.locationKind === "phone"
        ? "Telefon / Telephone"
        : (input.booking.locationText ?? "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CQrityjob//Recruitment//SV",
    "BEGIN:VEVENT",
    `UID:${input.uid}@cqrityjob`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(input.title)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(input.organiser)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** The message a candidate receives when a recruitment test is sent to them:
 *  what it is, who asked, for which job, and where to find it. It names no
 *  score, no content and no deadline it does not know. */
export function testInvitationMessage(input: {
  language: "sv" | "en";
  candidateName: string | null;
  employerName: string;
  jobTitle: string;
  assessmentName: string;
  academyUrl: string;
}): { subject: string; body: string } {
  const greet =
    input.language === "sv"
      ? input.candidateName
        ? `Hej ${input.candidateName},`
        : "Hej,"
      : input.candidateName
        ? `Hi ${input.candidateName},`
        : "Hi,";
  if (input.language === "sv") {
    return {
      subject: `Test att göra: ${input.assessmentName}`,
      body: [
        greet,
        "",
        `${input.employerName} har skickat ett test till dig som en del av rekryteringen till ${input.jobTitle}: ${input.assessmentName}.`,
        "",
        `Du hittar testet under Tester & utveckling när du är inloggad på CQrityjob: ${input.academyUrl}`,
        "",
        "Du kan pausa och fortsätta senare. Resultatet är ett underlag inför en intervju – det fattar inget beslut om dig.",
        "",
        `Vänliga hälsningar`,
        input.employerName,
      ].join("\n"),
    };
  }
  return {
    subject: `A test to complete: ${input.assessmentName}`,
    body: [
      greet,
      "",
      `${input.employerName} has sent you a test as part of the recruitment for ${input.jobTitle}: ${input.assessmentName}.`,
      "",
      `You will find it under Tests & development when signed in to CQrityjob: ${input.academyUrl}`,
      "",
      "You can pause and continue later. The result is material for an interview – it makes no decision about you.",
      "",
      "Kind regards",
      input.employerName,
    ].join("\n"),
  };
}
