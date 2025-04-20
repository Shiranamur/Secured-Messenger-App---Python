import { arrayBufferToBase64, base64ToArrayBuffer } from '../../KeyStorage.js';


// Session.js - Core Double Ratchet session management
class Session {
        constructor(contactEmail, sessionId) {
        this.contactEmail = contactEmail;
        this.sessionId = sessionId || crypto.randomUUID();

        // Ratchet state
        this.DHs = null;           // Our current ratchet key pair
        this.DHr = null;           // Their current ratchet public key
        this.RK = null;            // Root key
        this.CKs = null;           // Sending chain key
        this.CKr = null;           // Receiving chain key
        this.Ns = 0;               // # of messages in sending chain
        this.Nr = 0;               // # of messages in receiving chain
        this.PN = 0;               // # of messages in previous sending chain

        // Message keys we've skipped
        this.skippedMessageKeys = new Map();

        // Session initialization state
        this.initialized = false;
    }

        // Initialize session with initial keys from X3DH
    async initializeAsInitiator(sharedSecret) {
        // Create initial ratchet key pair
        this.DHs = await window.libsignal.Curve.generateKeyPair();
        this.RK = sharedSecret;

        this.initialized = true;
        return this.serialize();
    }

    async initializeAsResponder(sharedSecret, theirRatchetKey) {
        // Set their initial ratchet key
        this.DHr = theirRatchetKey;
        this.RK = sharedSecret;

        // Create our initial ratchet key and ratchet forward
        this.DHs = await window.libsignal.Curve.generateKeyPair();
        await this.ratchetStep();

        this.initialized = true;
        return this.serialize();
    }

        // Implements the core Double Ratchet step
    async ratchetStep() {
        // DH Ratchet - create new ratchet key pair
        const oldRatchetKey = this.DHs;
        this.DHs = await window.libsignal.Curve.generateKeyPair();

        // Calculate shared secret from DH exchange
        const sharedSecret = await window.libsignal.Curve.calculateAgreement(
            this.DHr,
            this.DHs.privKey
        );

        // Derive new root key and chain keys
        const derivedKeys = await window.libsignal.HKDF.deriveSecrets(
            sharedSecret,
            this.RK,
            new TextEncoder().encode("DoubleRatchetUpdate"),
            64  // 32 bytes for RK, 32 bytes for CK
        );

        // Split the derived keys into root key and chain key
        this.RK = derivedKeys.slice(0, 32);
        this.CKs = derivedKeys.slice(32, 64);

        // Reset sending message counter
        this.Ns = 0;

        return this.serialize();
    }

    // Serialize session for storage
    serialize() {
        return {
            contactEmail: this.contactEmail,
            sessionId: this.sessionId,
            DHs: this.DHs ? {
                pubKey: arrayBufferToBase64(this.DHs.pubKey),
                privKey: arrayBufferToBase64(this.DHs.privKey)
            } : null,
            DHr: this.DHr ? arrayBufferToBase64(this.DHr) : null,
            RK: this.RK ? arrayBufferToBase64(this.RK) : null,
            CKs: this.CKs ? arrayBufferToBase64(this.CKs) : null,
            CKr: this.CKr ? arrayBufferToBase64(this.CKr) : null,
            Ns: this.Ns,
            Nr: this.Nr,
            PN: this.PN,
            skippedMessageKeys: [...this.skippedMessageKeys].map(([k, v]) => [k, arrayBufferToBase64(v)]),
            initialized: this.initialized
        };
    }
}

export { Session };