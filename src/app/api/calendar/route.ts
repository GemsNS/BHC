import { NextResponse } from "next/server";
import { buildIcs } from "@/lib/calendar";
import { readStore } from "@/lib/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const data = await readStore();
  const events = id
    ? data.knockCalendarEvents.filter((e) => e.id === id)
    : data.knockCalendarEvents;

  if (id && !events.length) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const ics = events
    .map((e) =>
      buildIcs({
        uid: e.icsUid,
        title: e.title,
        description: e.description,
        location: e.location,
        startAt: e.startAt,
        endAt: e.endAt,
      }),
    )
    .join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id ? `bhc-${id}` : "bhc-knocker"}.ics"`,
    },
  });
}
