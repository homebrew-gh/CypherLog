# Kind 30078 (Subscription) – Event structure for FiatLife

CypherLog now publishes canonical subscription events on kind `30078` (replaceable, Amber-friendly).  
Legacy `37004` remains read-compatible during migration and should not be used for new writes.

## Tags for FiatLife (parse for display)

These are the tags FiatLife should use to render subscription cards. All other tags can be ignored.

| Tag | Required | Description | Example |
|-----|----------|-------------|---------|
| `d` | Yes | Namespaced stable replaceable key | `subscription:a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `id` | Yes | Raw subscription id | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `alt` | Yes | Human-readable summary | `Subscription: Netflix` |
| `name` | Yes | Subscription name/description | `Netflix` |
| `subscription_type` | Yes | Category/type | `Streaming`, `Software`, etc. |
| `cost` | Yes | Decimal string (no currency symbol) | `15.99` |
| `amount` | Yes | Alias of `cost` for compatibility | `15.99` |
| `billing_frequency` | Yes | One of: `weekly`, `monthly`, `quarterly`, `semi-annually`, `annually`, `one-time` | `monthly` |
| `recurrence` | Yes | Alias of `billing_frequency` | `monthly` |
| `currency` | No | ISO currency code | `USD` |
| `company_name` | No | Provider/company name (plain text; safe to show) | `Acme Corp` |
| `notes` | No | Free-form notes | `Annual plan` |
| `start_date` | No | When the subscription began (initial purchase). **MM/DD/YYYY**. | `01/15/2024` |
| `initial_purchase_date` | No | Alias of `start_date` | `01/15/2024` |
| `due_day` | No | Day-of-month due anchor (derived from start date when available) | `15` |
| `updated_at` | Yes | Logical update timestamp (unix seconds) | `1700000000` |
| `schema_version` | Yes | Subscription schema version | `2` |
| `is_archived` | No | If present and `true`, subscription is archived | `true` |

The `client` tag (name + URL) is added by the publish layer; you may ignore it for display.

## CypherLog-only tags (ignore in FiatLife)

These tags are used by CypherLog for **linking to companies** and **linking to assets** (appliances, vehicles, home features) inside CypherLog. They reference CypherLog-internal ids and entities. **FiatLife does not need to parse or display them**; they can be ignored.

| Tag | Purpose in CypherLog |
|-----|----------------------|
| `company_id` | Links subscription to a CypherLog company record (Companies tab). |
| `linked_asset_type` | Links to an appliance, vehicle, or home feature in CypherLog. |
| `linked_asset_id` | Id of the linked asset in CypherLog. |
| `linked_asset_name` | Display name for linked home feature (when type is home_feature). |

CypherLog will continue to emit these tags so that its own UI can show “linked company” and “linked asset” and navigate to them. FiatLife can treat the event as a normal subscription and only use the tags listed in “Tags for FiatLife” above.

## Example event JSON (plaintext)

```json
{
  "kind": 30078,
  "pubkey": "<32-byte-hex-pubkey>",
  "created_at": 1700000000,
  "content": "{\"id\":\"a1b2c3d4-e5f6-7890-abcd-ef1234567890\",\"name\":\"Netflix\",\"amount\":\"15.99\",\"recurrence\":\"monthly\",\"startDate\":\"01/15/2024\",\"dueDay\":\"15\",\"updatedAt\":1700000000,\"schemaVersion\":\"2\"}",
  "tags": [
    ["d", "subscription:a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
    ["id", "a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
    ["alt", "Subscription: Netflix"],
    ["name", "Netflix"],
    ["subscription_type", "Streaming"],
    ["cost", "15.99"],
    ["amount", "15.99"],
    ["billing_frequency", "monthly"],
    ["recurrence", "monthly"],
    ["currency", "USD"],
    ["start_date", "01/15/2024"],
    ["initial_purchase_date", "01/15/2024"],
    ["due_day", "15"],
    ["updated_at", "1700000000"],
    ["schema_version", "2"],
    ["client", "Cypher Log", "https://cypherlog.io"]
  ],
  "id": "<64-char-hex-event-id>",
  "sig": "<64-char-hex-signature>"
}
```

## Example with optional tags

```json
{
  "kind": 30078,
  "pubkey": "<pubkey>",
  "created_at": 1700000000,
  "content": "{\"id\":\"sub-uuid\",\"name\":\"Spotify Family\",\"amount\":\"15.99\",\"recurrence\":\"monthly\",\"startDate\":\"06/01/2023\",\"dueDay\":\"1\",\"updatedAt\":1700000000,\"schemaVersion\":\"2\",\"cypherlog\":{\"companyId\":\"company-uuid\",\"linkedAssetType\":\"vehicle\",\"linkedAssetId\":\"vehicle-uuid\"}}",
  "tags": [
    ["d", "subscription:sub-uuid"],
    ["id", "sub-uuid"],
    ["alt", "Subscription: Spotify Family"],
    ["name", "Spotify Family"],
    ["subscription_type", "Music"],
    ["cost", "15.99"],
    ["amount", "15.99"],
    ["billing_frequency", "monthly"],
    ["recurrence", "monthly"],
    ["currency", "USD"],
    ["start_date", "06/01/2023"],
    ["initial_purchase_date", "06/01/2023"],
    ["due_day", "1"],
    ["updated_at", "1700000000"],
    ["schema_version", "2"],
    ["company_name", "Spotify"],
    ["notes", "Annual discount applied"],
    ["client", "Cypher Log", "https://cypherlog.io"]
  ],
  "id": "<event-id>",
  "sig": "<signature>"
}
```

## Encrypted content

When encryption is enabled, `content` is NIP-44 ciphertext. The **tags above are still emitted** so FiatLife can show name, amount, recurrence, and due/start logic without decrypting. Encrypted payload includes the same fields (plus any extra client-only data).

## Migration behavior

- **Read support:** CypherLog reads both legacy `37004` and canonical `30078`.
- **Write support:** New creates/edits publish only `30078`.
- **Deterministic merge:** If both kinds exist for same logical subscription id, `30078` wins.
- **Deletion safety:** CypherLog emits tombstones that reference both `37004` and `30078` addresses and includes sibling event ids when available.

## Parsing notes for FiatLife

- **Required for display:** `d`, `id`, `alt`, `name`, `subscription_type`, `cost` (or `amount`), `billing_frequency` (or `recurrence`), `updated_at`, `schema_version`.
- **Optional for display:** `currency`, `start_date` / `initial_purchase_date`, `due_day`, `company_name`, `notes`.
- **Ignore for FiatLife:** `company_id`, `linked_asset_type`, `linked_asset_id`, `linked_asset_name` (CypherLog-specific linking; no need to include in FiatLife’s feature set).
- **`start_date` / `initial_purchase_date`:** String in **MM/DD/YYYY** format.
- **`due_day`:** Day-of-month string derived from start date when available.
- **`cost`:** Always a decimal string (e.g. `"15.99"`). Combine with `currency` for formatted amount.
- **`billing_frequency`:** Only the values listed above; normalize unknown values to `monthly` if needed.
- **Legacy:** Keep legacy `37004` read handling until migration window is complete.
