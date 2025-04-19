import { loadConversation } from './conversation.js';

function createContactElement(email) {
    console.debug('[CONTACT] Creating element for', email);
    const li = document.createElement('li');
    li.className = 'contact-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'contact-name';
    nameSpan.textContent = email;

    const removeSpan = document.createElement('span');
    removeSpan.className = 'contact-remove';
    removeSpan.textContent = 'Remove';
    li.append(nameSpan, removeSpan);

    li.dataset.contactEmail = email;
    // Click on contact selects it.
    li.addEventListener('click', () => selectContact(li));
    // Clicking on remove span deletes the contact.
    removeSpan.addEventListener('click', e => removeContact(removeSpan, e));

    return li;
}

function selectContact(contactLi) {
    console.debug('[UI] Contact clicked →', contactLi.dataset.contactEmail);
    document.querySelectorAll('.contact-item').forEach(li =>
        li.classList.remove('selected')
    );
    contactLi.classList.add('selected');

    const messageInputBox = document.getElementById('message-input');
    messageInputBox.style.display = 'flex';
    console.debug('[UI] #message-input display =', getComputedStyle(messageInputBox).display);

    window.currentContactEmail = contactLi.dataset.contactEmail;
    loadConversation(window.currentContactEmail);
}

function removeContact(removeSpan, e) {
    e.stopPropagation();
    const li = removeSpan.parentElement;
    const email2 = li.dataset.contactEmail;
    const email1 = document.querySelector("input[name='user1']").value;

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

// TODO : add input validation for email querry add contact form
function initializeAddContactForm() {
    console.debug('[BOOT] Wiring add-contact form');
    document.getElementById('add-contact-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData(this);
        console.debug('[CONTACT] Submitting add-contact request');
        try {
            const r = await fetch(this.action, { method: 'POST', body: fd });
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

function updateContactsList(contacts) {
    const contactsList = document.querySelector('.contacts-list');
    contacts.forEach(contact => {
        const li = createContactElement(contact.email)
        contactsList.appendChild(li);
    });
}

export { createContactElement, selectContact, removeContact, initializeAddContactForm, updateContactsList};