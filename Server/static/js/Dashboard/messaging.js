import { socket } from './socketHandlers.js';
import { appendMessage } from './conversation.js';

function sendMessageViaSocket() {
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
    const blob = btoa(plaintext); // TODO: encrypt if needed
    console.debug('[MSG] Sending', plaintext.slice(0, 50), '→', window.currentContactEmail);
    socket.emit('send_message', {
        receiver: window.currentContactEmail,
        ciphertext: blob,
        msg_type: 'message'
    });
    appendMessage(blob, 'outgoing');
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