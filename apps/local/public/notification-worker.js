self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(
    event.notification.data?.destination ?? "/",
    self.location.origin,
  );
  if (destination.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const matching = windows.find(
          (client) => client.url === destination.href,
        );
        if (matching) return matching.focus();
        return self.clients.openWindow(destination.href);
      }),
  );
});
