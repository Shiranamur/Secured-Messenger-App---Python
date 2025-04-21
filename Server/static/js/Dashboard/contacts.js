// Server/static/js/Dashboard/contacts.js
import { loadConversation } from './conversation.js';
import { getCookie } from '../utils.js';
import { handleContactResponse, getStoredContacts, removeContact} from './ContactStorage.js';

/**
 * Sets up the contact list element with removal handler.
 * @param {string} email - Contact email address.
 * @returns {HTMLElement} - Created contact list item.
 */
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

  li.addEventListener('click', () => selectContact(li));

  removeSpan.addEventListener('click', e => {
    e.stopPropagation();
    removeContact(email)
        .catch(err => console.error('[CONTACT] Removal error:', err));
  });

  return li;
}

/**
 * Selects a contact and loads their conversation
 * @param {HTMLElement} contactLi - Contact list item element
 */
function selectContact(contactLi) {
  console.debug('[UI] Contact clicked →', contactLi.dataset.contactEmail);

  // Update UI state
  document.querySelectorAll('.contact-item').forEach(li =>
    li.classList.remove('selected')
  );
  contactLi.classList.add('selected');

  // Show message input box
  const messageInputBox = document.getElementById('message-input');
  messageInputBox.style.display = 'flex';

  // Set current contact and load conversation
  window.currentContactEmail = contactLi.dataset.contactEmail;
  loadConversation(window.currentContactEmail)
        .catch(err => console.error('[CONTACT] Load conversation error:', err));
}

/**
 * Sets up the add contact form
 */
function initializeAddContactForm() {
  console.debug('[BOOT] Wiring add-contact form');
  const form = document.getElementById('add-contact-form');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('add-contact-email');
    const contactEmail = emailInput.value;

    if (!contactEmail.trim()) return;

    const formData = new FormData();
    formData.append('user2', contactEmail);

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
        emailInput.value = '';
      } else {
        console.error('[CONTACT] Error:', js.message);
      }
    } catch (err) {
      console.error('[CONTACT] Fetch error:', err);
    }
  });
}

/**
 * Updates the contacts list with new contacts
 * @param {Array} contacts - Array of contact objects or emails
 */
function updateContactsList(contacts) {
  const contactsList = document.querySelector('.contacts-list');

  contacts.forEach(contact => {
    const email = contact.email || contact;
    const li = createContactElement(email);
    contactsList.appendChild(li);
  });
}

/**
 * Loads pending contact requests
 */
function loadPendingRequests() {
  fetch('/api/contact-requests', {
    credentials: 'include',
    headers: {'X-CSRF-TOKEN': getCookie('csrf_access_token')}
  })
  .then(r => r.json())
  .then(data => {
    const requestsContainer = document.getElementById('contact-requests');
    requestsContainer.innerHTML = '';

    data.requests.forEach(req => {
      console.debug('[CONTACT] Request:', req);

      const requestEl = createRequestElement(req);
      requestsContainer.appendChild(requestEl);
    });

    document.getElementById('requests-section').style.display =
      data.requests.length > 0 ? 'block' : 'none';
  })
  .catch(err => console.error('[CONTACT] Failed to load requests:', err));
}

/**
 * Creates a contact request element
 * @param {Object} request - Contact request data
 * @returns {HTMLElement} - Created request element
 */
function createRequestElement(request) {
  const element = document.createElement('div');
  element.className = 'contact-request';
  element.dataset.requesterId = request.requester_email;
  element.innerHTML = `
    <span>${request.requester_email}</span>
    <div class="request-actions">
      <button class="accept-btn">Accept</button>
      <button class="reject-btn">Reject</button>
    </div>
  `;

  element.querySelector('.accept-btn').addEventListener('click', () => {
    handleRequestResponse(request.id, 'accept', request.requester_email);
  });

  element.querySelector('.reject-btn').addEventListener('click', () => {
    handleRequestResponse(request.id, 'reject', request.requester_email);
  });

  return element;
}

/**
 * Handles response to contact request
 * @param {number} requestId - ID of the request
 * @param {string} action - Action to take ('accept' or 'reject')
 * @param {string} requesterEmail - Email of the requester
 */
function handleRequestResponse(requestId, action, requesterEmail) {
  fetch(`/api/contact-requests/${requestId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'X-CSRF-TOKEN': getCookie('csrf_access_token'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action })
  })
  .then(r => r.json())
  .then(data => {
    const responseAction =
        action === 'accept' ? 'accepted' :
        action === 'reject' ? 'rejected' : null
    if (responseAction) {
      handleContactResponse(requesterEmail, responseAction, 'receiving');
      loadPendingRequests();
    } else {
      console.error('Unsupported action:', action);
    }
  })
  .catch(err => console.error('[CONTACT] Request response error:', err));
}

/**
 * Loads contacts from storage and displays them
 */
function loadContacts() {
  console.debug('[CONTACTS] Loading contacts list');

  getStoredContacts()
    .then(storedContacts => {
      if (storedContacts.length > 0) {
        const contactsList = document.querySelector('.contacts-list');
        contactsList.innerHTML = '';
        updateContactsList(storedContacts);
      }
    })
    .catch(err => console.error('[CONTACTS] Failed to load contacts:', err));
}

export {
  createContactElement,
  selectContact,
  initializeAddContactForm,
  updateContactsList,
  loadPendingRequests,
  loadContacts
};