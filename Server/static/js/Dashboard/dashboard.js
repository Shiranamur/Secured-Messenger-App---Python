import { initializeAddContactForm, fetchContacts } from './contacts.js';
import { setupSendMessage } from './messaging.js';
import { setupSocketHandlers, socket } from './socketHandlers.js';
import {refreshPreKeysIfNeeded} from "../X3DH.js";

let currentUserEmail = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.debug('[BOOT] DOMContentLoaded');
    fetchContacts();
    initializeAddContactForm();
    setupSendMessage();
    setupSocketHandlers();

    try {
        await refreshPreKeysIfNeeded();
    } catch (err) {
        console.error('prekey refresh failed:', err);
    }

    // Get current user email from the contacts panel heading
    currentUserEmail = document.querySelector('.contacts-panel h2').textContent.trim();

    // Request contacts list via WebSocket
    socket.emit('get_contacts');

    const messageInputBox = document.getElementById('message-input');
    console.debug('[BOOT] #message-input display =', getComputedStyle(messageInputBox).display);
});