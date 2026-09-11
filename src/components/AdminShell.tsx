"use client";

import { CommandShell } from "./CommandShell";
import { RequireClockedIn } from "./RequireClockedIn";

/** Admin pages — dark command center chrome. Clock gate for non-exempt roles. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <CommandShell mode="admin">
      <RequireClockedIn>{children}</RequireClockedIn>
    </CommandShell>
  );
}
