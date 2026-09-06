/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * Starts the BHC automation scheduler on the Node runtime only.
 *
 * Disable with BHC_SCHEDULER=0 (e.g. when an external cron/systemd timer
 * calls `npm run bhc -- automations tick` or POST /api/automation instead).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PUBLIC_STATIC_DEMO === "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
