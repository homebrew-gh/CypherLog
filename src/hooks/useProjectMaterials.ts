import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { PROJECT_MATERIAL_KIND, PROJECT_KIND, type ProjectMaterial, type ExpenseCategory } from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventById } from '@/lib/eventCache';
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

// Data stored in encrypted content
type ProjectMaterialData = Omit<ProjectMaterial, 'id' | 'projectId' | 'pubkey' | 'createdAt'>;

// Parse a Nostr event into a ProjectMaterial object (plaintext version)
function parseProjectMaterialPlaintext(event: NostrEvent): ProjectMaterial | null {
  // Get the project reference from 'a' tag
  const aTag = event.tags.find(([name, value]) => 
    name === 'a' && value?.startsWith(`${PROJECT_KIND}:`)
  );
  if (!aTag) return null;

  // Parse project ID from 'a' tag (format: "kind:pubkey:d-tag")
  const parts = aTag[1].split(':');
  if (parts.length < 3) return null;
  const projectId = parts[2];

  const name = getTagValue(event, 'name');
  const totalPrice = getTagValue(event, 'total_price');
  const category = getTagValue(event, 'category') as ExpenseCategory;
  
  if (!projectId || !name || !totalPrice || !category) return null;

  const quantityStr = getTagValue(event, 'quantity');

  return {
    id: event.id,
    projectId,
    name,
    category,
    quantity: quantityStr ? parseFloat(quantityStr) : undefined,
    unit: getTagValue(event, 'unit'),
    unitPrice: getTagValue(event, 'unit_price'),
    totalPrice,
    estimatedPrice: getTagValue(event, 'estimated_price'),
    actualPrice: getTagValue(event, 'actual_price'),
    isPurchased: getTagValue(event, 'is_purchased') === 'true',
    purchasedDate: getTagValue(event, 'purchased_date'),
    vendor: getTagValue(event, 'vendor'),
    notes: getTagValue(event, 'notes'),
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted project material from content
async function parseProjectMaterialEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<ProjectMaterialData>
): Promise<ProjectMaterial | null> {
  // Get the project reference from 'a' tag
  const aTag = event.tags.find(([name, value]) => 
    name === 'a' && value?.startsWith(`${PROJECT_KIND}:`)
  );
  if (!aTag) return null;

  // Parse project ID from 'a' tag (format: "kind:pubkey:d-tag")
  const parts = aTag[1].split(':');
  if (parts.length < 3) return null;
  const projectId = parts[2];

  try {
    const data = await decryptFn(event.content);
    return {
      id: event.id,
      projectId,
      ...data,
      pubkey: event.pubkey,
      createdAt: event.created_at,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    logger.error('[ProjectMaterials] Failed to decrypt material');
    return null;
  }
}

// Extract deleted material IDs from kind 5 events
function getDeletedMaterialIds(deletionEvents: NostrEvent[]): Set<string> {
  const deletedIds = new Set<string>();

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'e') {
        deletedIds.add(tag[1]);
      }
    }
  }

  return deletedIds;
}

