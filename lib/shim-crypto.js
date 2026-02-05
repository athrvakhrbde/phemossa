/**
 * Browser shim for Node's 'crypto' module.
 * Exporting null ensures @noble/ed25519 uses globalThis.crypto (Web Crypto API) instead.
 */
module.exports = null;
