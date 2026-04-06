# Relay rate limits (private relay)

## What was causing private relay rate limits

The app uses a single Nostr pool (`NPool`) for all relay traffic. The pool’s **reqRouter** decides which relays receive each **read** request (REQ).

Previously, the router sent **every** read to **every** relay with read enabled, including your private relay. So the private relay was getting:

- Every `useAuthor` (one REQ per author on the page)
- Every comments/zaps/logins/sync/preferences query
- DM batch loads and **live DM subscriptions** (`nostr.req()`)
- Every domain query (appliances, vehicles, maintenance, projects, etc.)
- Refetches after `invalidateQueries(['nostr'])` (e.g. visibility change, relay list change)

That duplicated all read traffic to the private relay and could hit its rate limit even when you use it mainly for CypherLog.

## Fix: private relay for your data only (login / refresh)

In **NostrProvider**, the pool’s **reqRouter** sends reads to the private relay **only when the query is for the current user’s own data** (same kinds stored in plaintext on the private relay: appliances, vehicles, maintenance, projects, etc.). All other reads go to **public** relays only.

- **Owned-data reads (login / refresh):** When you log in or refresh, queries for *your* data (e.g. `authors: [your-pubkey]`, kinds like appliances, vehicles, maintenance) are sent to **both** the private relay (first) and public relays. You get fast plaintext from the private relay and avoid heavy decryption when possible.
- **Other reads:** useAuthor (other users), comments, zaps, DMs, sync, preferences, etc. go to **public** relays only, so the private relay is not spammed.
- **Writes (EVENT):** Still go to **all** write relays (including private) via **eventRouter**.

The private relay therefore receives:

1. **Writes** – events you publish (one signed event per save to all configured write relays).
2. **Owned-data reads** – only when the filter is `authors: [you]` and kinds are your app data kinds (see `lib/privateRelayKinds.ts`). This is what runs on first load after login and on manual page refresh.
3. **Explicit private reads** – e.g. “Check” in Relay Configuration (pending-sync count), backfill, deletion sibling lookup.

## Visibility-based disconnect

The app also closes pool connections when the tab is **hidden** and reconnects when it becomes **visible** again. That reduces reconnect churn and request volume when the CypherLog PWA is in the background on mobile.

## When the private relay is read

1. **Login and page refresh** – Queries for your own data (appliances, vehicles, maintenance, projects, etc.) are routed to the private relay first so the UI can load plaintext quickly without decryption.
2. **You publish** – Writes go to the private relay.
3. **You run backfill** – Syncs from public to private (writes to private).
4. **You click “Check”** in Relay Configuration – One query to the private relay for the pending-sync count (manual only).

Other traffic (other users’ profiles, comments, zaps, DMs, etc.) never goes to the private relay through the pool.

To read from the private relay in custom code (e.g. a “Refresh from private” button), use a relay group:

```ts
const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
const privateGroup = nostr.group(privateRelayUrls);
const events = await privateGroup.query([{ kinds: [...], authors: [user.pubkey], ... }], { signal });
```
