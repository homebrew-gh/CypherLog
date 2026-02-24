# Kind 37004 (Subscription) – Event structure for FiatLife

CypherLog publishes subscription events (kind 37004) with the following tag layout so FiatLife and other clients can parse and display them without decrypting content.

## Tag reference

| Tag | Required | Description | Example |
|-----|----------|-------------|---------|
| `d` | Yes | Unique id (UUID) for replaceable/addressable semantics | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `alt` | Yes | Human-readable summary | `Subscription: Netflix` |
| `name` | Yes | Subscription name/description | `Netflix` |
| `subscription_type` | Yes | Category/type | `Streaming`, `Software`, etc. |
| `cost` | Yes | Decimal string (no currency symbol) | `15.99` |
| `billing_frequency` | Yes | One of: `weekly`, `monthly`, `quarterly`, `semi-annually`, `annually`, `one-time` | `monthly` |
| `currency` | No | ISO currency code | `USD` |
| `company_id` | No | Linked company id (CypherLog companies) | `uuid` |
| `company_name` | No | Company name if not linked | `Acme Corp` |
| `linked_asset_type` | No | `appliance`, `vehicle`, or `home_feature` | `appliance` |
| `linked_asset_id` | No | Id of linked asset | `uuid` |
| `linked_asset_name` | No | Name for display | `Living room TV` |
| `notes` | No | Free-form notes | `Annual plan` |
| `start_date` | No | When the subscription began (initial purchase). **MM/DD/YYYY**. | `01/15/2024` |
| `is_archived` | No | If present and `true`, subscription is archived | `true` |

The `client` tag (name + URL) is added by the publish layer and is not part of the subscription schema.

## Example event JSON (plaintext)

```json
{
  "kind": 37004,
  "pubkey": "<32-byte-hex-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["d", "a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
    ["alt", "Subscription: Netflix"],
    ["name", "Netflix"],
    ["subscription_type", "Streaming"],
    ["cost", "15.99"],
    ["billing_frequency", "monthly"],
    ["currency", "USD"],
    ["start_date", "01/15/2024"],
    ["client", "Cypher Log", "https://cypherlog.io"]
  ],
  "id": "<64-char-hex-event-id>",
  "sig": "<64-char-hex-signature>"
}
```

## Example with optional tags

```json
{
  "kind": 37004,
  "pubkey": "<pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["d", "sub-uuid"],
    ["alt", "Subscription: Spotify Family"],
    ["name", "Spotify Family"],
    ["subscription_type", "Music"],
    ["cost", "15.99"],
    ["billing_frequency", "monthly"],
    ["currency", "USD"],
    ["start_date", "06/01/2023"],
    ["company_name", "Spotify"],
    ["notes", "Annual discount applied"],
    ["client", "Cypher Log", "https://cypherlog.io"]
  ],
  "id": "<event-id>",
  "sig": "<signature>"
}
```

## Encrypted content

When encryption is enabled, `content` is NIP-44 ciphertext. The **tags above are still emitted** so FiatLife can show name, cost, frequency, type, and `start_date` without decrypting. Encrypted payload includes the same fields (plus any extra client-only data).

## Parsing notes for FiatLife

- **Required for display:** `d`, `alt`, `name`, `subscription_type`, `cost`, `billing_frequency`.
- **Optional for display:** `currency`, `start_date`, `company_name`, `notes`.
- **`start_date`:** String in **MM/DD/YYYY** format. When present, use as “subscription start” or “initial purchase date”.
- **`cost`:** Always a decimal string (e.g. `"15.99"`). Combine with `currency` for formatted amount.
- **`billing_frequency`:** Only the values listed above; normalize unknown values to `monthly` if needed.
