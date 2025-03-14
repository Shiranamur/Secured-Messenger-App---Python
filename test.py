from axolotl.kdf.hkdfv3 import HKDFv3
from axolotl.ecc.curve import Curve
from axolotl.util.byteutil import ByteUtil
from Crypto.Cipher import AES
import os

# Génération des clés DH pour Alice et Bob
alice_private_key, alice_public_key = Curve.generateKeyPair()
print(f"APrK:{alice_private_key},APuK: {alice_public_key}")
bob_private_key, bob_public_key = Curve.generateKeyPair()
print(f"BPrK:{bob_private_key},BPuK: {bob_public_key}")

# Échange de clés publiques (dans une application réelle, cela se ferait via le réseau)
alice_shared_secret = Curve.calculateAgreement(alice_private_key, bob_public_key)
bob_shared_secret = Curve.calculateAgreement(bob_private_key, alice_public_key)

# Vérification que les secrets partagés sont identiques
assert alice_shared_secret == bob_shared_secret

# Dérivation de la clé racine (root key) à partir du secret partagé
root_key = HKDFv3().deriveSecrets(alice_shared_secret, b'root key', b'')

# Dérivation de la clé de chaîne initiale
chain_key = root_key[:32]

# Fonction pour dériver une clé de message à partir de la clé de chaîne
def derive_message_key(chain_key):
    hkdf = HKDFv3()
    message_key = hkdf.deriveSecrets(chain_key, b'message key', b'')
    new_chain_key = hkdf.deriveSecrets(chain_key, b'chain key', b'')
    return message_key[:32], new_chain_key[:32]

# Alice envoie un message à Bob
message = b'Hello, Bob!'
message_key, new_chain_key = derive_message_key(chain_key)

# Chiffrement du message avec AES
cipher = AES.new(message_key, AES.MODE_GCM)
ciphertext, tag = cipher.encrypt_and_digest(message)

# Mise à jour de la clé de chaîne après l'envoi
chain_key = new_chain_key

# Bob reçoit et déchiffre le message
cipher = AES.new(message_key, AES.MODE_GCM, nonce=cipher.nonce)
decrypted_message = cipher.decrypt_and_verify(ciphertext, tag)

print("Decrypted message:", decrypted_message.decode())
