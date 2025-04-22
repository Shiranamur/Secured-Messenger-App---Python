// Server/static/js/Dashboard/DoubleRatchet/session.js
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../KeyStorage.js';

/**
 * Session class for Double Ratchet protocol
 */
class Session {
    /**
     * Create a new Double Ratchet session
     * @param {string} contactEmail - Email of the contact
     * @param {string} contactSignedPrekey
     */
    constructor(contactEmail, contactSignedPrekey) {
        this.contactEmail = contactEmail;
        this.sessionId = contactEmail;
        this.contactSignedPrekey = contactSignedPrekey;

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


  /**
   * Derive initial root‐and‐chain keys from the X3DH shared secret.
   * Both sides call this with the *same* sharedSecret, and get
   * the *same* RK, CKs, CKr.
   *
   * @param {ArrayBuffer} sharedSecret – 32‑byte X3DH output
   * @returns {{RK:ArrayBuffer, CKs:ArrayBuffer, CKr:ArrayBuffer}}
   */
  async deriveInitialRootAndChains(sharedSecret) {
    if (!sharedSecret) {
      throw new Error("Shared secret is required");
    }
    const info = new TextEncoder().encode("X3DH_DoubleRatchet_Init").buffer;
    // 96 bytes → 32 RK + 32 CKs + 32 CKr
    const derived = await window.libsignal.HKDF.deriveSecrets(
      sharedSecret,
      new Uint8Array(32).buffer, // zero‑salt
      info,
      96
    );
    let buf, RK, CKs, CKr;
    if (Array.isArray(derived)) {
      [RK, CKs, CKr] = derived;
    } else {
      buf  = new Uint8Array(derived);
      RK   = buf.slice(0,32).buffer;
      CKs  = buf.slice(32,64).buffer;
      CKr  = buf.slice(64,96).buffer;
    }
    return { RK, CKs, CKr };
  }

 /**
   * Initiator bootstrap: just carve out keys from X3DH root.
   * @param {ArrayBuffer} sharedSecret
   */
  async initializeAsInitiator(sharedSecret) {
    if (!sharedSecret) throw new Error("Shared secret is required");

    // 1) Generate our first ratchet keypair so DHs is never null
    this.DHs = await window.libsignal.Curve.generateKeyPair();

    // 2) Carve out RK, CKs, CKr from the X3DH shared secret
    const { RK, CKs, CKr } = await this.deriveInitialRootAndChains(sharedSecret);
    this.RK  = RK;
    this.CKs = CKs;
    this.CKr = CKr;

    this.initialized = true;
    return this.serialize();
  }

  /**
   * Responder bootstrap: same exact carve‑out from X3DH root.
   * @param {ArrayBuffer} sharedSecret
   * @param {ArrayBuffer} theirRatchetKey – we still need their X3DH ephemeral to decrypt their first msg
   */
  async initializeAsResponder(sharedSecret, theirRatchetKey) {
    this.DHr = theirRatchetKey;   // so on first decrypt we can do the ratchet
    this.DHs = await window.libsignal.Curve.generateKeyPair();

    const { RK, CKs, CKr } = await this.deriveInitialRootAndChains(sharedSecret);
    this.RK  = RK;
    this.CKs = CKs;
    this.CKr = CKr;
    this.initialized = true;
    return this.serialize();
  }

    /**
     * Performs a ratchet step (DH ratchet)
     * @returns {Object} - Serialized session
     */
    async ratchetStep() {
        if (!this.DHr) {
            throw new Error('Cannot perform ratchet step: No remote ratchet key');
        }

        // DH Ratchet - create new ratchet key pair
        this.DHs = await window.libsignal.Curve.generateKeyPair();

        // Calculate shared secret from DH exchange
        const sharedSecret = await window.libsignal.Curve.calculateAgreement(
            this.DHr,
            this.DHs.privKey
        );

        // Convert ArrayBuffer to the proper format before passing to HKDF
        const sharedSecretBuffer = new Uint8Array(sharedSecret);
        const rootKeyBuffer = new Uint8Array(this.RK);

        // IMPORTANT FIX: Make sure to properly await the HKDF.deriveSecrets promise
        const info = new TextEncoder().encode("derived_keys").buffer;
        const derivedKeys = await window.libsignal.HKDF.deriveSecrets(
          sharedSecretBuffer.buffer,
          rootKeyBuffer.buffer,
          info,
          96
        );


        console.log('[Session] Derived keys:', derivedKeys);

        // Make sure derivedKeys is not empty and has the right format
        if (!derivedKeys || !Array.isArray(derivedKeys) || derivedKeys.length < 3) {
          throw new Error('HKDF.deriveSecrets returned empty or invalid result');
        }


        // Extract the three keys from the derived secrets
        // IMPORTANT FIX: Handle the keys properly based on how your library returns them
        if (Array.isArray(derivedKeys)) {
            // If it's returning an array of keys
            this.RK = derivedKeys[0];
            this.CKs = derivedKeys[1];
            this.CKr = derivedKeys[2];
        } else {
            // If it's returning a single ArrayBuffer that needs to be split
            const allKeys = new Uint8Array(derivedKeys);
            this.RK = allKeys.slice(0, 32).buffer;
            this.CKs = allKeys.slice(32, 64).buffer;
            this.CKr = allKeys.slice(64, 96).buffer;
        }

        console.log("[Session] Derived RK:", arrayBufferToBase64(this.RK),
            "CKs:", arrayBufferToBase64(this.CKs),
            "CKr:", arrayBufferToBase64(this.CKr));

        // Reset sending message counter
        this.Ns = 0;

        this.debugRootKey(); // Print RK before using it

        return this.serialize();
    }


    /**
     * Performs HMAC-SHA256 operation
     * @param {Uint8Array|string} key - The key for HMAC
     * @param {Uint8Array|string} data - The data to hash
     * @returns {Promise<Uint8Array>} - The resulting hash
     */
    async hmacSha256(key, data) {
        // Check if key is defined and properly formatted
        console.log("[session] HMAC key type:", typeof key, "Key length:", key?.length, "Key:", key);
        if (!key) {
            console.error("HMAC key is undefined or null");
            throw new Error("Invalid key type for HMAC: key must be defined");
        }

        // Convert string key to Uint8Array if needed
        if (typeof key === 'string') {
            key = base64ToArrayBuffer(key);
        }

        // Convert string data to Uint8Array if needed
        if (typeof data === 'string') {
            data = new TextEncoder().encode(data);
        }

        try {
            const cryptoKey = await window.crypto.subtle.importKey(
                "raw",
                key,
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign"]
            );

            const signature = await window.crypto.subtle.sign(
                "HMAC",
                cryptoKey,
                data
            );

            return new Uint8Array(signature);
        } catch (error) {
            console.error("HMAC error:", error, "Key type:", typeof key, "Key length:", key?.length);
            throw error;
        }
    }

    /**
     * Ratchet the chain key forward to generate the next chain key
     * @param {ArrayBuffer} chainKey - Current chain key
     * @returns {Promise<ArrayBuffer>} - Next chain key
     */
    async deriveMessageKey(chainKey) {
        // Check if chainKey is valid
        if (!chainKey || !(chainKey instanceof ArrayBuffer)) {
            console.error("[Session] Invalid chain key:", chainKey);
            throw new Error("Invalid chain key format");
        }

        // Ensure chainKey is an ArrayBuffer
        let chainKeyBuffer = chainKey;
        if (!(chainKey instanceof ArrayBuffer)) {
            // Handle conversion if needed
            if (typeof chainKey === 'string') {
                chainKeyBuffer = base64ToArrayBuffer(chainKey);
            } else if (chainKey.buffer instanceof ArrayBuffer) {
                // TypedArray case
                chainKeyBuffer = chainKey.buffer;
            }
        }

        const messageKey = await this.hmacSha256(chainKeyBuffer, new TextEncoder().encode("message_key"));
        return messageKey.buffer; // Make sure to return as ArrayBuffer
    }

    /**
     * Derive an initial chain key from the root key
     * when we don't have the other party's ratchet key yet
     * @param {ArrayBuffer} rootKey - The root key from X3DH
     * @returns {Promise<ArrayBuffer>} - Derived initial chain key
     */
    async deriveInitialChainKey(rootKey) {
      // Use HKDF to derive an initial chain key from the root key
      const derivedKeys = await window.libsignal.HKDF.deriveSecrets(
        rootKey,
        new Uint8Array(32).buffer, // Zero salt
        new TextEncoder().encode("InitialChainKey").buffer,
        32  // 32 bytes for chain key
      );

      // HKDF.deriveSecrets returns an array of keys, take the first one
      return derivedKeys[0];
    }

    /**
     * Encrypt a message for the contact
     * @param {string} plaintext - Message to encrypt
     * @returns {Promise<Object>} - Encrypted message with metadata
     */
    async encrypt(plaintext) {
      if (!this.initialized) throw new Error('Session not initialized');

      // 1) Ratchet DH si nécessaire
      if (!this.CKs) {
        if (!this.DHr) {
          this.CKs = await this.deriveInitialChainKey(this.RK);
        } else {
          const sharedSecret = await window.libsignal.Curve.calculateAgreement(
            this.DHr, this.DHs.privKey
          );
          const derived = await window.libsignal.HKDF.deriveSecrets(
            sharedSecret,
            this.RK,
            new TextEncoder().encode("DoubleRatchetInit").buffer,
            64
          );
          if (Array.isArray(derived)) {
            [ this.RK, this.CKs /*, this.CKr */ ] = derived;
          } else {
            const all = new Uint8Array(derived);
            this.RK  = all.slice(0,32).buffer;
            this.CKs = all.slice(32,64).buffer;
          }
        }
      }

      // 2) Dériver la message key & avancer le chain key
      const messageKey = await this.deriveMessageKey(this.CKs);
      this.CKs = await this.ratchetChainKey(this.CKs);

      // 3) Générer IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // 4) Encrypt AES‑GCM
      const aesKey = await crypto.subtle.importKey(
        "raw", messageKey,
        { name: "AES-GCM" },
        false, ["encrypt"]
      );
      const ctBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(plaintext)
      );

      // 5) Signer le ciphertext en HMAC‑SHA256
      const macKey = await crypto.subtle.importKey(
        "raw", messageKey,
        { name: "HMAC", hash: { name: "SHA-256" } },
        false, ["sign"]
      );
      const macBuffer = await crypto.subtle.sign(
        "HMAC", macKey, ctBuffer
      );

      // 6) Construire le message
      const msg = {
        header: {
          dh: arrayBufferToBase64(this.DHs.pubKey),
          n:  this.Ns,
          pn: this.PN
        },
        ciphertext: arrayBufferToBase64(ctBuffer),
        iv:         arrayBufferToBase64(iv),
        mac:        arrayBufferToBase64(macBuffer)
      };

      this.debugRootKey();

      this.Ns++;
      return msg;
    }


