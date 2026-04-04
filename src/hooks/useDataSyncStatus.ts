import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { useEffect, useState, useRef } from 'react';
import { 
  APPLIANCE_KIND, 
  VEHICLE_KIND, 
  MAINTENANCE_KIND, 
  COMPANY_KIND, 
  COMPANY_WORK_LOG_KIND,
  SUBSCRIPTION_KIND,
  SUBSCRIPTION_KIND_LEGACY,
  WARRANTY_KIND,
  MAINTENANCE_COMPLETION_KIND,
  PET_KIND,
  PROJECT_KIND,
  PROJECT_ENTRY_KIND,
  PROJECT_TASK_KIND,
  PROJECT_MATERIAL_KIND,
  PROJECT_RESEARCH_KIND,
  PROPERTY_KIND,
  VET_VISIT_KIND,
} from '@/lib/types';
import { cacheEvents, dedupeEventsByLogicalKey, getCachedEvents } from '@/lib/eventCache';
import { logger } from '@/lib/logger';

// Timeout for new users - if no data is found quickly, assume new user
const NEW_USER_FAST_TIMEOUT_MS = 3000;
// Remote signers (NostrConnect/Amber) need longer: requests go relay → signer → relay
const BUNKER_NEW_USER_TIMEOUT_MS = 15000;
const BUNKER_SYNC_TIMEOUT_MS = 30000;
// If NostrSync hasn't set relay list for this user after this long, run sync anyway (use current config)
const RELAY_LIST_WAIT_TIMEOUT_MS = 4000;

function isSubscriptionRecordEvent(event: { kind: number; tags: string[][] }): boolean {
  if (event.kind === SUBSCRIPTION_KIND_LEGACY) return true;
  if (event.kind !== SUBSCRIPTION_KIND) return false;
  const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
  if (dTag.startsWith('subscription:')) return true;
  const hasName = event.tags.some(([name, value]) => name === 'name' && !!value);
  const hasAmount = event.tags.some(([name, value]) => (name === 'cost' || name === 'amount') && !!value);
  const hasRecurrence = event.tags.some(
    ([name, value]) => (name === 'billing_frequency' || name === 'recurrence') && !!value
  );
  return hasName && hasAmount && hasRecurrence;
}

// Cache result type for reuse
interface CacheCheckResult {
  appliances: number;
  vehicles: number;
  maintenance: number;
  companies: number;
  companyWorkLogs: number;
  subscriptions: number;
  warranties: number;
  completions: number;
  pets: number;
  projects: number;
  projectEntries: number;
  projectTasks: number;
  projectMaterials: number;
  projectResearch: number;
  properties: number;
  vetVisits: number;
  hasAny: boolean;
}

/**
 * Hook to track data synchronization status across all data types.
 * 
 * This hook performs initial sync with relays and tracks progress.
 * It returns whether sync is complete and the sync progress.
 * 
 * For new users with no cached data, uses a faster timeout to avoid
 * long waits when there's nothing to fetch from relays.
 */
