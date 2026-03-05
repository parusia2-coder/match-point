import { webcrypto } from 'node:crypto';
const crypto = webcrypto;

const password = 'admin1234';
const saltArr = Array.from(crypto.getRandomValues(new Uint8Array(16)));
const salt = saltArr.map(b => b.toString(16).padStart(2, '0')).join('');

const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
);
const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
);
const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');

console.log('HASH:', hash);
console.log('SALT:', salt);
console.log(`SQL: UPDATE admin_accounts SET password_hash = '${hash}', password_salt = '${salt}' WHERE username = 'papamama';`);
