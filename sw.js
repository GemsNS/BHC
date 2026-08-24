/* BHC field service worker — push notifications + background ping hints */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "notify" && data.title) {
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { href: data.href || "/apps/knocker" },
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/apps/knocker";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "BHC Knocker", body: "Field update", href: "/apps/knocker" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      data: { href: payload.href },
    }),
  );
});