    /**
     * Decrypt a message from the contact
     * @param {Object} encryptedMessage - Message with header and ciphertext
     * @returns {Promise<string>} - Decrypted message text
     */
    async decrypt(encryptedMessage) {
        if (!this.initialized) {
            throw new Error("Session not initialized");
        }

        const {header, ciphertext, iv} = encryptedMessage;
        const {dh, n} = header;

        // Convert from base64
        const theirDH = base64ToArrayBuffer(dh);
        const ciphertextData = base64ToArrayBuffer(ciphertext);
        const ivData = base64ToArrayBuffer(iv);

        // Update ratchet state if the DH key has changed
        if (!this.DHr || !this.arrayBuffersEqual(this.DHr, theirDH)) {
            // This is where the responder gets the initiator's key!
            this.DHr = theirDH;

            // If you're receiving your first message, perform ratchet step
            if (!this.CKr) {
                await this.ratchetStep();
            }
        }

        // Try to decrypt - first check if we've already processed this message
          const messageKey = await this.getMessageKey(n);

          if (!messageKey) {
            throw new Error("Failed to retrieve message key");
          }

          // Decrypt message
          const key = await crypto.subtle.importKey(
            'raw', messageKey, {name: 'AES-GCM'}, false, ['decrypt']
          );

          const decrypted = await crypto.subtle.decrypt(
            {name: 'AES-GCM', iv: ivData},
            key,
            ciphertextData
          );

          this.debugRootKey(); // Print RK before using it

          return new TextDecoder().decode(decrypted);
       }


