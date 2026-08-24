"use client";

import { AppsShell } from "@/components/AppsShell";
import { TutorialsGuide } from "@/components/tutorials/TutorialsGuide";

export default function AppsTutorialsPage() {
  return (
    <AppsShell title="Tutorials">
      <TutorialsGuide mode="apps" />
    </AppsShell>
  );
}
