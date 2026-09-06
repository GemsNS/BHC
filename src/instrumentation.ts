/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * Starts the BHC automation scheduler and the live-event file sink on the
 * Node runtime only.
 *
 * Disable the scheduler with BHC_SCHEDULER=0 (e.g. when an external cron or
 * systemd timer calls `npm run bhc -- automations tick` instead).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PUBLIC_STATIC_DEMO === "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { installEventFileSink } = await import("./lib/events-server");
  await installEventFileSink();
  const { live } = await import("./lib/events");
  const { startScheduler, schedulerIntervalMinutes, schedulerEnabled } = await import("./lib/scheduler");
  const { sessionSecretConfigured } = await import("./lib/auth-session");
  const started = startScheduler();
  live.system(
    "Server booted",
    `${process.env.BHC_COMMIT ? `commit ${process.env.BHC_COMMIT} · ` : ""}scheduler ${started ? `every ${schedulerIntervalMinutes()} min` : schedulerEnabled() ? "already running" : "disabled"}${sessionSecretConfigured() ? "" : " · SESSION_SECRET not set"}`,
    sessionSecretConfigured() ? "info" : "warn",
  );
}
