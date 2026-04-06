import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import {
  PROJECT_RESEARCH_KIND,
  PROJECT_KIND,
  type ProjectResearchNote,
  type ProjectResearchDocument,
} from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventById } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { getSiblingEventIdsForDeletion } from '@/lib/relayDeletion';
import { logger } from '@/lib/logger';
import { runWithConcurrencyLimit } from '@/lib/utils';

const ENCRYPTED_MARKER = 'nip44:';

function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

type ProjectResearchData = Omit<ProjectResearchNote, 'id' | 'projectId' | 'pubkey' | 'createdAt'>;

function parseDocumentsJson(value: string | undefined): ProjectResearchDocument[] | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter(
      (item): item is ProjectResearchDocument =>
        item != null && typeof item === 'object' && typeof (item as ProjectResearchDocument).url === 'string'
    );
  } catch {
    return undefined;
  }
}

function parseQuotesJson(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return undefined;
  }
}

function parseProjectResearchPlaintext(event: NostrEvent): ProjectResearchNote | null {
  const aTag = event.tags.find(([name, value]) => name === 'a' && value?.startsWith(`${PROJECT_KIND}:`));
  if (!aTag) return null;

  const parts = aTag[1].split(':');
  if (parts.length < 3) return null;
  const projectId = parts[2];

  const description = getTagValue(event, 'description');
  const content = getTagValue(event, 'content_text');

  if (!projectId || !description?.trim() || !content?.trim()) return null;

  const documents = parseDocumentsJson(getTagValue(event, 'documents'));
  const quotes = parseQuotesJson(getTagValue(event, 'quotes'));

  return {
    id: event.id,
    projectId,
    description: description.trim(),
    content: content.trim(),
    documents: documents?.length ? documents : undefined,
    quotes: quotes?.length ? quotes : undefined,
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

async function parseProjectResearchEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<ProjectResearchData>
): Promise<ProjectResearchNote | null> {
  const aTag = event.tags.find(([name, value]) => name === 'a' && value?.startsWith(`${PROJECT_KIND}:`));
  if (!aTag) return null;

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
    logger.error('[ProjectResearch] Failed to decrypt note');
    return null;
  }
}

function getDeletedResearchIds(deletionEvents: NostrEvent[]): Set<string> {
  const set = new Set<string>();
  for (const ev of deletionEvents) {
    for (const tag of ev.tags) {
      if (tag[0] === 'e') set.add(tag[1]);
    }
  }
  return set;
}

async function parseEventsToNotes(
  events: NostrEvent[],
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<ProjectResearchNote[]> {
  const noteEvents = events.filter((e) => e.kind === PROJECT_RESEARCH_KIND);
  const deletionEvents = events.filter((e) => e.kind === 5);
  const deletedIds = getDeletedResearchIds(deletionEvents);

  const results = await runWithConcurrencyLimit(
    noteEvents,
    decryptConcurrency,
    async (event): Promise<ProjectResearchNote | null> => {
      if (deletedIds.has(event.id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseProjectResearchEncrypted(event, (content) =>
          decryptForCategory<ProjectResearchData>(content)
        );
      }
      return parseProjectResearchPlaintext(event);
    }
  );

  return results.filter((n): n is ProjectResearchNote => n != null);
}

export function useProjectResearch(projectId?: string) {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  return useQuery({
    queryKey: ['project-research', user?.pubkey, projectId],
    queryFn: async () => {
      if (!user?.pubkey || !projectId) return [];
      const cached = await getCachedEvents([PROJECT_RESEARCH_KIND, 5], user.pubkey);
      const notes = await parseEventsToNotes(cached, decryptForCategory, decryptConcurrency);
      return notes.filter((n) => n.projectId === projectId);
    },
    enabled: !!user?.pubkey && !!projectId,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** All project research notes (for sync/collectors that need full set) */
export function useAllProjectResearch() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  return useQuery({
    queryKey: ['project-research', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];
      const cached = await getCachedEvents([PROJECT_RESEARCH_KIND, 5], user.pubkey);
      return parseEventsToNotes(cached, decryptForCategory, decryptConcurrency);
    },
    enabled: !!user?.pubkey,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useProjectResearchActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createNote = async (
    projectId: string,
    data: Omit<ProjectResearchNote, 'id' | 'projectId' | 'pubkey' | 'createdAt'>
  ) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('projects');

    const tags: string[][] = [
      ['a', `${PROJECT_KIND}:${user.pubkey}:${projectId}`, '', 'project'],
      ['alt', useEncryption ? 'Encrypted project research note' : `Research: ${data.description}`],
    ];

    let content = '';

    if (useEncryption && shouldEncrypt('projects')) {
      content = await encryptForCategory('projects', data);
    } else {
      tags.push(['description', data.description]);
      tags.push(['content_text', data.content]);
      if (data.documents?.length) {
        tags.push(['documents', JSON.stringify(data.documents)]);
      }
      if (data.quotes?.length) {
        tags.push(['quotes', JSON.stringify(data.quotes)]);
      }
    }

    const event = await publishEvent({
      kind: PROJECT_RESEARCH_KIND,
      content,
      tags,
    });

    if (event) await cacheEvents([event]);

    await queryClient.refetchQueries({ queryKey: ['project-research', user.pubkey] });
    return event?.id;
  };

  const deleteNote = async (noteId: string) => {
    if (!user) throw new Error('Must be logged in');

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const cached = await getCachedEvents([PROJECT_RESEARCH_KIND], user.pubkey);
    const noteEvent = cached.find((e) => e.id === noteId);
    const created_at = noteEvent?.created_at;

    const siblingIds =
      (privateRelayUrls.length > 0 || publicRelayUrls.length > 0) && created_at !== undefined
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            PROJECT_RESEARCH_KIND,
            user.pubkey,
            { created_at },
            AbortSignal.timeout(5000)
          )
        : [noteId];

    const tags: string[][] = siblingIds.map((id) => ['e', id]);
    const event = await publishEvent({
      kind: 5,
      content: 'Deleted project research note',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventById(noteId);
    }

    await new Promise((r) => setTimeout(r, 300));
    await queryClient.refetchQueries({ queryKey: ['project-research'] });
  };

  return { createNote, deleteNote };
}
