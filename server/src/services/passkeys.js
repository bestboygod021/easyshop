import crypto from 'node:crypto';
import { all, nowIso, run, uid } from '../db/index.js';

/**
 * WebAuthn / Passkeys registration and challenge helpers.
 */

const challenges = new Map(); // userId -> { challenge, expiresAt }

export function generatePasskeyRegistrationOptions(user) {
  const challenge = crypto.randomBytes(32).toString('base64url');
  challenges.set(user.id, {
    challenge,
    expiresAt: Date.now() + 60_000,
  });

  return {
    challenge,
    rp: { name: 'EasyShop', id: 'localhost' },
    user: {
      id: Buffer.from(user.id).toString('base64url'),
      name: user.email,
      displayName: user.full_name || user.email,
    },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
    timeout: 60000,
    attestation: 'none',
  };
}

export function registerPasskeyCredential(userId, { credentialId, publicKey, deviceName }) {
  const id = credentialId || uid('cred');
  const now = nowIso();
  run(
    `INSERT INTO passkey_credentials (id, user_id, public_key, counter, device_name, created_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    id,
    userId,
    publicKey || 'mock_pubkey_bytes',
    deviceName || 'مرورگر کاربر',
    now,
  );
  return { success: true, credential_id: id };
}

export function getUserPasskeys(userId) {
  return all(
    'SELECT id, device_name, created_at FROM passkey_credentials WHERE user_id = ?',
    userId,
  );
}
