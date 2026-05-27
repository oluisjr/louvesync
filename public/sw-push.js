self.addEventListener('push', function(event) {
  let data = { title: 'LouveSync', body: 'Novas atualizações no ministério!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'LouveSync', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
            break;
          }
        }
        return client.focus().then(function() {
          return client.navigate(event.notification.data.url);
        });
      }
      return clients.openWindow(event.notification.data.url);
    })
  );
});
