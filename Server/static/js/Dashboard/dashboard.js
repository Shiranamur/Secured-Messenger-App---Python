import { initializeAddContactForm } from './contacts.js';
import { setupSendMessage } from './messaging.js';
import { setupSocketHandlers, socket } from './socketHandlers.js';

let currentUserEmail = null;

document.addEventListener('DOMContentLoaded', () => {
    console.debug('[BOOT] DOMContentLoaded');
    initializeAddContactForm();
    setupSendMessage();
    setupSocketHandlers();

    // Get current user email from the contacts panel heading
    currentUserEmail = document.querySelector('.contacts-panel h2').textContent.trim();

    // Request contacts list via WebSocket
    socket.emit('get_contacts');

    const messageInputBox = document.getElementById('message-input');
    console.debug('[BOOT] #message-input display =', getComputedStyle(messageInputBox).display);
});