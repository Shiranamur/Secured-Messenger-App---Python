// Server/static/js/Dashboard/ContactStorage.js
import { setupCryptoForContact } from './DoubleRatchet/contactCrypto.js';
import { createContactElement } from './contacts.js';
import { removeContactRequestNotification, updateNotificationCount } from '../notificationHandler.js';

// Constants
const CONTACT_REQUESTS_DB_NAME = 'ContactRequestsDB';
const CONTACTS_DB_NAME = 'ContactsDB';
const CONTACT_REQUESTS_STORE = 'requests';
const CONTACTS_STORE = 'contacts';
const DB_VERSION = 1;

/**
 * Initialize IndexedDB for contact requests
 * @returns {Promise<IDBDatabase>} - Database connection
 */
function initContactRequestDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONTACT_REQUESTS_DB_NAME, DB_VERSION);

    request.onerror = event => reject('IndexedDB error: ' + event.target.errorCode);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CONTACT_REQUESTS_STORE)) {
        const store = db.createObjectStore(CONTACT_REQUESTS_STORE, { keyPath: 'requesterId' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = event => resolve(event.target.result);
  });
}

/**
 * Initialize IndexedDB for contacts
 * @returns {Promise<IDBDatabase>} - Database connection
 */
function initContactsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONTACTS_DB_NAME, DB_VERSION);

    request.onerror = event => reject('IndexedDB error: ' + event.target.errorCode);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CONTACTS_STORE)) {
        const store = db.createObjectStore(CONTACTS_STORE, { keyPath: 'email' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = event => resolve(event.target.result);
  });
}

/**
 * Save contact request status to IndexedDB
 * @param {string} requesterId - Email of requester
 * @param {string} status - Status ('accepted' or 'rejected')
 * @returns {Promise<boolean>} - Success indicator
 */
function saveContactRequestStatus(requesterId, status) {
  return initContactRequestDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CONTACT_REQUESTS_STORE], 'readwrite');
      const store = transaction.objectStore(CONTACT_REQUESTS_STORE);

      const request = store.put({
        requesterId: requesterId,
        status: status,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject('Save error');
      transaction.oncomplete = () => db.close();
    });
  });
}

/**
 * Store contact in IndexedDB
 * @param {string} contactEmail - Email of contact
 * @returns {Promise<boolean>} - Success indicator
 */
function storeContact(contactEmail) {
  return initContactsDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CONTACTS_STORE], 'readwrite');
      const store = transaction.objectStore(CONTACTS_STORE);

      const request = store.put({
        email: contactEmail,
        timestamp: Date.now()
      });

      request.onsuccess = () => {
        // Update the UI when a new contact is added
        addContactToUI(contactEmail);
        resolve(true);
      };
      request.onerror = () => reject('Save error');
      transaction.oncomplete = () => db.close();
    });
  });
}

/**
 * Remove contact from IndexedDB and update the UI
 * @param {string} contactEmail - Email of contact to remove
 * @returns {Promise<boolean>} - Success indicator
 */
function removeContact(contactEmail) {
  return initContactsDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CONTACTS_STORE], 'readwrite');
      const store = transaction.objectStore(CONTACTS_STORE);
      const request = store.delete(contactEmail);

      request.onsuccess = () => {
        removeContactFromUI(contactEmail);
        resolve(true);
      };

      request.onerror = () => reject('Removal error');
      transaction.oncomplete = () => db.close();
    });
  });
}

/**
 * Remove contact element from UI contacts list
 * @param {string} contactEmail - Email of contact to remove
 */
function removeContactFromUI(contactEmail) {
  const contactElement = document.querySelector(`.contact-item[data-contact-email="${contactEmail}"]`);
  if (contactElement) {
    contactElement.remove();
    console.debug('[CONTACT] Removed from UI:', contactEmail);
  }
}


/**
 * Check if a contact exists in storage
 * @param {string} contactEmail - Email of contact
 * @returns {Promise<boolean>} - True if contact exists
 */
function contactExists(contactEmail) {
  return initContactsDB().then(db => {
    return new Promise((resolve) => {
      const transaction = db.transaction([CONTACTS_STORE], 'readonly');
      const store = transaction.objectStore(CONTACTS_STORE);
      const request = store.get(contactEmail);

      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
      transaction.oncomplete = () => db.close();
    });
  });
}

/**
 * Get all contacts from IndexedDB
 * @returns {Promise<Array>} - Array of contacts
 */
function getStoredContacts() {
  return initContactsDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CONTACTS_STORE], 'readonly');
      const store = transaction.objectStore(CONTACTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Retrieval error');
      transaction.oncomplete = () => db.close();
    });
  });
}

/**
 * Add contact to UI contacts list
 * @param {string} contactEmail - Email of contact
 */
function addContactToUI(contactEmail) {
  const contactsList = document.querySelector('.contacts-list');
  const existingContact = document.querySelector(`.contact-item[data-contact-email="${contactEmail}"]`);

  if (!existingContact && contactsList) {
    const contactElement = createContactElement(contactEmail);
    contactsList.appendChild(contactElement);
    console.debug('[CONTACT] Added to UI:', contactEmail);
  }
}

/**
 * Handle contact request response
 * @param {string} requesterId - Email of requester
 * @param {string} action - Whether request was accepted
 * @param {string} communactionEndpoint - Is user receiving or requesting the request
 */
function handleContactResponse(requesterId, action, communactionEndpoint) {

  // Remove notification from UI
  removeContactRequestNotification(requesterId);

  // Store in IndexedDB
  saveContactRequestStatus(requesterId, action)
    .then(() => {
      // If accepted, also store as contact and setup crypto
      if (action === "accepted") {
        return contactExists(requesterId).then(exists => {
          if (!exists) {
            console.debug('[CONTACT] Accepted new contact:', requesterId);

            // Setup crypto for the new contact
            return setupCryptoForContact(requesterId, communactionEndpoint)
              .then(() => storeContact(requesterId))
              .catch(err => {
                console.error('[CRYPTO] Setup failed:', err);
                // Still store the contact even if crypto setup fails
                return false
              });
          }
          return true;
        });
      }
    })
    .catch(error => console.error('[CONTACT] Failed to save status:', error));
}

/**
 * Check if requests were already handled on page load
 */
function checkHandledRequests() {
  initContactRequestDB().then(db => {
    const requests = document.querySelectorAll('.contact-request');

    if (requests.length === 0) return;

    const transaction = db.transaction([CONTACT_REQUESTS_STORE], 'readonly');
    const store = transaction.objectStore(CONTACT_REQUESTS_STORE);

    requests.forEach(notification => {
      const requesterId = notification.dataset.requesterId;
      const request = store.get(requesterId);

      request.onsuccess = event => {
        if (event.target.result) {
          notification.remove();
          updateNotificationCount();
        }
      };
    });

    transaction.oncomplete = () => db.close();
  }).catch(err => console.error('[CONTACT] Error checking handled requests:', err));
}



export {
  saveContactRequestStatus,
  handleContactResponse,
  checkHandledRequests,
  getStoredContacts,
  storeContact,
  contactExists,
  addContactToUI,
  removeContact
};