import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { COMPANY_KIND, type Company, type Invoice } from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventByAddress } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { getSiblingEventIdsForDeletion } from '@/lib/relayDeletion';
import { logger } from '@/lib/logger';
import { runWithConcurrencyLimit } from '@/lib/utils';

// Encrypted content marker
const ENCRYPTED_MARKER = 'nip44:';

// Helper to get tag value
function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

// Helper to parse invoice tags
// Format: ["invoice", "<url>", "<date>", "<amount>", "<description>"]
function parseInvoiceTags(event: NostrEvent): Invoice[] {
  return event.tags
    .filter(([name]) => name === 'invoice')
    .map(tag => ({
      url: tag[1] || '',
      date: tag[2] || '',
      amount: tag[3] || undefined,
      description: tag[4] || undefined,
    }))
    .filter(inv => inv.url && inv.date);
}

// Data stored in encrypted content
type CompanyData = Omit<Company, 'id' | 'pubkey' | 'createdAt'>;

// Parse a Nostr event into a Company object (plaintext version)
function parseCompanyPlaintext(event: NostrEvent): Company | null {
  const id = getTagValue(event, 'd');
  const name = getTagValue(event, 'name');
  const serviceType = getTagValue(event, 'service_type');

  if (!id || !name || !serviceType) return null;

  const ratingStr = getTagValue(event, 'rating');

  return {
    id,
    serviceType,
    name,
    contactName: getTagValue(event, 'contact_name'),
    phone: getTagValue(event, 'phone'),
    email: getTagValue(event, 'email'),
    website: getTagValue(event, 'website'),
    address: getTagValue(event, 'address'),
    city: getTagValue(event, 'city'),
    state: getTagValue(event, 'state'),
    zipCode: getTagValue(event, 'zip_code'),
    licenseNumber: getTagValue(event, 'license_number'),
    insuranceInfo: getTagValue(event, 'insurance_info'),
    acceptsBitcoin: getTagValue(event, 'accepts_bitcoin') === 'true',
    invoices: parseInvoiceTags(event),
    rating: ratingStr ? parseInt(ratingStr, 10) : undefined,
    notes: getTagValue(event, 'notes'),
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted company from content
async function parseCompanyEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<CompanyData>
): Promise<Company | null> {
  const id = getTagValue(event, 'd');
  if (!id) return null;

  try {
    const data = await decryptFn(event.content);
    return {
      id,
      ...data,
      pubkey: event.pubkey,
      createdAt: event.created_at,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    logger.error('[Companies] Failed to decrypt company');
    return null;
  }
}

// Extract deleted company IDs from kind 5 events
function getDeletedCompanyIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const deletedIds = new Set<string>();

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'a') {
        // Parse "kind:pubkey:d-tag" format
        const parts = tag[1].split(':');
        if (parts.length >= 3 && parts[0] === String(COMPANY_KIND) && parts[1] === pubkey) {
          deletedIds.add(parts[2]);
        }
      }
    }
  }

  return deletedIds;
}

