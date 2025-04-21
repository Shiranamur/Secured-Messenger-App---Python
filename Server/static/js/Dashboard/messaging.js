import { socket } from './socketHandlers.js';
import { appendMessage } from './conversation.js';
import { dbPromise } from './db.js';

async function sendMessageViaSocket() {
    if (!window.currentContactEmail) {
        console.warn('[MSG] No contact selected');
        return;
    }
    const newMsgInput = document.getElementById('new-message');
    const plaintext = newMsgInput.value.trim();
    if (!plaintext) {
        console.warn('[MSG] Empty input, nothing sent');
        return;
    }

    // Sanitize message before displaying
    const tempDiv = document.createElement('div');
    tempDiv.textContent = plaintext;
    const sanitizedText = tempDiv.innerHTML; // or tempDiv.textContent
    // const blob = btoa(plaintext); // TODO: encrypt if needed


    console.debug('[MSG] Sending', plaintext.slice(0, 50), '→', window.currentContactEmail);
    socket.emit('send_message', {
        receiver: window.currentContactEmail,
        ciphertext: plaintext,
        msg_type: 'message'
    });
    appendMessage(sanitizedText, 'outgoing');
    

    try {
      const db = await dbPromise;
      const tx = db.transaction('messages', 'readwrite');
      tx.objectStore('messages').add({
        serverMessageId: null,
        contactEmail: window.currentContactEmail,
        ciphertext: plaintext,
        direction: 'outgoing',
        timestamp: Date.now(),
        readFlag: false
      });
      await tx.complete;
    } catch (e) {
      console.error('[DB] Failed to save outgoing message', e);
    }

    
    newMsgInput.value = '';
}

function setupSendMessage() {
    console.debug('[BOOT] Wiring send button');
    const sendBtn = document.getElementById('send-message');
    sendBtn.addEventListener('click', () => sendMessageViaSocket());
    const newMsgInput = document.getElementById('new-message');
    newMsgInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessageViaSocket();
    });
}

export { sendMessageViaSocket, setupSendMessage };