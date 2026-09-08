"use client";

import { CommandShell } from "./CommandShell";
import { RequireClockedIn } from "./RequireClockedIn";

/** Field apps — same command center chrome, field mode nav. Clock gate applies. */
export function AppsShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <CommandShell mode="apps" title={title}>
      <RequireClockedIn>{children}</RequireClockedIn>
    </CommandShell>
  );
}
