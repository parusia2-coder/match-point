const { webcrypto } = require('crypto');
const crypto = webcrypto;

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const hashObj = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    const hash = Buffer.from(hashObj).toString('hex');
    const saltHex = Buffer.from(salt).toString('hex');
    console.log(`HASH: ${hash}`);
    console.log(`SALT: ${saltHex}`);
}

hashPassword("123456");
