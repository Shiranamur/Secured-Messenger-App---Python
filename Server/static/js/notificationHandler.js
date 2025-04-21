/**
 * Show desktop notification
 * @param {string} message - Notification message
 */
function showNotification(message) {
  // Check if browser supports notifications
  if (!("Notification" in window)) {
    console.debug("Browser does not support notifications");
    return;
  }

  // Check notification permission
  if (Notification.permission === "granted") {
    new Notification("Secure Messenger", { body: message });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("Secure Messenger", { body: message });
      }
    });
  }
}

/**
 * Remove notification from UI
 * @param {string} requesterId - Email of requester
 */
function removeContactRequestNotification(requesterId) {
  const notification = document.querySelector(`.contact-request[data-requester-id="${requesterId}"]`);
  if (notification) {
    notification.remove();
    updateNotificationCount();
  }
}

/**
 * Update notification counter
 */
function updateNotificationCount() {
  const count = document.querySelectorAll('.contact-request').length;
  const counter = document.getElementById('notification-counter');
  if (counter) {
    counter.textContent = count || '';
    counter.style.display = count ? 'block' : 'none';
  }
}

export { removeContactRequestNotification, showNotification, updateNotificationCount };