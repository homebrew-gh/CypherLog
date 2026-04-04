import { useCallback } from 'react';
import { useNostrLogin } from '@nostrify/react/login';
import { useCurrentUser } from './useCurrentUser';
import { useEncryptionSettings, type EncryptableCategory } from '@/contexts/EncryptionContext';
import { DECRYPT_CONCURRENCY } from '@/lib/utils';
import { logger } from '@/lib/logger';

/**
 * Marker prefix for encrypted content
 * Helps identify if content is NIP-44 encrypted vs plaintext
 */
const ENCRYPTED_MARKER = 'nip44:';

/** True if the error is from a cancelled operation (e.g. React Query abort, unmount). */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && /signal has been aborted|aborted/i.test(error.message)) return true;
  return false;
}

/**
 * Error thrown when encryption is required but unavailable or fails
 * This prevents silent fallback to plaintext storage
 */
export class EncryptionUnavailableError extends Error {
  constructor(reason: 'no_nip44_support' | 'encryption_failed', originalError?: unknown) {
    const messages = {
      no_nip44_support: 'Your signer does not support NIP-44 encryption. Please upgrade your signer extension (Alby, nos2x, etc.) to a version that supports NIP-44, or disable encryption for this data category in Settings.',
      encryption_failed: 'Failed to encrypt data. Your data will NOT be stored to protect your privacy. Please try again or check your signer extension.',
    };
    super(messages[reason]);
    this.name = 'EncryptionUnavailableError';
    this.reason = reason;
    this.originalError = originalError;
  }
  
  reason: 'no_nip44_support' | 'encryption_failed';
  originalError?: unknown;
}

/**
 * Hook for encrypting and decrypting data using NIP-44
 * Encrypts data to self (user's own pubkey) for private storage
 * 
 * SECURITY: This hook will throw EncryptionUnavailableError instead of
 * silently falling back to plaintext. Callers must handle this error
 * and inform users appropriately.
 */
export function useEncryption() {
  const { user } = useCurrentUser();
  const { isEncryptionEnabled } = useEncryptionSettings();

  /**
   * Check if the signer supports NIP-44 encryption
   */
  const hasNip44Support = useCallback((): boolean => {
    return !!user?.signer?.nip44;
  }, [user]);

  /**
   * Encrypt data to self using NIP-44
   * Returns the encrypted string with a marker prefix
   * 
   * @throws {EncryptionUnavailableError} When NIP-44 is not available or encryption fails
   */
  const encryptToSelf = useCallback(async (plaintext: string): Promise<string> => {
    if (!user?.signer?.nip44) {
      logger.warn('[Encryption] NIP-44 not available - blocking plaintext storage');
      throw new EncryptionUnavailableError('no_nip44_support');
    }

    try {
      // Encrypt to self (own pubkey)
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, plaintext);
      return ENCRYPTED_MARKER + encrypted;
    } catch (error) {
      logger.error('[Encryption] Failed to encrypt:', error);
      // SECURITY: Do NOT fall back to plaintext - throw error instead
      throw new EncryptionUnavailableError('encryption_failed', error);
    }
  }, [user]);

  /**
   * Decrypt data that was encrypted to self
   * Handles both encrypted and plaintext content gracefully
   */
  const decryptFromSelf = useCallback(async (content: string): Promise<string> => {
    // Check if content is encrypted
    if (!content.startsWith(ENCRYPTED_MARKER)) {
      // Content is plaintext, return as-is
      return content;
    }

    if (!user?.signer?.nip44) {
      logger.warn('[Encryption] NIP-44 not available, cannot decrypt');
      throw new Error('NIP-44 decryption not available. Please use a signer that supports NIP-44 encryption.');
    }

    try {
      const encryptedData = content.slice(ENCRYPTED_MARKER.length);
      const decrypted = await user.signer.nip44.decrypt(user.pubkey, encryptedData);
      return decrypted;
    } catch (error) {
      if (isAbortError(error)) throw error;
      logger.error('[Encryption] Failed to decrypt:', error);
      throw new Error('Failed to decrypt content. The data may be corrupted or encrypted with a different key.');
    }
  }, [user]);

  /**
   * Encrypt a JSON object for storage
   */
  const encryptJson = useCallback(async <T>(data: T): Promise<string> => {
    const jsonString = JSON.stringify(data);
    return encryptToSelf(jsonString);
  }, [encryptToSelf]);

  /**
   * Decrypt and parse a JSON object
   * @throws Error if decryption or JSON parsing fails
   */
  const decryptJson = useCallback(async <T>(content: string): Promise<T> => {
    const decrypted = await decryptFromSelf(content);
    try {
      return JSON.parse(decrypted) as T;
    } catch (error) {
      if (isAbortError(error)) throw error;
      logger.error('[Encryption] Failed to parse decrypted JSON');
      throw new Error('Failed to parse decrypted data. The content may be corrupted.');
    }
  }, [decryptFromSelf]);

  /**
   * Check if content appears to be encrypted
   */
  const isEncrypted = useCallback((content: string): boolean => {
    return content.startsWith(ENCRYPTED_MARKER);
  }, []);

  /**
   * Conditionally encrypt based on category settings
   */
  const encryptForCategory = useCallback(async <T>(
    category: EncryptableCategory,
    data: T
  ): Promise<string> => {
    if (isEncryptionEnabled(category) && hasNip44Support()) {
      return encryptJson(data);
    }
    // Return plaintext JSON if encryption is disabled or unavailable
    return JSON.stringify(data);
  }, [isEncryptionEnabled, hasNip44Support, encryptJson]);

  /**
   * Conditionally decrypt based on content format
   * Automatically handles both encrypted and plaintext content
   * @throws Error if decryption or JSON parsing fails
   */
  const decryptForCategory = useCallback(async <T>(
    content: string
  ): Promise<T> => {
    if (isEncrypted(content)) {
      return decryptJson<T>(content);
    }
    // Parse plaintext JSON with error handling
    try {
      return JSON.parse(content) as T;
    } catch {
      logger.error('[Encryption] Failed to parse plaintext JSON');
      throw new Error('Failed to parse data. The content may be malformed.');
    }
  }, [isEncrypted, decryptJson]);

  /**
   * Check if encryption should be used for a category
   */
  const shouldEncrypt = useCallback((category: EncryptableCategory): boolean => {
    return isEncryptionEnabled(category) && hasNip44Support();
  }, [isEncryptionEnabled, hasNip44Support]);

  return {
    hasNip44Support,
    encryptToSelf,
    decryptFromSelf,
    encryptJson,
    decryptJson,
    isEncrypted,
    encryptForCategory,
    decryptForCategory,
    shouldEncrypt,
  };
}

/**
 * Amber NIP-55 decrypt uses one Activity result channel; keep a single in-flight decrypt
 * from application code in addition to the native serial queue in `amberAndroidSigner`.
 */
export function useDecryptConcurrency(): number {
  const { logins } = useNostrLogin();
  return logins[0]?.type === 'x-amber-android' ? 1 : DECRYPT_CONCURRENCY;
}
