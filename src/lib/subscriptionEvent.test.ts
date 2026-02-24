import { describe, it, expect } from 'vitest';
import {
  buildSubscriptionTags,
  normalizeCostForTag,
  normalizeBillingFrequency,
  BILLING_FREQUENCY_VALUES,
} from './subscriptionEvent';
import { SUBSCRIPTION_KIND } from './types';

describe('subscriptionEvent', () => {
  const requiredTagNames = ['d', 'alt', 'name', 'subscription_type', 'cost', 'billing_frequency'];

  describe('buildSubscriptionTags', () => {
    it('includes all required canonical tags', () => {
      const tags = buildSubscriptionTags({
        id: 'sub-123',
        data: {
          name: 'Netflix',
          subscriptionType: 'Streaming',
          cost: '15.99',
          billingFrequency: 'monthly',
        },
        existingEvent: null,
      });
      const names = tags.map(([n]) => n);
      for (const req of requiredTagNames) {
        expect(names).toContain(req);
      }
    });

    it('uses human-readable alt (Subscription: name) not generic encrypted text', () => {
      const tags = buildSubscriptionTags({
        id: 'sub-1',
        data: {
          name: 'Spotify',
          subscriptionType: 'Music',
          cost: '9.99',
          billingFrequency: 'monthly',
        },
        existingEvent: null,
      });
      const alt = tags.find(([n]) => n === 'alt')?.[1];
      expect(alt).toBe('Subscription: Spotify');
      expect(alt).not.toMatch(/Encrypted Cypher Log/);
    });

    it('normalizes cost to decimal string in tag', () => {
      const tags = buildSubscriptionTags({
        id: 'sub-1',
        data: {
          name: 'Service',
          subscriptionType: 'Other',
          cost: '$19.99',
          billingFrequency: 'annually',
        },
        existingEvent: null,
      });
      const costTag = tags.find(([n]) => n === 'cost')?.[1];
      expect(costTag).toBe('19.99');
    });

    it('emits valid billing_frequency', () => {
      const tags = buildSubscriptionTags({
        id: 'sub-1',
        data: {
          name: 'X',
          subscriptionType: 'Other',
          cost: '10',
          billingFrequency: 'semi-annually',
        },
        existingEvent: null,
      });
      const freq = tags.find(([n]) => n === 'billing_frequency')?.[1];
      expect(BILLING_FREQUENCY_VALUES).toContain(freq);
      expect(freq).toBe('semi-annually');
    });

    it('preserves unknown tags from existing event on update', () => {
      const existingEvent = {
        id: 'evt-old',
        kind: SUBSCRIPTION_KIND,
        pubkey: 'pubkey',
        created_at: 1000,
        content: '',
        sig: '',
        tags: [
          ['d', 'sub-1'],
          ['name', 'Old'],
          ['custom', 'value'],
          ['x-nostr', 'custom-data'],
        ],
      } as import('@nostrify/nostrify').NostrEvent;
      const tags = buildSubscriptionTags({
        id: 'sub-1',
        data: {
          name: 'Updated Name',
          subscriptionType: 'Other',
          cost: '5',
          billingFrequency: 'monthly',
        },
        existingEvent,
      });
      expect(tags.find(([n]) => n === 'name')?.[1]).toBe('Updated Name');
      expect(tags.find(([n]) => n === 'custom')?.[1]).toBe('value');
      expect(tags.find(([n]) => n === 'x-nostr')?.[1]).toBe('custom-data');
    });

    it('includes optional tags when provided', () => {
      const tags = buildSubscriptionTags({
        id: 'sub-1',
        data: {
          name: 'Gym',
          subscriptionType: 'Fitness',
          cost: '29.99',
          billingFrequency: 'monthly',
          currency: 'USD',
          companyId: 'company-abc',
          companyName: 'FitCo',
          notes: 'Annual discount applied',
          startDate: '01/15/2024',
        },
        existingEvent: null,
      });
      expect(tags.find(([n]) => n === 'currency')?.[1]).toBe('USD');
      expect(tags.find(([n]) => n === 'company_id')?.[1]).toBe('company-abc');
      expect(tags.find(([n]) => n === 'company_name')?.[1]).toBe('FitCo');
      expect(tags.find(([n]) => n === 'notes')?.[1]).toBe('Annual discount applied');
      expect(tags.find(([n]) => n === 'start_date')?.[1]).toBe('01/15/2024');
    });
  });

  describe('normalizeCostForTag', () => {
    it('strips currency symbols and commas', () => {
      expect(normalizeCostForTag('$15.99')).toBe('15.99');
      expect(normalizeCostForTag('1,000.50')).toBe('1000.5');
    });
    it('returns 0 for unparseable', () => {
      expect(normalizeCostForTag('')).toBe('0');
      expect(normalizeCostForTag('abc')).toBe('0');
    });
  });

  describe('normalizeBillingFrequency', () => {
    it('returns valid frequency or monthly fallback', () => {
      expect(normalizeBillingFrequency('annually')).toBe('annually');
      expect(normalizeBillingFrequency('invalid')).toBe('monthly');
    });
  });

  describe('example kind 37004 event payload', () => {
    it('produces tags that match interop requirements and can be used in an example event', () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const tags = buildSubscriptionTags({
        id,
        data: {
          name: 'Netflix',
          subscriptionType: 'Streaming',
          cost: '15.99',
          billingFrequency: 'monthly',
          currency: 'USD',
        },
        existingEvent: null,
      });
      // Client tag is added by useNostrPublish; we only assert our subscription tags here
      const subscriptionTagNames = tags.map(([n]) => n);
      expect(subscriptionTagNames).toContain('d');
      expect(subscriptionTagNames).toContain('alt');
      expect(subscriptionTagNames).toContain('name');
      expect(subscriptionTagNames).toContain('subscription_type');
      expect(subscriptionTagNames).toContain('cost');
      expect(subscriptionTagNames).toContain('billing_frequency');
      expect(subscriptionTagNames).toContain('currency');

      // Example event JSON (id/sig/content filled by signer/relay when published)
      const exampleEvent = {
        kind: SUBSCRIPTION_KIND,
        pubkey: '<pubkey>',
        created_at: Math.floor(Date.now() / 1000),
        content: '',
        tags: [
          ...tags,
          ['client', 'Cypher Log', 'https://cypherlog.io'],
        ],
        id: '<event-id>',
        sig: '<signature>',
      };
      expect(exampleEvent.kind).toBe(37004);
      const dTag = exampleEvent.tags.find(([t]) => t === 'd')?.[1];
      expect(dTag).toBe(id);
      const altTag = exampleEvent.tags.find(([t]) => t === 'alt')?.[1];
      expect(altTag).toBe('Subscription: Netflix');
      const costTag = exampleEvent.tags.find(([t]) => t === 'cost')?.[1];
      expect(costTag).toBe('15.99');
      const freqTag = exampleEvent.tags.find(([t]) => t === 'billing_frequency')?.[1];
      expect(freqTag).toBe('monthly');
    });

    it('example generated 37004 event JSON (FiatLife-interop shape)', () => {
      const tags = buildSubscriptionTags({
        id: 'sub-uuid-here',
        data: {
          name: 'Netflix',
          subscriptionType: 'Streaming',
          cost: '$15.99',
          billingFrequency: 'monthly',
          currency: 'USD',
        },
        existingEvent: null,
      });
      const exampleEventJson = {
        kind: 37004,
        pubkey: '00'.repeat(32),
        created_at: 1700000000,
        content: '',
        tags: [
          ...tags,
          ['client', 'Cypher Log', 'https://cypherlog.io'],
        ],
        id: 'event-id-from-signer',
        sig: 'sig-from-signer',
      };
      // Required for FiatLife: d, alt, name, subscription_type, cost, billing_frequency
      const tagMap = Object.fromEntries(exampleEventJson.tags.map((t) => [t[0], t[1]]));
      expect(tagMap.d).toBe('sub-uuid-here');
      expect(tagMap.alt).toBe('Subscription: Netflix');
      expect(tagMap.name).toBe('Netflix');
      expect(tagMap.subscription_type).toBe('Streaming');
      expect(tagMap.cost).toBe('15.99');
      expect(tagMap.billing_frequency).toBe('monthly');
      expect(tagMap.currency).toBe('USD');
    });
  });
});
