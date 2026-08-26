"use client";

import { LegacyRedirect } from "@/components/LegacyRedirect";

/** Territories / zones now live inside Active Knocker → Zones tab */
export default function ZonesAdminPage() {
  return <LegacyRedirect to="/admin/knocker?tab=zones" />;
}
