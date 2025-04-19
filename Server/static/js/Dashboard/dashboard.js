/* static/js/Dashboard/script.js  (debug build)
   ——————————————————————————————————————————
   Secure‑messaging dashboard — verbose logs version
*/

let currentContactEmail = null;
let currentUserEmail = null; // Add this to track the current user's email
const conversationArea = document.getElementById('conversation-area');
const newMsgInput = document.getElementById('new-message');
const sendBtn = document.getElementById('send-message');
const messageInputBox = document.getElementById('message-input');

// Replace websocket connection with authenticated connection
const socket = io('/', {
    extraHeaders: {
        'Authorization': `Bearer ${getCookie('access_token_cookie')}`
    }
});

// ─────────────────────────────────────────────
// 1.  Page boot
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    console.debug('[BOOT] DOMContentLoaded');
    initializeAddContactForm();
    setupSendMessage();
    setupSocketHandlers();

    // Get current user email from the contacts panel heading
    currentUserEmail = document.querySelector('.contacts-panel h2').textContent.trim();

    // Request contacts list via WebSocket
    socket.emit('get_contacts');

    // status of the message‑input box at startup
    console.debug('[BOOT] #message-input display =', getComputedStyle(messageInputBox).display);
});

// ─────────────────────────────────────────────
// 2.  Conversation helpers
// ─────────────────────────────────────────────
async function loadConversation(contactEmail) {
    console.debug('[CONVO] Loading history for', contactEmail);
    try {
        const r  = await fetch(`/api/messages/${contactEmail}`);
        console.debug('[CONVO] GET /api/messages status', r.status);
        const js = await r.json();
        conversationArea.innerHTML = '';

        if (!js.length) {
            console.debug('[CONVO] No messages yet');
            conversationArea.innerHTML = '<p>No messages yet</p>';
            return;
        }

        console.debug('[CONVO] Rendering', js.length, 'messages');
        js.forEach(m => appendMessage(
            m.ciphertext,
            m.sender_email === contactEmail ? 'incoming' : 'outgoing'
        ));
    } catch (err) {
        console.error('[CONVO] Error fetching conversation:', err);
    }
}

function appendMessage(blob, kind) {
    const plaintext = atob(blob);       // TODO decrypt
    const el        = document.createElement('div');
    el.className    = `message ${kind}`;
    el.textContent  = plaintext;
    conversationArea.appendChild(el);
    conversationArea.scrollTop = conversationArea.scrollHeight;
    console.debug('[MSG] Appended', kind, 'message:', plaintext.slice(0,50));
}

// ─────────────────────────────────────────────
// 3.  Real‑time socket handlers
// ─────────────────────────────────────────────
function setupSocketHandlers() {
    socket.on('connect', () => console.debug('[WS] Connected'));

    // Enhanced message handling
    socket.on('message', (payload) => {
        console.debug('[WS] Received message event', payload);
        const { from, ciphertext, msg_type, id } = payload;

        if (from !== currentContactEmail) {
            console.debug('[WS] Message is for another contact, ignoring');
            return;
        }

        appendMessage(ciphertext, 'incoming');
    });

    // Handle contacts list updates
    socket.on('contacts_list', (data) => {
        console.debug('[WS] Received contacts:', data);
        updateContactsList(data.contacts);
    });

    // Handle sent message confirmations
    socket.on('message_sent', (data) => {
        console.debug('[WS] Message sent with ID:', data.id);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error('[WS] Socket error:', error);
        alert(`Error: ${error.error}`);
    });

    socket.on('disconnect', () => {
      console.debug('[WS] Disconnected');
      // Show reconnection status in UI
      const statusEl = document.createElement('div');
      statusEl.className = 'connection-status disconnected';
      statusEl.textContent = 'Connection lost. Reconnecting...';
      document.body.appendChild(statusEl);
    });

    socket.on('reconnect', () => {
      console.debug('[WS] Reconnected');
      // Remove status message
      document.querySelector('.connection-status')?.remove();
    });
}

