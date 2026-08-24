"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { TutorialsGuide } from "@/components/tutorials/TutorialsGuide";

export default function AdminTutorialsPage() {
  return (
    <RequireAuth perm="board">
      <TutorialsGuide mode="admin" />
    </RequireAuth>
  );
}
