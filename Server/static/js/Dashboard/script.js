/* static/js/Dashboard/script.js  (debug build)
   ——————————————————————————————————————————
   Secure‑messaging dashboard — verbose logs version
*/

let currentContactEmail = null;
const conversationArea  = document.getElementById('conversation-area');
const newMsgInput       = document.getElementById('new-message');
const sendBtn           = document.getElementById('send-message');
const messageInputBox   = document.getElementById('message-input');
const socket = io('/ws');

// ─────────────────────────────────────────────
// 1.  Page boot
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    console.debug('[BOOT] DOMContentLoaded');
    initializeExistingContacts();
    initializeAddContactForm();
    setupSendMessage();

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
// 3.  Real‑time socket handler
// ─────────────────────────────────────────────
socket.on('connect', () => console.debug('[WS] Connected'));
socket.on('message', msg => {
    console.debug('[WS] Received message event', msg);
    if (msg.from !== currentContactEmail) {
        console.debug('[WS] Message is for another contact, ignoring');
        return;
    }
    appendMessage(msg.ciphertext, 'incoming');
});

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
    li.dataset.contactEmail = email;

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

// initialise contacts present at page load
function initializeExistingContacts() {
    const rows = document.querySelectorAll('.contact-item');
    console.debug('[BOOT] Found', rows.length, 'contacts in the list');
    rows.forEach(li => li.addEventListener('click', () => selectContact(li)));

    document.querySelectorAll('.contact-remove')
            .forEach(span => span.addEventListener('click', e => removeContact(span, e)));
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
    sendBtn.addEventListener('click', async () => {
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

        try {
            const r = await fetch('/api/messages', {
                method : 'POST',
                credentials : 'include',
                headers: { 'Content-Type': 'application/json',
                            'X-CSRF-TOKEN' : getCookie('csrf_access_token')
                },
                body   : JSON.stringify({
                    receiver   : currentContactEmail,
                    ciphertext : blob,
                    msg_type   : 'message'
                })
            });
            console.debug('[MSG] POST /api/messages status', r.status);
            appendMessage(blob, 'outgoing');
            newMsgInput.value = '';
        } catch (err) {
            console.error('[MSG] Error sending message:', err);
        }
    });
}

function getCookie(cookieName) {
    return document.cookie.split('; ').find(row => row.startsWith(cookieName + '='))?.split('=')[1];
}