// Add updateContactsList function
function updateContactsList(contacts) {
    if (!contacts || !contacts.length) return;

    console.debug('[CONTACT] Updating contacts list with', contacts.length, 'contacts');
    const contactsList = document.querySelector('.contacts-list');

    contacts.forEach(contact => {
        const li = createContactElement(contact.email);
        contactsList.appendChild(li);
    });
}

// ─────────────────────────────────────────────
// 4.  Contact management
// ─────────────────────────────────────────────
function selectContact(contactLi) {
    console.debug('[UI] Contact clicked →', contactLi.dataset.contactEmail);

    document.querySelectorAll('.contact-item')
            .forEach(li => li.classList.remove('selected'));
    contactLi.classList.add('selected');

    // show message box
    messageInputBox.style.display = 'flex';
    console.debug('[UI] #message-input display =', getComputedStyle(messageInputBox).display);

    currentContactEmail = contactLi.dataset.contactEmail;
    loadConversation(currentContactEmail);
}

function removeContact(removeSpan, e) {
    e.stopPropagation();
    const li     = removeSpan.parentElement;
    const email2 = li.dataset.contactEmail;
    const email1 = document.querySelector('input[name="user1"]').value;

    console.debug('[CONTACT] Removing', email2);

    const fd = new FormData();
    fd.append('user1', email1);
    fd.append('user2', email2);

    fetch('/api/contact', { method: 'DELETE', body: fd })
        .then(r => r.json())
        .then(js => {
            console.debug('[CONTACT] DELETE /api/contact →', js);
            if (js.status === 'success') li.remove();
            else console.error(js.message);
        })
        .catch(err => console.error('[CONTACT] Remove error:', err));
}

function createContactElement(email) {
    console.debug('[CONTACT] Creating element for', email);
    const li   = document.createElement('li');
    li.className = 'contact-item';

    const nameSpan   = document.createElement('span');
    nameSpan.className = 'contact-name';
    nameSpan.textContent = email;

    const removeSpan = document.createElement('span');
    removeSpan.className = 'contact-remove';
    removeSpan.textContent = 'Remove';
    li.append(nameSpan, removeSpan);

    // click on name or empty space
    li.addEventListener('click', () => selectContact(li));
    // click on the remove button
    removeSpan.addEventListener('click', e => removeContact(removeSpan, e));

    return li;
}

// Add‑contact form
function initializeAddContactForm() {
    console.debug('[BOOT] Wiring add‑contact form');
    document.getElementById('add-contact-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData(this);

        console.debug('[CONTACT] Submitting add‑contact request');
        try {
            const r  = await fetch(this.action, { method: 'POST', body: fd });
            console.debug('[CONTACT] POST /api/contact status', r.status);
            const js = await r.json();
            if (js.status === 'success') {
                console.debug('[CONTACT] Added OK, email =', js.userEmail);
                const li = createContactElement(js.userEmail);
                document.querySelector('.contacts-list').appendChild(li);
            } else {
                console.error(js.message);
            }
        } catch (err) {
            console.error('[CONTACT] Error adding contact:', err);
        }
    });
}

// ─────────────────────────────────────────────
// 5.  Sending a message
// ─────────────────────────────────────────────
function setupSendMessage() {
    console.debug('[BOOT] Wiring send button');
    sendBtn.addEventListener('click', () => sendMessageViaSocket());

    // Add enter key support
    newMsgInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessageViaSocket();
    });
}

function sendMessageViaSocket() {
    if (!currentContactEmail) {
        console.warn('[MSG] No contact selected');
        return;
    }

    const plaintext = newMsgInput.value.trim();
    if (!plaintext) {
        console.warn('[MSG] Empty input, nothing sent');
        return;
    }

    const blob = btoa(plaintext);      // TODO encrypt
    console.debug('[MSG] Sending', plaintext.slice(0,50), '→', currentContactEmail);

    // Use socket to send message
    socket.emit('send_message', {
        receiver: currentContactEmail,
        ciphertext: blob,
        msg_type: 'message'
    });

    // Add to conversation immediately (will be confirmed by message_sent event)
    appendMessage(blob, 'outgoing');
    newMsgInput.value = '';
}

function getCookie(cookieName) {
    return document.cookie.split('; ').find(row => row.startsWith(cookieName + '='))?.split('=')[1];
}