        /** Get the message key for a specific message number
         * @param {number} messageNumber - Message number to get key for
         * @returns {Promise<ArrayBuffer>} - Message key
         */
        async getMessageKey(messageNumber) {
          // Check if message is from the current receiving chain
          if (messageNumber >= this.Nr) {
            // Skip ahead in the chain to generate the message key
            let messageKey;
            let currentCKr = this.CKr;

            for (let i = this.Nr; i <= messageNumber; i++) {
              messageKey = await this.deriveMessageKey(currentCKr);

              // Store skipped keys
              if (i < messageNumber) {
                const keyId = `${arrayBufferToBase64(this.DHr)}:${i}`;
                this.skippedMessageKeys.set(keyId, messageKey);
              }

              // Advance chain key
              currentCKr = await this.ratchetChainKey(currentCKr);
            }

            // Update chain state
            this.CKr = currentCKr;
            this.Nr = messageNumber + 1;

            return messageKey;
          } else {
            // Check for out-of-order message
            const keyId = `${arrayBufferToBase64(this.DHr)}:${messageNumber}`;
            const skippedKey = this.skippedMessageKeys.get(keyId);

            if (skippedKey) {
              this.skippedMessageKeys.delete(keyId);
              return skippedKey;
            }

            throw new Error("Message key not found");
          }
        }

