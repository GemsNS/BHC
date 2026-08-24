import type { AppData, InAppNotification } from "./types";

export function dueTodos(data: AppData, now = Date.now()): AppData["knockTodos"] {
  return data.knockTodos.filter(
    (t) => !t.completedAt && t.dueAt && new Date(t.dueAt).getTime() <= now + 15 * 60_000,
  );
}

export function enqueueNotification(
  data: AppData,
  note: Omit<InAppNotification, "id" | "createdAt" | "readAt">,
  newId: () => string,
  nowIso: () => string,
): InAppNotification {
  const item: InAppNotification = {
    id: newId(),
    createdAt: nowIso(),
    readAt: null,
    ...note,
  };
  data.notifications.unshift(item);
  if (data.notifications.length > 100) data.notifications.length = 100;
  return item;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function showBrowserNotification(title: string, body: string, href?: string | null) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const n = new Notification(title, { body, icon: "/icon-192.png" });
  if (href) {
    n.onclick = () => {
      window.focus();
      window.location.href = href;
    };
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}
