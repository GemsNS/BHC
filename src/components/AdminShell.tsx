"use client";

import { CommandShell } from "./CommandShell";

/** Admin pages — dark command center chrome */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return <CommandShell mode="admin">{children}</CommandShell>;
}
