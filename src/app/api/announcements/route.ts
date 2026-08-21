import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { Announcement, EmployeeRole } from "@/lib/types";

export async function GET(request: Request) {
  const data = await readStore();
  const role = new URL(request.url).searchParams.get("role") as EmployeeRole | null;
  const list = data.announcements.filter((a) => {
    if (!a.audienceRoles.length) return true;
    if (!role) return true;
    return a.audienceRoles.includes(role);
  });
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return NextResponse.json({
    announcements: list,
    employees: data.employees,
  });
}

export async function POST(request: Request) {
  const schema = z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    authorId: z.string().min(1),
    pinned: z.boolean().optional(),
    audienceRoles: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item: Announcement = {
    id: newId(),
    title: parsed.data.title,
    body: parsed.data.body,
    authorId: parsed.data.authorId,
    pinned: parsed.data.pinned ?? false,
    audienceRoles: (parsed.data.audienceRoles || []) as EmployeeRole[],
    createdAt: nowIso(),
  };
  await updateStore((d) => {
    d.announcements.unshift(item);
  });
  return NextResponse.json({ announcement: item }, { status: 201 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await updateStore((d) => {
    d.announcements = d.announcements.filter((a) => a.id !== id);
  });
  return NextResponse.json({ ok: true });
}
