"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/notifications";
import { withBasePath } from "@/lib/paths";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const src = withBasePath("/sw.js");
    navigator.serviceWorker.register(src).catch(() => undefined);
    void registerServiceWorker();
  }, []);
  return null;
}
