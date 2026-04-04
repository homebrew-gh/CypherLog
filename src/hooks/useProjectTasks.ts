import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { PROJECT_TASK_KIND, PROJECT_KIND, type ProjectTask } from '@/lib/types';
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
type ProjectTaskData = Omit<ProjectTask, 'id' | 'projectId' | 'pubkey' | 'createdAt'>;

// Parse a Nostr event into a ProjectTask object (plaintext version)
function parseProjectTaskPlaintext(event: NostrEvent): ProjectTask | null {
  // Get the project reference from 'a' tag
  const aTag = event.tags.find(([name, value]) => 
    name === 'a' && value?.startsWith(`${PROJECT_KIND}:`)
  );
  if (!aTag) return null;

  // Parse project ID from 'a' tag (format: "kind:pubkey:d-tag")
  const parts = aTag[1].split(':');
  if (parts.length < 3) return null;
  const projectId = parts[2];

  const description = getTagValue(event, 'description');
  if (!projectId || !description) return null;

  return {
    id: event.id,
    projectId,
    description,
    isCompleted: getTagValue(event, 'is_completed') === 'true',
    completedDate: getTagValue(event, 'completed_date'),
    priority: getTagValue(event, 'priority') as ProjectTask['priority'],
    dueDate: getTagValue(event, 'due_date'),
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted project task from content
async function parseProjectTaskEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<ProjectTaskData>
): Promise<ProjectTask | null> {
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
    logger.error('[ProjectTasks] Failed to decrypt task');
    return null;
  }
}

// Extract deleted task IDs from kind 5 events
function getDeletedTaskIds(deletionEvents: NostrEvent[]): Set<string> {
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

// Parse events into project tasks
async function parseEventsToTasks(
  events: NostrEvent[],
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<ProjectTask[]> {
  // Separate task events from deletion events
  const taskEvents = events.filter(e => e.kind === PROJECT_TASK_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted task IDs
  const deletedIds = getDeletedTaskIds(deletionEvents);

  const results = await runWithConcurrencyLimit(
    taskEvents,
    decryptConcurrency,
    async (event): Promise<ProjectTask | null> => {
      if (deletedIds.has(event.id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseProjectTaskEncrypted(event, (content) => decryptForCategory<ProjectTaskData>(content));
      }
      return parseProjectTaskPlaintext(event);
    }
  );

  const priorityOrder = { high: 0, medium: 1, low: 2, undefined: 3 };
  return results.filter((t): t is ProjectTask => t != null).sort((a, b) => {
    // Completed tasks go to the end
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1;
    }
    // For incomplete tasks, sort by priority then creation date
    if (!a.isCompleted) {
      const priorityDiff = (priorityOrder[a.priority || 'undefined'] || 3) - (priorityOrder[b.priority || 'undefined'] || 3);
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt;
    }
    // For completed tasks, sort by completion date (newest first)
    return b.createdAt - a.createdAt;
  });
}

export function useProjectTasks(projectId?: string) {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  const query = useQuery({
    queryKey: ['project-tasks', user?.pubkey, projectId],
    queryFn: async () => {
      if (!user?.pubkey || !projectId) {
        return [];
      }

      // Load from cache
      const cachedEvents = await getCachedEvents([PROJECT_TASK_KIND, 5], user.pubkey);
      
      if (cachedEvents.length > 0) {
        const tasks = await parseEventsToTasks(cachedEvents, decryptForCategory, decryptConcurrency);
        // Filter to only tasks for this project
        return tasks.filter(t => t.projectId === projectId);
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

export function useProjectTaskActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createTask = async (projectId: string, data: Omit<ProjectTask, 'id' | 'projectId' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('projects');

    // Base tags (always included)
    const tags: string[][] = [
      ['a', `${PROJECT_KIND}:${user.pubkey}:${projectId}`, '', 'project'],
      ['alt', useEncryption ? 'Encrypted project task' : `Task: ${data.description}`],
    ];

    let content = '';

    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('projects')) {
      content = await encryptForCategory('projects', data);
      dualPublish = { plainContent: JSON.stringify(data) };
    } else {
      tags.push(['description', data.description]);
      tags.push(['is_completed', data.isCompleted ? 'true' : 'false']);
      if (data.completedDate) tags.push(['completed_date', data.completedDate]);
      if (data.priority) tags.push(['priority', data.priority]);
      if (data.dueDate) tags.push(['due_date', data.dueDate]);
    }

    const event = await publishEvent({
      kind: PROJECT_TASK_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    await queryClient.refetchQueries({ queryKey: ['project-tasks', user.pubkey] });

    return event?.id;
  };

  const updateTask = async (taskId: string, projectId: string, data: Omit<ProjectTask, 'id' | 'projectId' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    // Delete the old task
    await deleteTask(taskId);
    
    // Create a new one with updated data
    return await createTask(projectId, data);
  };

  const toggleTaskComplete = async (task: ProjectTask) => {
    if (!user) throw new Error('Must be logged in');

    const today = new Date();
    const formattedDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

    const updatedData = {
      description: task.description,
      isCompleted: !task.isCompleted,
      completedDate: !task.isCompleted ? formattedDate : undefined,
      priority: task.priority,
      dueDate: task.dueDate,
    };

    return await updateTask(task.id, task.projectId, updatedData);
  };

  const deleteTask = async (taskId: string) => {
    if (!user) throw new Error('Must be logged in');

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const cachedEvents = await getCachedEvents([PROJECT_TASK_KIND], user.pubkey);
    const taskEvent = cachedEvents.find((e) => e.id === taskId);
    const created_at = taskEvent?.created_at;

    const siblingIds =
      (privateRelayUrls.length > 0 || publicRelayUrls.length > 0) && created_at !== undefined
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            PROJECT_TASK_KIND,
            user.pubkey,
            { created_at },
            AbortSignal.timeout(5000)
          )
        : [taskId];

    const tags: string[][] = [];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted project task',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventById(taskId);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
    await queryClient.refetchQueries({ queryKey: ['project-tasks'] });
  };

  return { createTask, updateTask, toggleTaskComplete, deleteTask };
}
