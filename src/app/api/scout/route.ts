import { NextResponse } from "next/server";
import { z } from "zod";
import type { RawAd } from "@/lib/ad-ingest";
import { qualifyListing } from "@/lib/ad-pipeline";
import { getApiEmployee } from "@/lib/api-auth";
import {
  claimScoutTasks,
  completeScoutTask,
  enqueueScoutTask,
  heartbeatScoutRunner,
  ingestScoutResults,
  parseScoutPlatform,
  pruneScout,
  SCOUT_DEFAULT_QUERIES,
  SCOUT_DEFAULT_REGION,
  SCOUT_PLATFORMS,
  scoutStatus,
} from "@/lib/lead-scout";
import { newId, nowIso, readStore, updateStoreAsync } from "@/lib/store";
import type { Employee, ScoutPlatform } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Lead scout control plane — the own-PC scraper talks to this route.
 *
 * Auth (either):
 *   - runner: header `x-bhc-inbound-secret` or `?secret=` equal to ADS_INBOUND_SECRET
 *   - staff:  admin / manager session (the Automation hub UI)
 *
 * GET  ?runner=<id>       queued tasks + defaults + status
 * POST { action: "heartbeat" | "claim" | "complete" | "results" | "enqueue", … }
 */

type Auth = { kind: "runner" } | { kind: "session"; employee: Employee };

async function authorize(request: Request): Promise<Auth | NextResponse> {
  const secret = process.env.ADS_INBOUND_SECRET?.trim();
  const url = new URL(request.url);
  const given =
    request.headers.get("x-bhc-inbound-secret")?.trim() || url.searchParams.get("secret")?.trim();
  if (secret && given && given === secret) return { kind: "runner" };
  const employee = await getApiEmployee(request);
  if (employee && (employee.role === "admin" || employee.role === "manager")) {
    return { kind: "session", employee };
  }
  if (!secret) {
    return NextResponse.json(
      { error: "Lead scout disabled — set ADS_INBOUND_SECRET on the server." },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth instanceof NextResponse) return auth;
  const data = await readStore();
  const runnerId = new URL(request.url).searchParams.get("runner")?.trim() || null;
  const runner = runnerId ? data.scoutRunners.find((r) => r.id === runnerId) : undefined;
  const supports = (p: ScoutPlatform) => !runner || runner.platforms.length === 0 || runner.platforms.includes(p);
  const tasks = data.scoutTasks
    .filter((t) => t.status === "queued" && supports(t.platform))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 10);
  return NextResponse.json({
    ok: true,
    runner: runnerId,
    tasks,
    defaults: {
      platforms: SCOUT_PLATFORMS,
      queries: SCOUT_DEFAULT_QUERIES,
      region: process.env.SCOUT_REGION?.trim() || SCOUT_DEFAULT_REGION,
    },
    status: scoutStatus(data),
  });
}

const platformSchema = z
  .string()
  .transform((v, ctx) => {
    const p = parseScoutPlatform(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: `Unknown platform "${v}"` });
      return z.NEVER;
    }
    return p;
  });

const listingSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().max(8000).optional(),
  url: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  externalId: z.string().max(300).optional(),
  postedAt: z.string().max(60).nullable().optional(),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().max(200).optional(),
  contactPhone: z.string().max(60).optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("heartbeat"),
    runner: z.object({
      id: z.string().min(1).max(80),
      name: z.string().max(80).default(""),
      host: z.string().max(120).default(""),
      version: z.string().max(40).default(""),
      platforms: z.array(z.string()).default([]),
    }),
    summary: z.string().max(400).optional(),
  }),
  z.object({
    action: z.literal("claim"),
    runnerId: z.string().min(1).max(80),
    taskIds: z.array(z.string()).max(20).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  z.object({
    action: z.literal("complete"),
    runnerId: z.string().min(1).max(80),
    taskId: z.string().min(1),
    found: z.number().int().min(0).default(0),
    created: z.number().int().min(0).default(0),
    error: z.string().max(400).nullable().optional(),
  }),
  z.object({
    action: z.literal("results"),
    runnerId: z.string().min(1).max(80),
    platform: platformSchema,
    taskId: z.string().optional(),
    listings: z.array(listingSchema).max(100),
  }),
  z.object({
    action: z.literal("enqueue"),
    platform: platformSchema,
    query: z.string().min(2).max(200),
    region: z.string().max(120).optional(),
    note: z.string().max(300).optional(),
  }),
]);

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const ctx = { newId, nowIso };

  switch (body.action) {
    case "heartbeat": {
      const platforms = body.runner.platforms
        .map(parseScoutPlatform)
        .filter((p): p is ScoutPlatform => p !== null);
      let status: ReturnType<typeof scoutStatus> | null = null;
      let pruned = { requeued: 0, dropped: 0 };
      await updateStoreAsync(async (d) => {
        heartbeatScoutRunner(d, { ...body.runner, platforms }, nowIso, body.summary);
        pruned = pruneScout(d, nowIso);
        status = scoutStatus(d);
      });
      return NextResponse.json({ ok: true, status, pruned });
    }
    case "claim": {
      let claimed: unknown[] = [];
      await updateStoreAsync(async (d) => {
        claimed = claimScoutTasks(d, body.runnerId, body.taskIds, body.limit ?? 5, nowIso);
      });
      return NextResponse.json({ ok: true, tasks: claimed });
    }
    case "complete": {
      let task: unknown = null;
      await updateStoreAsync(async (d) => {
        task = completeScoutTask(
          d,
          {
            taskId: body.taskId,
            runnerId: body.runnerId,
            found: body.found,
            created: body.created,
            error: body.error ?? null,
          },
          nowIso,
        );
      });
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
      return NextResponse.json({ ok: true, task });
    }
    case "results": {
      const raws: RawAd[] = body.listings.map((l) => ({
        title: l.title,
        body: l.body ?? "",
        url: l.url ?? "",
        location: l.location ?? "",
        externalId: l.externalId || undefined,
        postedAt: l.postedAt ?? null,
        contactName: l.contactName ?? "",
        contactEmail: l.contactEmail ?? "",
        contactPhone: l.contactPhone ?? "",
      }));
      let created = 0;
      let filtered = 0;
      let qualified = 0;
      await updateStoreAsync(async (d) => {
        const r = ingestScoutResults(d, body.platform, raws, ctx);
        created = r.created.length;
        filtered = r.filtered;
        for (const ad of r.created.slice(0, 10)) {
          try {
            const q = await qualifyListing(d, ad, ctx);
            if (q.qualified) qualified += 1;
          } catch {
            /* triage failure for one ad must not lose the batch */
          }
        }
        const runner = d.scoutRunners.find((x) => x.id === body.runnerId);
        if (runner) {
          runner.adsPosted += created;
          runner.lastRunAt = nowIso();
        }
        const task = body.taskId ? d.scoutTasks.find((t) => t.id === body.taskId) : null;
        if (task) {
          task.found += raws.length;
          task.created += created;
        }
      });
      return NextResponse.json({ ok: true, received: raws.length, created, filtered, qualified });
    }
    case "enqueue": {
      const requestedBy = auth.kind === "session" ? auth.employee.id : "runner";
      let task: unknown = null;
      let existing = false;
      let error: string | null = null;
      await updateStoreAsync(async (d) => {
        try {
          const r = enqueueScoutTask(
            d,
            { platform: body.platform, query: body.query, region: body.region, requestedBy, note: body.note },
            ctx,
          );
          task = r.task;
          existing = r.existing;
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
      });
      if (error) return NextResponse.json({ error }, { status: 409 });
      return NextResponse.json({ ok: true, task, existing });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
