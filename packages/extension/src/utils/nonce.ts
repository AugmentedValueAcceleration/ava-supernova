import crypto from 'crypto';

export function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}
