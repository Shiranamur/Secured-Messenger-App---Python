/**
 * Show desktop notification
 * @param {string} message - Notification message
 */
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => notification.remove(), 5000);
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