/* Traxio push notifications. FCM delivers web push as a standard Push event, so this needs no Firebase SDK:
   it shows the notification the server sent and opens its link when tapped. */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const n = payload.notification || {};
  const link = (payload.data && payload.data.link) || (payload.fcmOptions && payload.fcmOptions.link) || "/";
  event.waitUntil(
    self.registration.showNotification(n.title || "Traxio", {
      body: n.body || "",
      tag: link + "|" + (n.title || ""),
      data: { link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
