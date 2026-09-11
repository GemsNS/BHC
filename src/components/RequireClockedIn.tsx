"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { fetchJson, loadAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import {
  autoCloseOverLimitPunches,
  openPunchFor,
  type TimePunch,
} from "@/lib/time-clock";
import type { EmployeeRole, TimeEntry } from "@/lib/types";

/** Roles that may use admin CRM without being on the clock. */
const CLOCK_EXEMPT_ROLES: EmployeeRole[] = ["admin", "manager", "office"];

const CLOCK_FREE_PATHS = [
  "/apps/clock",
  "/apps/hours",
  "/login",
  "/login/set-password",
];

function pathIsClockFree(pathname: string): boolean {
  return CLOCK_FREE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Field staff must be clocked in before using tools/apps (except the clock
 * and personal hour tracker). Admin/manager/office keep CRM access without
 * a punch; if they open field apps they still need to clock in.
 */
export function RequireClockedIn({ children }: { children: React.ReactNode }) {
  const { user, loading, authenticated } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (loading) return;
      if (!authenticated || !user) {
        setChecking(false);
        return;
      }
      if (pathIsClockFree(pathname)) {
        setClockedIn(true);
        setChecking(false);
        return;
      }
      // Admin CRM surfaces stay available without a punch
      if (
        pathname.startsWith("/admin") &&
        CLOCK_EXEMPT_ROLES.includes(user.role)
      ) {
        setClockedIn(true);
        setChecking(false);
        return;
      }

      try {
        if (isStaticDemo()) {
          const data = await loadAppData();
          autoCloseOverLimitPunches(data.timeEntries as TimePunch[]);
          const open = openPunchFor(data.timeEntries as TimePunch[], user.id);
          if (!cancelled) setClockedIn(Boolean(open));
        } else {
          const json = await fetchJson<{
            me?: { clockedIn: boolean };
            timeEntries: TimeEntry[];
          }>("/api/time-entries");
          if (!cancelled) {
            setClockedIn(
              Boolean(
                json.me?.clockedIn ??
                  openPunchFor(json.timeEntries as TimePunch[], user.id),
              ),
            );
          }
        }
      } catch {
        if (!cancelled) setClockedIn(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [loading, authenticated, user, pathname]);

  useEffect(() => {
    if (checking || loading || !authenticated) return;
    if (!clockedIn && !pathIsClockFree(pathname)) {
      router.replace(`/apps/clock?next=${encodeURIComponent(pathname)}`);
    }
  }, [checking, loading, authenticated, clockedIn, pathname, router]);

  if (loading || checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--muted)]">
        Checking clock…
      </div>
    );
  }

  if (!authenticated) return null;

  if (!clockedIn && !pathIsClockFree(pathname)) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center">
        <h2 className="text-lg font-semibold">Clock in required</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          You must clock in before using tools and field apps. Shifts auto-close
          after 12 hours (clock in again to continue). A 30-minute lunch is
          deducted from paid time.
        </p>
        <Link href="/apps/clock" className="btn-primary mt-4 inline-flex">
          Go to time clock
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
