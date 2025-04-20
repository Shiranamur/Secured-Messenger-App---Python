// import { loadConversation } from './conversation.js';
import { getCookie } from './utils.js';
import { setupCryptoForContact } from './DoubleRatchet/contactCrypto.js';

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
    //loadConversation(window.currentContactEmail);
    // TODO: Load conversation from IndexedDB
}

function removeContact(removeSpan, e) {
    e.stopPropagation();
    const li = removeSpan.parentElement;
    const emailToRemove = li.dataset.contactEmail;

    console.debug('[CONTACT] Removing', emailToRemove);
    let formData = new FormData();
    formData.append('emailToRemove', emailToRemove);

    fetch('/api/contact', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-TOKEN' : getCookie('csrf_access_token'),},
        body: formData
    })
        .then(r => r.json())
        .then(js => {
            console.debug('[CONTACT] DELETE /api/contact →', js);
            if (js.status === 'success') li.remove();
            else console.error(js.message);
        })
        .catch(err => console.error('[CONTACT] Remove error:', err));
}

function initializeAddContactForm() {
    console.debug('[BOOT] Wiring add-contact form');
    const form = document.getElementById('add-contact-form');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.debug('[CONTACT] Form submitted, default prevented');

        const emailInput = document.getElementById('add-contact-email');
        console.debug('[CONTACT] Email input value:', emailInput.value);

        const formData = new FormData();
        formData.append('user2', emailInput.value);

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                credentials: 'include',
                headers: {'X-CSRF-TOKEN': getCookie('csrf_access_token')},
                body: formData
            });

            const js = await response.json();
            console.debug('[CONTACT] POST response:', js);

            if (js.status === 'success') {
                // Add contact to UI
                const li = createContactElement(emailInput.value);
                document.querySelector('.contacts-list').appendChild(li);

                // Setup cryptographic session with the new contact
                try {
                    await setupCryptoForContact(emailInput.value);
                    console.debug('[CONTACT] Crypto setup complete for', emailInput.value);
                } catch (cryptoErr) {
                    console.error('[CONTACT] Failed to setup crypto:', cryptoErr);
                    // You might want to show an error or warning to the user
                    // TODO: pretify this error
                }

                emailInput.value = '';
            } else {
                console.error('[CONTACT] Error:', js.message);
            }
        } catch (err) {
            console.error('[CONTACT] Fetch error:', err);
        }
    });
}

// Function to fetch contacts from server
async function fetchContacts() {
  try {
    const response = await fetch('/api/contact', {
      method: 'GET',
      credentials: 'include',
      headers: {'X-CSRF-TOKEN': getCookie('csrf_access_token')}
    });
    const data = await response.json();
    if (data.status === 'success') {
      updateContactsList(data.contacts);
    } else {
      console.error('[CONTACT] Error fetching contacts:', data.message);
    }
  } catch (err) {
    console.error('[CONTACT] Fetch contacts error:', err);
  }
}

function updateContactsList(contacts) {
    const contactsList = document.querySelector('.contacts-list');
    contacts.forEach(contact => {
        const li = createContactElement(contact.email)
        contactsList.appendChild(li);
    });
}

export { createContactElement, selectContact, removeContact, initializeAddContactForm, updateContactsList, fetchContacts};