function getCookie(cookieName) {
    return document.cookie.split('; ')
        .find(row => row.startsWith(cookieName + '='))
        ?.split('=')[1];
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => notification.remove(), 5000);
}


export { getCookie, showNotification };