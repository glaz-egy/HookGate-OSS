function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importAesKey(rawKey) {
  const encoded = new TextEncoder().encode(rawKey);
  const material = encoded.length === 32 ? encoded : new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptString(plainText, rawKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(rawKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plainText)
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptString(cipherText, rawKey) {
  const [ivText, encryptedText] = cipherText.split(".");
  if (!ivText || !encryptedText) {
    throw new Error("invalid encrypted value.");
  }

  const key = await importAesKey(rawKey);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText) },
    key,
    fromBase64(encryptedText)
  );
  return new TextDecoder().decode(decrypted);
}
