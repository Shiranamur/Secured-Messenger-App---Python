// Server/static/js/Dashboard/DoubleRatchet/session.js
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../KeyStorage.js';


/**
 * Session class for Double Ratchet protocol
 */
class Session {
    /**
     * Create a new Double Ratchet session
     * @param {string} contactEmail - Email of the contact
     */
    constructor(contactEmail) {
        this.contactEmail = contactEmail;
        this.sessionId = contactEmail;

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
     * Split a chain key into [nextChainKey ∥ messageKey],
     * store nextChainKey into CKs or CKr, and return messageKey.
     *
     * @param {ArrayBuffer} chainKey      — current send‑ or recv‑chain key
     * @param {boolean}   receiving=false — pass true when decrypting
     * @returns {Promise<ArrayBuffer>}    — the 32‑byte message key
     */
    async deriveMessageKey(chainKey, receiving = false) {
      const info = new TextEncoder().encode("DoubleRatchet_MessageKeys").buffer;
      const salt = new Uint8Array(32).buffer;          // 32‑byte zero salt
      // Derive 64 bytes: 32B nextCK ∥ 32B msgK
      const out = await window.libsignal.HKDF.deriveSecrets(
        chainKey,
        salt,
        info,
        64
      );

      // Split
      let nextCK, msgK;
      if (Array.isArray(out)) {
        [ nextCK, msgK ] = out;
      } else {
        const buf = new Uint8Array(out);
        nextCK  = buf.slice(0,32).buffer;
        msgK    = buf.slice(32,64).buffer;
      }

      // Advance the correct chain
      if (receiving) {
        this.CKr = nextCK;
      } else {
        this.CKs = nextCK;
      }

      return msgK;
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
        if (plaintext === undefined || plaintext === null) {
            throw new Error('Cannot encrypt undefined or null plaintext');
        }

        // Convert non-string inputs to strings
        if (typeof plaintext !== 'string') {
            plaintext = String(plaintext);
        }
        if (!this.initialized) throw new Error("Session not initialized");

        // 1) Ensure the send-chain is seeded exactly once from the root
        if (!this.CKs && this.DHr) {
            await this.ratchetStep();
        }
        if (!this.CKs) {
            this.CKs = await this.deriveInitialChainKey(this.RK);
        }

        // 2) Derive+advance the message key via our single helper
        const messageKey = await this.deriveMessageKey(this.CKs /*, false*/);
        console.log("outgoing MK:", arrayBufferToBase64(messageKey))

        // 3) Generate IV
        const iv = crypto.getRandomValues(new Uint8Array(12));


        // 4) Encrypt AES‑GCM
        const aesKey = await crypto.subtle.importKey(
            "raw", messageKey,
            {name: "AES-GCM"},
            false, ["encrypt"]
        );
        const ctBuffer = await crypto.subtle.encrypt(
            {name: "AES-GCM", iv},
            aesKey,
            new TextEncoder().encode(plaintext)
        );

        // 5) Signer le ciphertext en HMAC‑SHA256
        const macKey = await crypto.subtle.importKey(
            "raw", messageKey,
            {name: "HMAC", hash: {name: "SHA-256"}},
            false, ["sign"]
        );
        const macBuffer = await crypto.subtle.sign(
            "HMAC", macKey, ctBuffer
        );

        // 6) Construire le message
        const msg = {
            header: {
                dh: arrayBufferToBase64(this.DHs.pubKey),
                n: this.Ns,
                pn: this.PN
            },
            ciphertext: arrayBufferToBase64(ctBuffer),
            iv: arrayBufferToBase64(iv),
            mac: arrayBufferToBase64(macBuffer)
        };

        this.debugRootKey();

        this.Ns++;
        return msg;
    }

    /**
     * Decrypt a message from the contact
     * @param {Object} encryptedMessage - { header: { dh, n, pn }, ciphertext, iv, mac }
     * @returns {Promise<string>} - Decrypted plaintext
     */
    async decrypt(encryptedMessage) {
      if (!this.initialized) {
        throw new Error("Session not initialized");
      }

      const { header, ciphertext, iv, mac } = encryptedMessage;
      const { dh, n } = header;

      // 1) Decode all the Base64 inputs
      const theirDH        = base64ToArrayBuffer(dh);
      const ciphertextData = base64ToArrayBuffer(ciphertext);
      const ivData         = base64ToArrayBuffer(iv);
      const macData        = base64ToArrayBuffer(mac);

      // 2) DH‑ratchet if this is the first incoming message or if DH changed
      const dhChanged = !this.DHr || !this.arrayBuffersEqual(this.DHr, theirDH);
      if (!this.CKr || dhChanged) {
        this.DHr = theirDH;
        await this.ratchetStep();
        console.debug("[Session] Ran ratchet in decrypt(); CKr is now ready");
      }

      // 3) Derive (and advance) the correct message key for index n
      const messageKey = await this.getMessageKey(n);
      console.log("incoming MK:", arrayBufferToBase64(messageKey));

      // 4) (Optional) Verify HMAC before decryption
      //    You can import `messageKey` as HMAC key and do subtle.verify(...)
      //    If it fails, throw early.

      // 5) AES‑GCM decrypt
      const aesKey = await crypto.subtle.importKey(
        "raw", messageKey,
        { name: "AES-GCM" },
        false, ["decrypt"]
      );

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivData },
        aesKey,
        ciphertextData
      );

      this.debugRootKey(); // for debugging

      // 6) Return UTF‑8 plaintext
      return new TextDecoder().decode(decryptedBuffer);
    }


        /** Get the message key for a specific message number
         * @param {number} messageNumber - Message number to get key for
         * @returns {Promise<ArrayBuffer>} - Message key
         */
        async getMessageKey(messageNumber) {
          if (messageNumber >= this.Nr) {
            let messageKey;
            // we’ll advance currentCKr in place
            for (let i = this.Nr; i <= messageNumber; i++) {
              // deriveMessageKey returns the MK _and_ updates this.CKr internally
              messageKey = await this.deriveMessageKey(this.CKr, true);

              // if we’re skipping ahead, stash the earlier keys
              if (i < messageNumber) {
                const keyId = `${arrayBufferToBase64(this.DHr)}:${i}`;
                this.skippedMessageKeys.set(keyId, messageKey);
              }
            }

            // now Nr jumps past the delivered message
            this.Nr = messageNumber + 1;
            return messageKey;
          } else {
            // out‑of‑order lookup
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
     * Serialize the session for storage
     * @returns {Object} - Serialized session
     */
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
}

export { Session };