import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { PROJECT_KIND, type Project } from '@/lib/types';
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

// Helper to get all tag values for a given tag name
function _getTagValues(event: NostrEvent, tagName: string): string[] {
  return event.tags
    .filter(([name]) => name === tagName)
    .map(tag => tag[1])
    .filter((val): val is string => !!val);
}

// Data stored in encrypted content
type ProjectData = Omit<Project, 'id' | 'pubkey' | 'createdAt'>;

// Parse a Nostr event into a Project object (plaintext version)
function parseProjectPlaintext(event: NostrEvent): Project | null {
  const id = getTagValue(event, 'd');
  const name = getTagValue(event, 'name');
  const startDate = getTagValue(event, 'start_date');

  if (!id || !name || !startDate) return null;

  // Get linked company IDs from 'a' tags
  const companyIds = event.tags
    .filter(([name, value]) => name === 'a' && value?.includes(':') && value.split(':')[2])
    .filter(tag => tag[3] === 'company')
    .map(tag => tag[1].split(':')[2])
    .filter((id): id is string => !!id);

  return {
    id,
    name,
    description: getTagValue(event, 'description'),
    startDate,
    status: getTagValue(event, 'status') as Project['status'],
    budget: getTagValue(event, 'budget'),
    completionDate: getTagValue(event, 'completion_date'),
    targetCompletionDate: getTagValue(event, 'target_completion_date'),
    companyIds: companyIds.length > 0 ? companyIds : undefined,
    notes: getTagValue(event, 'notes'),
    isArchived: getTagValue(event, 'is_archived') === 'true',
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted project from content
async function parseProjectEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<ProjectData>
): Promise<Project | null> {
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
    logger.error('[Projects] Failed to decrypt project');
    return null;
  }
}

// Extract deleted project IDs from kind 5 events
function getDeletedProjectIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const deletedIds = new Set<string>();

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'a') {
        // Parse "kind:pubkey:d-tag" format
        const parts = tag[1].split(':');
        if (parts.length >= 3 && parts[0] === String(PROJECT_KIND) && parts[1] === pubkey) {
          deletedIds.add(parts[2]);
        }
      }
    }
  }

  return deletedIds;
}

// Parse events into projects
async function parseEventsToProjects(
  events: NostrEvent[],
  pubkey: string,
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<Project[]> {
  // Separate project events from deletion events
  const projectEvents = events.filter(e => e.kind === PROJECT_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted project IDs
  const deletedIds = getDeletedProjectIds(deletionEvents, pubkey);

  const results = await runWithConcurrencyLimit(
    projectEvents,
    decryptConcurrency,
    async (event): Promise<Project | null> => {
      const id = getTagValue(event, 'd');
      if (!id || deletedIds.has(id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseProjectEncrypted(event, (content) => decryptForCategory<ProjectData>(content));
      }
      return parseProjectPlaintext(event);
    }
  );

  return results.filter((p): p is Project => p != null).sort((a, b) => b.createdAt - a.createdAt);
}

export function useProjects() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  // Main query - loads from cache only
  // Background sync is handled centrally by useDataSyncStatus
  const query = useQuery({
    queryKey: ['projects', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) {
        return [];
      }

      // Load from cache (populated by useDataSyncStatus)
      const cachedEvents = await getCachedEvents([PROJECT_KIND, 5], user.pubkey);
      
      if (cachedEvents.length > 0) {
        const projects = await parseEventsToProjects(
          cachedEvents,
          user.pubkey,
          decryptForCategory,
          decryptConcurrency,
        );
        return projects;
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

export function useProjectById(id: string | undefined) {
  const { data: projects } = useProjects();
  return projects?.find(p => p.id === id);
}

export function useProjectActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createProject = async (data: Omit<Project, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const id = crypto.randomUUID();
    const useEncryption = isEncryptionEnabled('projects');

    // Base tags (always included)
    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log project data' : `Project: ${data.name}`],
    ];

    let content = '';

    // Add company links (always included, even with encryption for queryability)
    if (data.companyIds && data.companyIds.length > 0) {
      for (const companyId of data.companyIds) {
        tags.push(['a', `37003:${user.pubkey}:${companyId}`, '', 'company']);
      }
    }

    if (useEncryption && shouldEncrypt('projects')) {
      content = await encryptForCategory('projects', data);
    } else {
      // Store data in plaintext tags
      tags.push(['name', data.name]);
      tags.push(['start_date', data.startDate]);
      
      if (data.description) tags.push(['description', data.description]);
      if (data.status) tags.push(['status', data.status]);
      if (data.budget) tags.push(['budget', data.budget]);
      if (data.completionDate) tags.push(['completion_date', data.completionDate]);
      if (data.targetCompletionDate) tags.push(['target_completion_date', data.targetCompletionDate]);
      if (data.notes) tags.push(['notes', data.notes]);
      if (data.isArchived) tags.push(['is_archived', 'true']);
    }

    const event = await publishEvent({
      kind: PROJECT_KIND,
      content,
      tags,
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after creating a project
    await queryClient.refetchQueries({ queryKey: ['projects', user.pubkey] });

    return id;
  };

  const updateProject = async (id: string, data: Omit<Project, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('projects');

    // Base tags (always included)
    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log project data' : `Project: ${data.name}`],
    ];

    // Add company links (always included, even with encryption for queryability)
    if (data.companyIds && data.companyIds.length > 0) {
      for (const companyId of data.companyIds) {
        tags.push(['a', `37003:${user.pubkey}:${companyId}`, '', 'company']);
      }
    }

    let content = '';

    if (useEncryption && shouldEncrypt('projects')) {
      content = await encryptForCategory('projects', data);
    } else {
      // Store data in plaintext tags
      tags.push(['name', data.name]);
      tags.push(['start_date', data.startDate]);
      
      if (data.description) tags.push(['description', data.description]);
      if (data.status) tags.push(['status', data.status]);
      if (data.budget) tags.push(['budget', data.budget]);
      if (data.completionDate) tags.push(['completion_date', data.completionDate]);
      if (data.targetCompletionDate) tags.push(['target_completion_date', data.targetCompletionDate]);
      if (data.notes) tags.push(['notes', data.notes]);
      if (data.isArchived) tags.push(['is_archived', 'true']);
    }

    const event = await publishEvent({
      kind: PROJECT_KIND,
      content,
      tags,
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after updating a project
    await queryClient.refetchQueries({ queryKey: ['projects', user.pubkey] });
  };

  const archiveProject = async (id: string, isArchived: boolean) => {
    if (!user) throw new Error('Must be logged in');

    // Get current project data
    const projects = queryClient.getQueryData<Project[]>(['projects', user.pubkey]) || [];
    const project = projects.find(p => p.id === id);
    if (!project) throw new Error('Project not found');

    // Update with archive status
    await updateProject(id, { ...project, isArchived });
  };

  const deleteProject = async (id: string) => {
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
            PROJECT_KIND,
            user.pubkey,
            { dTag: id },
            AbortSignal.timeout(5000)
          )
        : [];

    const tags: string[][] = [['a', `${PROJECT_KIND}:${user.pubkey}:${id}`]];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted project',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventByAddress(PROJECT_KIND, user.pubkey, id);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    await queryClient.refetchQueries({ queryKey: ['projects'] });
  };

  return { createProject, updateProject, deleteProject, archiveProject };
}

// Get archived projects
export function useArchivedProjects() {
  const { data: projects = [] } = useProjects();
  return projects.filter(p => p.isArchived);
}

// Get active (non-archived) projects
export function useActiveProjects() {
  const { data: projects = [] } = useProjects();
  return projects.filter(p => !p.isArchived);
}
