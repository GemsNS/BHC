/** RFC5545 ICS + Google Calendar template URLs */

export type CalendarEventInput = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
};

function icsDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(event: CalendarEventInput): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BH Contracting Co.//BHC Knocker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.startAt)}`,
    `DTEND:${icsDate(event.endAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : "",
    event.location ? `LOCATION:${escapeIcs(event.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function googleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${icsDate(event.startAt).replace(/Z$/, "")}/${icsDate(event.endAt).replace(/Z$/, "")}`,
    details: event.description ?? "",
    location: event.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcs(filename: string, ics: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function defaultEndAt(startAt: string, minutes = 60): string {
  return new Date(new Date(startAt).getTime() + minutes * 60_000).toISOString();
}
