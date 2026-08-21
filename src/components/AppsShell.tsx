"use client";

import { CommandShell } from "./CommandShell";

/** Field apps — same command center chrome, field mode nav */
export function AppsShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <CommandShell mode="apps" title={title}>
      {children}
    </CommandShell>
  );
}
