"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { AnnouncementBoard } from "@/components/AnnouncementBoard";

export default function AdminBoardPage() {
  return (
    <RequireAuth perm="board">
      <AnnouncementBoard variant="admin" />
    </RequireAuth>
  );
}