export function useDataSyncStatus() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const loginType = logins[0]?.type;
  /** Bunker (NIP-46) and Amber (NIP-55 intents) need longer sync timeouts than local signers. */
  const isSlowSignerPath = loginType === 'bunker' || loginType === 'x-amber-android';
  const hasInvalidated = useRef(false);
  const relayListReady = config.relayListSyncedForPubkey === user?.pubkey;
  const [relayListWaitTimedOut, setRelayListWaitTimedOut] = useState(false);

  // Wait for NostrSync to load user's relay list (NIP-65) before querying; otherwise we'd query default relays without knowing if user's data is there
  useEffect(() => {
    if (!user?.pubkey) {
      setRelayListWaitTimedOut(false);
      return;
    }
    if (relayListReady) {
      setRelayListWaitTimedOut(false);
      return;
    }
    const t = setTimeout(() => setRelayListWaitTimedOut(true), RELAY_LIST_WAIT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [user?.pubkey, relayListReady]);

  const canRunSync = !!user?.pubkey && (relayListReady || relayListWaitTimedOut);

  // Track whether we've checked the cache (this happens instantly before relay sync)
  const [cacheChecked, setCacheChecked] = useState(false);
  const [cacheResult, setCacheResult] = useState<CacheCheckResult | null>(null);

  // Reset invalidation flag when user or relays change
  useEffect(() => {
    hasInvalidated.current = false;
  }, [user?.pubkey, config.relayMetadata.updatedAt]);

  // Check cache status immediately when user becomes available
  useEffect(() => {
    if (!user?.pubkey) {
      setCacheChecked(false);
      setCacheResult(null);
      return;
    }
    
    // Check cache instantly (IndexedDB is very fast)
    const checkCache = async () => {
      logger.log('[DataSync] Checking IndexedDB cache');
      
      const [cachedAppliances, cachedVehicles, cachedMaintenance, cachedCompanies, cachedCompanyWorkLogs, cachedSubscriptions, cachedWarranties, cachedCompletions, cachedPets, cachedProjects, cachedProjectEntries, cachedProjectTasks, cachedProjectMaterials, cachedProjectResearch, cachedProperties, cachedVetVisits] = await Promise.all([
        getCachedEvents([APPLIANCE_KIND], user.pubkey),
        getCachedEvents([VEHICLE_KIND], user.pubkey),
        getCachedEvents([MAINTENANCE_KIND], user.pubkey),
        getCachedEvents([COMPANY_KIND], user.pubkey),
        getCachedEvents([COMPANY_WORK_LOG_KIND], user.pubkey),
        getCachedEvents([SUBSCRIPTION_KIND, SUBSCRIPTION_KIND_LEGACY], user.pubkey),
        getCachedEvents([WARRANTY_KIND], user.pubkey),
        getCachedEvents([MAINTENANCE_COMPLETION_KIND], user.pubkey),
        getCachedEvents([PET_KIND], user.pubkey),
        getCachedEvents([PROJECT_KIND], user.pubkey),
        getCachedEvents([PROJECT_ENTRY_KIND], user.pubkey),
        getCachedEvents([PROJECT_TASK_KIND], user.pubkey),
        getCachedEvents([PROJECT_MATERIAL_KIND], user.pubkey),
        getCachedEvents([PROJECT_RESEARCH_KIND], user.pubkey),
        getCachedEvents([PROPERTY_KIND], user.pubkey),
        getCachedEvents([VET_VISIT_KIND], user.pubkey),
      ]);
      
      const result: CacheCheckResult = {
        appliances: cachedAppliances.length,
        vehicles: cachedVehicles.length,
        maintenance: cachedMaintenance.length,
        companies: cachedCompanies.length,
        companyWorkLogs: cachedCompanyWorkLogs.length,
        subscriptions: cachedSubscriptions.filter(isSubscriptionRecordEvent).length,
        warranties: cachedWarranties.length,
        completions: cachedCompletions.length,
        pets: cachedPets.length,
        projects: cachedProjects.length,
        projectEntries: cachedProjectEntries.length,
        projectTasks: cachedProjectTasks.length,
        projectMaterials: cachedProjectMaterials.length,
        projectResearch: cachedProjectResearch.length,
        properties: cachedProperties.length,
        vetVisits: cachedVetVisits.length,
        hasAny: cachedAppliances.length > 0 ||
          cachedVehicles.length > 0 ||
          cachedMaintenance.length > 0 ||
          cachedCompanies.length > 0 ||
          cachedCompanyWorkLogs.length > 0 ||
          cachedSubscriptions.some(isSubscriptionRecordEvent) ||
          cachedWarranties.length > 0 ||
          cachedCompletions.length > 0 ||
          cachedPets.length > 0 ||
          cachedProjects.length > 0 ||
          cachedProjectEntries.length > 0 ||
          cachedProjectTasks.length > 0 ||
          cachedProjectMaterials.length > 0 ||
          cachedProjectResearch.length > 0 ||
          cachedProperties.length > 0 ||
          cachedVetVisits.length > 0,
      };
      
      logger.log('[DataSync] Cache check complete, hasAny:', result.hasAny);
      setCacheResult(result);
      setCacheChecked(true);
    };
    
    checkCache();
  }, [user?.pubkey]);

  // Main sync query - fetches all data types in one efficient request
  // Only runs after user's relay list (NIP-65) has been loaded, or after timeout fallback
  const { data: syncStatus, isLoading: isSyncing } = useQuery({
    queryKey: ['data-sync-status', user?.pubkey, config.relayMetadata.updatedAt, isSlowSignerPath, canRunSync],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) {
        return { 
          synced: false, 
          hasAnyData: false,
          hadCachedData: false,
          categories: {
            appliances: { synced: false, count: 0 },
            vehicles: { synced: false, count: 0 },
            maintenance: { synced: false, count: 0 },
            companies: { synced: false, count: 0 },
            companyWorkLogs: { synced: false, count: 0 },
            subscriptions: { synced: false, count: 0 },
            warranties: { synced: false, count: 0 },
            completions: { synced: false, count: 0 },
            pets: { synced: false, count: 0 },
            projects: { synced: false, count: 0 },
            projectEntries: { synced: false, count: 0 },
            projectResearch: { synced: false, count: 0 },
            properties: { synced: false, count: 0 },
            vetVisits: { synced: false, count: 0 },
          }
        };
      }

      // Small delay to allow relay connections to establish after relay list changes
      await new Promise(resolve => setTimeout(resolve, 500));

      // Reuse cache check result from state instead of re-reading IndexedDB
      const hasAnyCachedData = cacheResult?.hasAny ?? false;

      // Use a shorter timeout for new users (no cache) to avoid long waits when there's nothing to fetch.
      // Remote signers (NostrConnect/Amber) need longer: relay round-trips are slower.
      const timeoutMs = isSlowSignerPath
        ? (hasAnyCachedData ? BUNKER_SYNC_TIMEOUT_MS : BUNKER_NEW_USER_TIMEOUT_MS)
        : (hasAnyCachedData ? 20000 : NEW_USER_FAST_TIMEOUT_MS);

      try {
        logger.log('[DataSync] Starting relay query, timeout:', timeoutMs, 'ms');
        
        // Fetch all data types in one query for efficiency
        const events = await nostr.query(
          [
            { kinds: [APPLIANCE_KIND], authors: [user.pubkey] },
            { kinds: [VEHICLE_KIND], authors: [user.pubkey] },
            { kinds: [MAINTENANCE_KIND], authors: [user.pubkey] },
            { kinds: [COMPANY_KIND], authors: [user.pubkey] },
            { kinds: [SUBSCRIPTION_KIND, SUBSCRIPTION_KIND_LEGACY], authors: [user.pubkey] },
            { kinds: [WARRANTY_KIND], authors: [user.pubkey] },
            { kinds: [MAINTENANCE_COMPLETION_KIND], authors: [user.pubkey] },
            { kinds: [PET_KIND], authors: [user.pubkey] },
            { kinds: [PROJECT_KIND], authors: [user.pubkey] },
            { kinds: [PROJECT_ENTRY_KIND], authors: [user.pubkey] },
            { kinds: [PROJECT_TASK_KIND], authors: [user.pubkey] },
            { kinds: [PROJECT_MATERIAL_KIND], authors: [user.pubkey] },
            { kinds: [PROJECT_RESEARCH_KIND], authors: [user.pubkey] },
            { kinds: [PROPERTY_KIND], authors: [user.pubkey] },
            { kinds: [VET_VISIT_KIND], authors: [user.pubkey] },
            { kinds: [5], authors: [user.pubkey] }, // Deletion events
          ],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) }
        );

        logger.log('[DataSync] Query complete, events synced:', events.length > 0);

        // Cache all events for other hooks to use (dedupe plain vs encrypted copies)
        if (events.length > 0) {
          const deduped = dedupeEventsByLogicalKey(events);
          await cacheEvents(deduped);
          
          // Invalidate all data queries so they re-read from the now-populated cache
          // when they next become active (i.e., when the dashboard renders)
          // Using invalidateQueries instead of refetchQueries because the queries
          // might not be active yet (dashboard hasn't rendered during loading)
          if (!hasInvalidated.current) {
            hasInvalidated.current = true;
            queryClient.invalidateQueries({ queryKey: ['appliances'] });
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            queryClient.invalidateQueries({ queryKey: ['maintenance'] });
            queryClient.invalidateQueries({ queryKey: ['companies'] });
            queryClient.invalidateQueries({ queryKey: ['company-work-logs'] });
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
            queryClient.invalidateQueries({ queryKey: ['warranties'] });
            queryClient.invalidateQueries({ queryKey: ['maintenance-completions'] });
            queryClient.invalidateQueries({ queryKey: ['pets'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['project-entries'] });
            queryClient.invalidateQueries({ queryKey: ['project-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['project-materials'] });
            queryClient.invalidateQueries({ queryKey: ['project-research'] });
            queryClient.invalidateQueries({ queryKey: ['properties'] });
            queryClient.invalidateQueries({ queryKey: ['vet-visits'] });
          }
        }

        // Count events by type (excluding deletion events)
        const applianceCount = events.filter(e => e.kind === APPLIANCE_KIND).length;
        const vehicleCount = events.filter(e => e.kind === VEHICLE_KIND).length;
        const maintenanceCount = events.filter(e => e.kind === MAINTENANCE_KIND).length;
        const companyCount = events.filter(e => e.kind === COMPANY_KIND).length;
        const companyWorkLogCount = events.filter(e => e.kind === COMPANY_WORK_LOG_KIND).length;
        const subscriptionCount = events.filter(isSubscriptionRecordEvent).length;
        const warrantyCount = events.filter(e => e.kind === WARRANTY_KIND).length;
        const completionCount = events.filter(e => e.kind === MAINTENANCE_COMPLETION_KIND).length;
        const petCount = events.filter(e => e.kind === PET_KIND).length;
        const projectCount = events.filter(e => e.kind === PROJECT_KIND).length;
        const projectEntryCount = events.filter(e => e.kind === PROJECT_ENTRY_KIND).length;
        const projectTaskCount = events.filter(e => e.kind === PROJECT_TASK_KIND).length;
        const projectMaterialCount = events.filter(e => e.kind === PROJECT_MATERIAL_KIND).length;
        const projectResearchCount = events.filter(e => e.kind === PROJECT_RESEARCH_KIND).length;
        const propertyCount = events.filter(e => e.kind === PROPERTY_KIND).length;
        const vetVisitCount = events.filter(e => e.kind === VET_VISIT_KIND).length;

        return {
          synced: true,
          hasAnyData: events.length > 0,
          categories: {
            appliances: { synced: true, count: applianceCount },
            vehicles: { synced: true, count: vehicleCount },
            maintenance: { synced: true, count: maintenanceCount },
            companies: { synced: true, count: companyCount },
            companyWorkLogs: { synced: true, count: companyWorkLogCount },
            subscriptions: { synced: true, count: subscriptionCount },
            warranties: { synced: true, count: warrantyCount },
            completions: { synced: true, count: completionCount },
            pets: { synced: true, count: petCount },
            projects: { synced: true, count: projectCount },
            projectEntries: { synced: true, count: projectEntryCount },
            projectTasks: { synced: true, count: projectTaskCount },
            projectMaterials: { synced: true, count: projectMaterialCount },
            projectResearch: { synced: true, count: projectResearchCount },
            properties: { synced: true, count: propertyCount },
            vetVisits: { synced: true, count: vetVisitCount },
          }
        };
      } catch {
        logger.error('[DataSync] Relay query failed');
        // If sync fails but we have cached data, consider it "synced" with cache
        if (hasAnyCachedData && cacheResult) {
          return {
            synced: true,
            hasAnyData: true,
            categories: {
              appliances: { synced: true, count: cacheResult.appliances },
              vehicles: { synced: true, count: cacheResult.vehicles },
              maintenance: { synced: true, count: cacheResult.maintenance },
              companies: { synced: true, count: cacheResult.companies },
              companyWorkLogs: { synced: true, count: cacheResult.companyWorkLogs },
              subscriptions: { synced: true, count: cacheResult.subscriptions },
              warranties: { synced: true, count: cacheResult.warranties },
              completions: { synced: true, count: cacheResult.completions },
              pets: { synced: true, count: cacheResult.pets },
              projects: { synced: true, count: cacheResult.projects },
              projectEntries: { synced: true, count: cacheResult.projectEntries },
              projectTasks: { synced: true, count: cacheResult.projectTasks },
              projectMaterials: { synced: true, count: cacheResult.projectMaterials },
              projectResearch: { synced: true, count: cacheResult.projectResearch },
              properties: { synced: true, count: cacheResult.properties },
              vetVisits: { synced: true, count: cacheResult.vetVisits },
            }
          };
        }
        
        // No cache and sync failed - still mark as synced to avoid infinite loading
        return {
          synced: true,
          hasAnyData: false,
          categories: {
            appliances: { synced: true, count: 0 },
            vehicles: { synced: true, count: 0 },
            maintenance: { synced: true, count: 0 },
            companies: { synced: true, count: 0 },
            companyWorkLogs: { synced: true, count: 0 },
            subscriptions: { synced: true, count: 0 },
            warranties: { synced: true, count: 0 },
            completions: { synced: true, count: 0 },
            pets: { synced: true, count: 0 },
            projects: { synced: true, count: 0 },
            projectEntries: { synced: true, count: 0 },
            projectTasks: { synced: true, count: 0 },
            projectMaterials: { synced: true, count: 0 },
            projectResearch: { synced: true, count: 0 },
            properties: { synced: true, count: 0 },
            vetVisits: { synced: true, count: 0 },
          }
        };
      }
    },
    enabled: canRunSync && !!user?.pubkey && cacheChecked, // Run after relay list loaded (or timeout) and cache check completes
    staleTime: 30000, // Re-fetch after 30 seconds to catch relay changes
    gcTime: Infinity, // Keep in memory for the session
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    // Syncing if query is loading OR query hasn't even started yet (waiting for cache check)
    isSyncing: isSyncing || (!syncStatus?.synced && !cacheChecked),
    isSynced: syncStatus?.synced ?? false,
    hasAnyData: syncStatus?.hasAnyData ?? false,
    // These are available immediately after cache check (before relay sync)
    cacheChecked,
    hasCachedData: cacheResult?.hasAny ?? false,
    categories: syncStatus?.categories ?? {
      appliances: { synced: false, count: 0 },
      vehicles: { synced: false, count: 0 },
      maintenance: { synced: false, count: 0 },
      companies: { synced: false, count: 0 },
      companyWorkLogs: { synced: false, count: 0 },
      subscriptions: { synced: false, count: 0 },
      warranties: { synced: false, count: 0 },
      completions: { synced: false, count: 0 },
      pets: { synced: false, count: 0 },
      projects: { synced: false, count: 0 },
      projectEntries: { synced: false, count: 0 },
      projectTasks: { synced: false, count: 0 },
      projectMaterials: { synced: false, count: 0 },
      projectResearch: { synced: false, count: 0 },
      properties: { synced: false, count: 0 },
      vetVisits: { synced: false, count: 0 },
    },
  };
}

/**
 * Hook to check if initial data sync is in progress.
 * Use this to show loading indicators while data is being fetched.
 */
export function useIsInitialSyncing() {
  const { isSyncing, isSynced } = useDataSyncStatus();
  return isSyncing && !isSynced;
}
