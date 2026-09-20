import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Hash a plain text PIN using scrypt with a random 16-byte salt.
 * Output format: "salt_hex:derived_key_hex"
 */
export function hashPin(pin: string): string {
  if (!pin || typeof pin !== 'string') {
    throw new Error('PIN must be a non-empty string')
  }
  const cleanPin = pin.trim()
  const salt = randomBytes(16).toString('hex')
  const derivedKey = scryptSync(cleanPin, salt, 64)
  return `${salt}:${derivedKey.toString('hex')}`
}

/**
 * Verifies a plain text PIN against a stored "salt:derived_key" scrypt hash.
 * Timing-safe to prevent side-channel timing attacks.
 */
export function verifyPin(pin: string, storedHash?: string | null): boolean {
  if (!pin || !storedHash || typeof pin !== 'string' || typeof storedHash !== 'string') {
    return false
  }

  const cleanPin = pin.trim()
  const parts = storedHash.split(':')
  if (parts.length !== 2) {
    return false
  }

  const [salt, keyHex] = parts
  if (!salt || !keyHex) {
    return false
  }

  try {
    const keyBuffer = Buffer.from(keyHex, 'hex')
    const derivedKey = scryptSync(cleanPin, salt, 64)
    if (keyBuffer.length !== derivedKey.length) {
      return false
    }
    return timingSafeEqual(keyBuffer, derivedKey)
  } catch {
    return false
  }
}