    /**
     * Compare two ArrayBuffers for equality
     * @param {ArrayBuffer} buf1 - First buffer
     * @param {ArrayBuffer} buf2 - Second buffer
     * @returns {boolean} - Whether buffers are equal
     */
    arrayBuffersEqual(buf1, buf2) {
      if (buf1.byteLength !== buf2.byteLength) return false;

      const view1 = new Uint8Array(buf1);
      const view2 = new Uint8Array(buf2);

      for (let i = 0; i < view1.length; i++) {
        if (view1[i] !== view2[i]) return false;
      }

      return true;
    }

    /**
     * Derive a message key from a chain key
     * @param {ArrayBuffer} chainKey - Chain key to derive from
     * @returns {Promise<ArrayBuffer>} - Derived message key
     */
    async ratchetChainKey(chainKey) {
      const info = new TextEncoder().encode("chain").buffer;
      const hmacResult = await this.hmacSha256(chainKey, info);
      return hmacResult;
    }

    /**
     * Serialize the session for storage
     * @returns {Object} - Serialized session
     */
    serialize() {
        return {
            contactEmail: this.contactEmail,
            sessionId: this.sessionId,
            contactSignedPrekey : this.contactSignedPrekey,
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


    /**
     * Debug helper to safely print the RK value
     */
    debugRootKey() {
        console.log("===== ROOT KEY DEBUG =====");
        console.log("RK type:", typeof this.RK);

        if (this.RK === null) {
            console.log("RK is null");
            return;
        }

        if (this.RK instanceof ArrayBuffer) {
            console.log("RK is ArrayBuffer of length:", this.RK.byteLength);
            // Convert to hex for visualization
            const view = new Uint8Array(this.RK);
            const hex = Array.from(view).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log("RK as hex:", hex);
            console.log("RK as base64:", arrayBufferToBase64(this.RK));
        } else if (typeof this.RK === 'string') {
            console.log("RK is string:", this.RK.substring(0, 20) + (this.RK.length > 20 ? "..." : ""));
        } else if (this.RK.buffer instanceof ArrayBuffer) {
            console.log("RK is TypedArray with buffer length:", this.RK.buffer.byteLength);
        } else {
            console.log("RK is object:", this.RK);
            try {
                console.log("RK stringify attempt:", JSON.stringify(this.RK).substring(0, 100));
            } catch (e) {
                console.log("RK cannot be stringified:", e.message);
            }
        }
        console.log("=========================");
    }

    /**
     * One‑round handshake for the initiator.
     * @param {ArrayBuffer} sharedSecret      – X3DH output
     * @param {ArrayBuffer} initiatorEphemeralPriv  – YOUR X3DH ephemeral private key
     * @param {ArrayBuffer} responderRatchetPub     – the key you get in ratchet_response
     */
    async initializeHandshake(
      sharedSecret,
      initiatorEphemeralPriv,
      responderRatchetPub
    ) {
      if (!sharedSecret || !initiatorEphemeralPriv || !responderRatchetPub) {
        throw new Error("Need shared secret, your ephemeral priv, and their ratchet pub");
      }

      // 1) seed salt = sharedSecret
      this.RK = sharedSecret;

      // 2) compute the handshake DH
      const handshakeSecret = await window.libsignal.Curve.calculateAgreement(
        responderRatchetPub,
        initiatorEphemeralPriv
      );

      // 3) derive new RK, CKs, CKr just like ratchetStep() does
      const info = new TextEncoder().encode("derived_keys").buffer;
      const derived = await window.libsignal.HKDF.deriveSecrets(
        handshakeSecret,
        this.RK,      // salt
        info,
        96           // 32 bytes RK + 32 CKs + 32 CKr
      );

      // 4) pull them out
      if (Array.isArray(derived)) {
        [ this.RK, this.CKs, this.CKr ] = derived;
      } else {
        const buf = new Uint8Array(derived);
        this.RK  = buf.slice(0,  32).buffer;
        this.CKs = buf.slice(32, 64).buffer;
        this.CKr = buf.slice(64, 96).buffer;
      }

      // 5) record their ratchet pub for future receive‑chain use
      this.DHr = responderRatchetPub;

      this.initialized = true;
      return this.serialize();
    }
}

export { Session };