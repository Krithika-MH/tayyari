import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { seedDemoEvent } from "@/lib/seed-data";

export async function POST() {
  try {
    const repo = getRepository();
    const { event, members } = await seedDemoEvent(repo);
    const organizer =
      members.find((m) => m.role === "organizer") ?? members[0] ?? null;
    const meeraUrl = organizer
      ? `/e/${event.id}?t=${encodeURIComponent(organizer.access_token)}`
      : `/e/${event.id}`;

    return NextResponse.json({
      event,
      members,
      meeraUrl,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load demo event.",
      },
      { status: 500 }
    );
  }
}
