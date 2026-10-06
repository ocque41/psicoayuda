/* Dedicated to visible notifications. No fetch handler or private-page cache. */
function pushDestination(data) {
  if (
    data?.v !== 1 ||
    !/^[A-Za-z0-9_-]{16,80}$/.test(data.id || "") ||
    !["professional", "patient"].includes(data.role) ||
    !["chat", "appointment", "after_session"].includes(data.kind) ||
    (data.kind === "after_session" && data.role !== "professional")
  )
    return null;
  if (data.role === "patient")
    return data.kind === "chat" ? "/mi/mensajes" : "/mi/calendario";
  return data.kind === "chat" ? "/pro/mensajes" : "/pro/consulta";
}
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data?.json();
  } catch {
    /* Generic visible fallback required by Safari. */
  }
  const destination = pushDestination(data);
  event.waitUntil(
    self.registration.showNotification("Nido", {
      body: "Tienes un aviso nuevo en Nido. Entra para verlo.",
      icon: "/brand/nido-icon-192.png",
      tag: destination ? `nido-push-${data.id}` : "nido-push",
      renotify: false,
      data: {
        destination: destination || "/entrar",
        deliveryId: destination ? data.id : null,
      },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = event.notification.data?.destination;
  const allowed = [
    "/mi/mensajes",
    "/mi/calendario",
    "/pro/mensajes",
    "/pro/consulta",
    "/entrar",
  ];
  const deliveryId = event.notification.data?.deliveryId;
  const path =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      deliveryId || "",
    )
      ? `/api/push/open?delivery=${encodeURIComponent(deliveryId)}`
      : allowed.includes(requested)
        ? requested
        : "/entrar";
  const destination = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (
          new URL(client.url).origin === self.location.origin &&
          "navigate" in client
        ) {
          await client.navigate(destination);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(destination);
    })(),
  );
});
self.addEventListener("pushsubscriptionchange", (event) => {
  // Permission granted once is not permission to create a new server consent.
  event.waitUntil(
    self.registration.showNotification("Nido", {
      body: "Abre Nido para revisar tus permisos de aviso.",
      icon: "/brand/nido-icon-192.png",
      tag: "nido-push-permissions",
      renotify: false,
      data: { destination: "/entrar" },
    }),
  );
});
