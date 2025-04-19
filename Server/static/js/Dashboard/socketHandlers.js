import { updateContactsList } from './contacts.js';
import { appendMessage } from './conversation.js';
import { getCookie } from './utils.js';

const socket = io('/', {
  extraHeaders: {
    'Authorization': `Bearer ${getCookie('access_token_cookie')}`
  }
});

function setupSocketHandlers() {
  socket.on('connect', () => console.debug('[WS] Connected'));

  socket.on('message', (payload) => {
    console.debug('[WS] Received message event', payload);
    const { from, ciphertext } = payload;
    // Assume window.currentContactEmail is set when a contact is selected.
    if (from !== window.currentContactEmail) {
      console.debug('[WS] Message is for another contact, ignoring');
      return;
    }
    appendMessage(ciphertext, 'incoming');
  });

  socket.on('contacts_list', (data) => {
    console.debug('[WS] Received contacts:', data);
    updateContactsList(data.contacts);
  });

  socket.on('message_sent', (data) => {
    console.debug('[WS] Message sent with ID:', data.id);
  });

  socket.on('error', (error) => {
    console.error('[WS] Socket error:', error);
    alert(`Error: ${error.error}`);
  });

  socket.on('disconnect', () => {
    console.debug('[WS] Disconnected');
    const statusEl = document.createElement('div');
    statusEl.className = 'connection-status disconnected';
    statusEl.textContent = 'Connection lost. Reconnecting...';
    document.body.appendChild(statusEl);
  });

  socket.on('reconnect', () => {
    console.debug('[WS] Reconnected');
    document.querySelector('.connection-status')?.remove();
  });
}

export { socket, setupSocketHandlers };