// Parse events into companies
async function parseEventsToCompanies(
  events: NostrEvent[],
  pubkey: string,
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<Company[]> {
  // Separate company events from deletion events
  const companyEvents = events.filter(e => e.kind === COMPANY_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted company IDs
  const deletedIds = getDeletedCompanyIds(deletionEvents, pubkey);

  const results = await runWithConcurrencyLimit(
    companyEvents,
    decryptConcurrency,
    async (event): Promise<Company | null> => {
      const id = getTagValue(event, 'd');
      if (!id || deletedIds.has(id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseCompanyEncrypted(event, (content) => decryptForCategory<CompanyData>(content));
      }
      return parseCompanyPlaintext(event);
    }
  );

  return results.filter((c): c is Company => c != null).sort((a, b) => b.createdAt - a.createdAt);
}

export function useCompanies() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  // Main query - loads from cache only
  // Background sync is handled centrally by useDataSyncStatus
  const query = useQuery({
    queryKey: ['companies', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];

      // Load from cache (populated by useDataSyncStatus)
      const cachedEvents = await getCachedEvents([COMPANY_KIND, 5], user.pubkey);
      
      if (cachedEvents.length > 0) {
        const companies = await parseEventsToCompanies(
          cachedEvents,
          user.pubkey,
          decryptForCategory,
          decryptConcurrency,
        );
        return companies;
      }

      return [];
    },
    enabled: !!user?.pubkey,
    staleTime: Infinity, // Data comes from IndexedDB cache, no need to refetch
    gcTime: Infinity, // Keep in memory for the session
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch when component remounts - use cached data
  });

  return query;
}

export function useCompanyById(id: string | undefined) {
  const { data: companies } = useCompanies();
  return companies?.find(c => c.id === id);
}

export function useCompanyActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createCompany = async (data: Omit<Company, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const id = crypto.randomUUID();
    const useEncryption = isEncryptionEnabled('companies');

    // Base tags (always included)
    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log company data' : `Company: ${data.name}`],
    ];

    let content = '';

    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('companies')) {
      content = await encryptForCategory('companies', data);
      dualPublish = { plainContent: JSON.stringify(data) };
    } else {
      // Store data in plaintext tags
      tags.push(['name', data.name]);
      tags.push(['service_type', data.serviceType]);
      
      if (data.contactName) tags.push(['contact_name', data.contactName]);
      if (data.phone) tags.push(['phone', data.phone]);
      if (data.email) tags.push(['email', data.email]);
      if (data.website) tags.push(['website', data.website]);
      if (data.address) tags.push(['address', data.address]);
      if (data.city) tags.push(['city', data.city]);
      if (data.state) tags.push(['state', data.state]);
      if (data.zipCode) tags.push(['zip_code', data.zipCode]);
      if (data.licenseNumber) tags.push(['license_number', data.licenseNumber]);
      if (data.insuranceInfo) tags.push(['insurance_info', data.insuranceInfo]);
      if (data.acceptsBitcoin) tags.push(['accepts_bitcoin', 'true']);
      if (data.rating !== undefined) tags.push(['rating', String(data.rating)]);
      if (data.notes) tags.push(['notes', data.notes]);

      // Add invoice tags
      if (data.invoices && data.invoices.length > 0) {
        for (const invoice of data.invoices) {
          const invoiceTag = ['invoice', invoice.url, invoice.date];
          if (invoice.amount) invoiceTag.push(invoice.amount);
          if (invoice.description) invoiceTag.push(invoice.description);
          tags.push(invoiceTag);
        }
      }
    }

    const event = await publishEvent({
      kind: COMPANY_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after creating a company
    await queryClient.refetchQueries({ queryKey: ['companies', user.pubkey] });

    return id;
  };

  const updateCompany = async (id: string, data: Omit<Company, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('companies');

    // Base tags (always included)
    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log company data' : `Company: ${data.name}`],
    ];

    let content = '';

    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('companies')) {
      content = await encryptForCategory('companies', data);
      dualPublish = { plainContent: JSON.stringify(data) };
    } else {
      // Store data in plaintext tags
      tags.push(['name', data.name]);
      tags.push(['service_type', data.serviceType]);
      
      if (data.contactName) tags.push(['contact_name', data.contactName]);
      if (data.phone) tags.push(['phone', data.phone]);
      if (data.email) tags.push(['email', data.email]);
      if (data.website) tags.push(['website', data.website]);
      if (data.address) tags.push(['address', data.address]);
      if (data.city) tags.push(['city', data.city]);
      if (data.state) tags.push(['state', data.state]);
      if (data.zipCode) tags.push(['zip_code', data.zipCode]);
      if (data.licenseNumber) tags.push(['license_number', data.licenseNumber]);
      if (data.insuranceInfo) tags.push(['insurance_info', data.insuranceInfo]);
      if (data.acceptsBitcoin) tags.push(['accepts_bitcoin', 'true']);
      if (data.rating !== undefined) tags.push(['rating', String(data.rating)]);
      if (data.notes) tags.push(['notes', data.notes]);

      // Add invoice tags
      if (data.invoices && data.invoices.length > 0) {
        for (const invoice of data.invoices) {
          const invoiceTag = ['invoice', invoice.url, invoice.date];
          if (invoice.amount) invoiceTag.push(invoice.amount);
          if (invoice.description) invoiceTag.push(invoice.description);
          tags.push(invoiceTag);
        }
      }
    }

    const event = await publishEvent({
      kind: COMPANY_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after updating a company
    await queryClient.refetchQueries({ queryKey: ['companies', user.pubkey] });
  };

  const deleteCompany = async (id: string) => {
    if (!user) throw new Error('Must be logged in');

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const siblingIds =
      privateRelayUrls.length > 0 || publicRelayUrls.length > 0
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            COMPANY_KIND,
            user.pubkey,
            { dTag: id },
            AbortSignal.timeout(5000)
          )
        : [];

    const tags: string[][] = [['a', `${COMPANY_KIND}:${user.pubkey}:${id}`]];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted company',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventByAddress(COMPANY_KIND, user.pubkey, id);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    await queryClient.refetchQueries({ queryKey: ['companies'] });
  };

  return { createCompany, updateCompany, deleteCompany };
}
