"use client";

import { AppsShell } from "@/components/AppsShell";
import { AnnouncementBoard } from "@/components/AnnouncementBoard";
import { RequireAuth } from "@/components/RequireAuth";

export default function AppsBoardPage() {
  return (
    <AppsShell title="Board">
      <RequireAuth perm="board">
        <AnnouncementBoard variant="apps" />
      </RequireAuth>
    </AppsShell>
  );
}
