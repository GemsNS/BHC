/**
 * Empty stand-in used ONLY when Next compiles `instrumentation.ts` for the
 * Edge runtime (which happens once `src/middleware.ts` exists). `register()`
 * returns before importing anything on Edge, so these are never called —
 * they just keep webpack from traversing Node-only dependencies
 * (imapflow, nodemailer, pdfkit, node:sqlite, fs).
 */
export function startScheduler(): boolean {
  return false;
}
export function schedulerEnabled(): boolean {
  return false;
}
export function schedulerIntervalMinutes(): number {
  return 0;
}
export async function installEventFileSink(): Promise<void> {}
export async function runServerTick(): Promise<never> {
  throw new Error("not available on the edge runtime");
}
export function serverSenders(): Record<string, never> {
  return {};
}
export function schedulerInfo(): Record<string, unknown> {
  return {};
}
export async function serverBackupHook(): Promise<null> {
  return null;
}