// Parse events into project materials
async function parseEventsToMaterials(
  events: NostrEvent[],
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<ProjectMaterial[]> {
  // Separate material events from deletion events
  const materialEvents = events.filter(e => e.kind === PROJECT_MATERIAL_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted material IDs
  const deletedIds = getDeletedMaterialIds(deletionEvents);

  const results = await runWithConcurrencyLimit(
    materialEvents,
    decryptConcurrency,
    async (event): Promise<ProjectMaterial | null> => {
      if (deletedIds.has(event.id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseProjectMaterialEncrypted(event, (content) => decryptForCategory<ProjectMaterialData>(content));
      }
      return parseProjectMaterialPlaintext(event);
    }
  );

  const categoryOrder = ['materials', 'labor', 'rentals', 'permits', 'tools', 'delivery', 'other'];
  return results.filter((m): m is ProjectMaterial => m != null).sort((a, b) => {
    const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    return a.name.localeCompare(b.name);
  });
}

export function useProjectMaterials(projectId?: string) {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  const query = useQuery({
    queryKey: ['project-materials', user?.pubkey, projectId],
    queryFn: async () => {
      if (!user?.pubkey || !projectId) {
        return [];
      }

      // Load from cache
      const cachedEvents = await getCachedEvents([PROJECT_MATERIAL_KIND, 5], user.pubkey);
      
      if (cachedEvents.length > 0) {
        const materials = await parseEventsToMaterials(
          cachedEvents,
          decryptForCategory,
          decryptConcurrency,
        );
        // Filter to only materials for this project
        return materials.filter(m => m.projectId === projectId);
      }

      return [];
    },
    enabled: !!user?.pubkey && !!projectId,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return query;
}

export function useProjectMaterialActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createMaterial = async (projectId: string, data: Omit<ProjectMaterial, 'id' | 'projectId' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('projects');

    // Base tags (always included)
    const tags: string[][] = [
      ['a', `${PROJECT_KIND}:${user.pubkey}:${projectId}`, '', 'project'],
      ['alt', useEncryption ? 'Encrypted project material' : `Material: ${data.name}`],
    ];

    let content = '';

    if (useEncryption && shouldEncrypt('projects')) {
      content = await encryptForCategory('projects', data);
    } else {
      tags.push(['name', data.name]);
      tags.push(['category', data.category]);
      tags.push(['total_price', data.totalPrice]);
      tags.push(['is_purchased', data.isPurchased ? 'true' : 'false']);
      if (data.quantity !== undefined) tags.push(['quantity', String(data.quantity)]);
      if (data.unit) tags.push(['unit', data.unit]);
      if (data.unitPrice) tags.push(['unit_price', data.unitPrice]);
      if (data.estimatedPrice) tags.push(['estimated_price', data.estimatedPrice]);
      if (data.actualPrice) tags.push(['actual_price', data.actualPrice]);
      if (data.purchasedDate) tags.push(['purchased_date', data.purchasedDate]);
      if (data.vendor) tags.push(['vendor', data.vendor]);
      if (data.notes) tags.push(['notes', data.notes]);
    }

    const event = await publishEvent({
      kind: PROJECT_MATERIAL_KIND,
      content,
      tags,
    });

    if (event) {
      await cacheEvents([event]);
    }

    await queryClient.refetchQueries({ queryKey: ['project-materials', user.pubkey] });

    return event?.id;
  };

  const updateMaterial = async (materialId: string, projectId: string, data: Omit<ProjectMaterial, 'id' | 'projectId' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    // Delete the old material
    await deleteMaterial(materialId);
    
    // Create a new one with updated data
    return await createMaterial(projectId, data);
  };

  const toggleMaterialPurchased = async (material: ProjectMaterial) => {
    if (!user) throw new Error('Must be logged in');

    const today = new Date();
    const formattedDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

    const updatedData = {
      name: material.name,
      category: material.category,
      quantity: material.quantity,
      unit: material.unit,
      unitPrice: material.unitPrice,
      totalPrice: material.totalPrice,
      estimatedPrice: material.estimatedPrice,
      actualPrice: material.actualPrice,
      isPurchased: !material.isPurchased,
      purchasedDate: !material.isPurchased ? formattedDate : undefined,
      vendor: material.vendor,
      notes: material.notes,
    };

    return await updateMaterial(material.id, material.projectId, updatedData);
  };

  const deleteMaterial = async (materialId: string) => {
    if (!user) throw new Error('Must be logged in');

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const cachedEvents = await getCachedEvents([PROJECT_MATERIAL_KIND], user.pubkey);
    const materialEvent = cachedEvents.find((e) => e.id === materialId);
    const created_at = materialEvent?.created_at;

    const siblingIds =
      (privateRelayUrls.length > 0 || publicRelayUrls.length > 0) && created_at !== undefined
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            PROJECT_MATERIAL_KIND,
            user.pubkey,
            { created_at },
            AbortSignal.timeout(5000)
          )
        : [materialId];

    const tags: string[][] = [];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted project material',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventById(materialId);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
    await queryClient.refetchQueries({ queryKey: ['project-materials'] });
  };

  return { createMaterial, updateMaterial, toggleMaterialPurchased, deleteMaterial };
}

// Helper to get effective estimated price for an item
function getEstimatedPrice(m: ProjectMaterial): string {
  return m.estimatedPrice ?? m.totalPrice;
}

// Helper to get effective actual price for an item (when purchased)
function getActualPrice(m: ProjectMaterial): string {
  return m.actualPrice ?? m.estimatedPrice ?? m.totalPrice;
}

// Helper to calculate budget summary
export function useBudgetSummary(projectId?: string, originalBudget?: string) {
  const { data: materials = [] } = useProjectMaterials(projectId);
  
  // Parse price string to number
  const parsePrice = (price: string): number => {
    const cleaned = price.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  };

  // Total estimated (planned) across all items
  const totalEstimated = materials.reduce((sum, m) => sum + parsePrice(getEstimatedPrice(m)), 0);
  // Total actual (spent) for purchased items only
  const totalActual = materials
    .filter(m => m.isPurchased)
    .reduce((sum, m) => sum + parsePrice(getActualPrice(m)), 0);

  const totalSpent = totalActual;
  const totalPlanned = totalEstimated;

  const budgetAmount = originalBudget ? parsePrice(originalBudget) : 0;
  const remaining = budgetAmount - totalSpent;
  const percentUsed = budgetAmount > 0 ? (totalSpent / budgetAmount) * 100 : 0;
  const variance = totalEstimated - totalActual;

  // Breakdown by category (planned = estimated, spent = actual for purchased)
  const categoryBreakdown = materials.reduce((acc, m) => {
    const category = m.category;
    if (!acc[category]) {
      acc[category] = { planned: 0, spent: 0 };
    }
    acc[category].planned += parsePrice(getEstimatedPrice(m));
    if (m.isPurchased) {
      acc[category].spent += parsePrice(getActualPrice(m));
    }
    return acc;
  }, {} as Record<string, { planned: number; spent: number }>);

  return {
    totalSpent,
    totalPlanned,
    totalEstimated,
    totalActual,
    variance,
    budgetAmount,
    remaining,
    percentUsed,
    categoryBreakdown,
    isOverBudget: remaining < 0,
  };
}
