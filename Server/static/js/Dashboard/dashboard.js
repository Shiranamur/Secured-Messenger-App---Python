// Server/static/js/Dashboard/dashboard.js
import { initializeAddContactForm, loadContacts, loadPendingRequests } from './contacts.js';
import { setupSendMessage } from './messaging.js';
import { setupSocketHandlers } from './socketHandlers.js';
import { refreshPreKeysIfNeeded } from "../X3DH.js";
import { checkHandledRequests } from './ContactStorage.js';

/**
 * Initialize the dashboard
 */
async function initializeDashboard() {
  console.debug('[BOOT] Initializing dashboard');

  try {
    // Set up UI components
    initializeAddContactForm();
    setupSendMessage();
    setupSocketHandlers();

    // Check for handled contact requests
    checkHandledRequests();

    // Load user contacts
    loadContacts();

    // Load pending requests
    loadPendingRequests();

    // Ensure we have enough prekeys
    await refreshPreKeysIfNeeded();

    // Get current user email from the contacts panel heading
    const currentUserEmail = document.querySelector('.contacts-panel h2').textContent.trim();
    window.currentUserEmail = currentUserEmail;

    console.debug('[BOOT] Dashboard initialized successfully');
  } catch (error) {
    console.error('[BOOT] Dashboard initialization error:', error);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeDashboard);

export { initializeDashboard };