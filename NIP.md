# Home Log - Custom Nostr Event Kinds

This document describes the custom Nostr event kinds used by the Home Log application for managing home appliances, vehicles, and maintenance schedules.

## Kind 32627: Home Appliance

An addressable event representing a home appliance.

### Format

```json
{
  "kind": 32627,
  "content": "",
  "tags": [
    ["d", "<unique-identifier>"],
    ["alt", "Home appliance: <model>"],
    ["model", "<appliance model name>"],
    ["manufacturer", "<manufacturer name>"],
    ["purchase_date", "<MM/DD/YYYY>"],
    ["price", "<purchase price>"],
    ["room", "<room name>"],
    ["receipt_url", "<url to receipt file>"],
    ["manual_url", "<url to manual file>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier (UUID) for the appliance |
| `alt` | Yes | Human-readable description (NIP-31) |
| `model` | Yes | Model name/number of the appliance |
| `manufacturer` | No | Manufacturer name |
| `purchase_date` | No | Purchase date in MM/DD/YYYY format |
| `price` | No | Purchase price (e.g., "$599.99") |
| `room` | No | Room where the appliance is installed |
| `receipt_url` | No | URL to uploaded purchase receipt |
| `manual_url` | No | URL to uploaded electronic manual |

### Room Values

Standard room values include:
- bedroom
- bathroom
- dining room
- utility room
- office
- mudroom
- kitchen
- garage

Custom room names can also be used.

---

## Kind 32628: Vehicle

An addressable event representing a vehicle (car, truck, boat, plane, farm machinery, etc.).

### Format

```json
{
  "kind": 32628,
  "content": "",
  "tags": [
    ["d", "<unique-identifier>"],
    ["alt", "Vehicle: <name>"],
    ["name", "<vehicle display name>"],
    ["vehicle_type", "<type>"],
    ["make", "<manufacturer>"],
    ["model", "<model>"],
    ["year", "<year>"],
    ["purchase_date", "<MM/DD/YYYY>"],
    ["purchase_price", "<price>"],
    ["purchase_location", "<where vehicle was bought>"],
    ["license_plate", "<plate>"],
    ["mileage", "<mileage>"],
    ["fuel_type", "<fuel type>"],
    ["registration_expiry", "<MM/DD/YYYY>"],
    ["hull_id", "<HIN for boats>"],
    ["registration_number", "<registration for boats>"],
    ["engine_hours", "<hours>"],
    ["tail_number", "<aircraft tail number>"],
    ["hobbs_time", "<hobbs hours>"],
    ["serial_number", "<serial number>"],
    ["receipt_url", "<url>"],
    ["warranty_url", "<url>"],
    ["warranty_expiry", "<MM/DD/YYYY>"],
    ["document", "<url>", "<name>", "<uploadedAt>"],
    ["notes", "<notes>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier (UUID) for the vehicle |
| `alt` | Yes | Human-readable description (NIP-31) |
| `name` | Yes | Display name for the vehicle |
| `vehicle_type` | Yes | Type of vehicle (see Vehicle Types below) |
| `make` | No | Vehicle manufacturer |
| `model` | No | Vehicle model |
| `year` | No | Model year |
| `purchase_date` | No | Purchase date in MM/DD/YYYY format |
| `purchase_price` | No | Purchase price |
| `purchase_location` | No | Where the vehicle was bought (dealer, private party, etc.) |
| `license_plate` | No | License plate number |
| `mileage` | No | Current mileage |
| `fuel_type` | No | Fuel type (gasoline, diesel, electric, etc.) |
| `registration_expiry` | No | Registration expiration date |
| `hull_id` | No | Hull Identification Number (boats) |
| `registration_number` | No | Boat/aircraft registration number |
| `engine_hours` | No | Engine hours (boats, farm machinery) |
| `tail_number` | No | Aircraft tail number |
| `hobbs_time` | No | Hobbs meter hours (aircraft) |
| `serial_number` | No | Serial number (farm machinery) |
| `receipt_url` | No | URL to purchase receipt |
| `warranty_url` | No | URL to warranty document |
| `warranty_expiry` | No | Warranty expiration date |
| `document` | No | Document with format: url, name (optional), uploadedAt (optional). Can have multiple. Legacy: `document_url` with URL only is also supported. |
| `notes` | No | Additional notes |

### Vehicle Types

Standard vehicle types include:
- Personal Vehicle
- Recreational
- Farm Machinery
- Business Vehicle
- Boat
- Plane

Custom vehicle types can also be used.

---

## Kind 37003: Company/Service Provider

An addressable event representing a company or service provider.

### Format

```json
{
  "kind": 37003,
  "content": "",
  "tags": [
    ["d", "<unique-identifier>"],
    ["alt", "Company: <name>"],
    ["name", "<business or company name>"],
    ["service_type", "<service type>"],
    ["contact_name", "<primary contact person>"],
    ["phone", "<phone number>"],
    ["email", "<email address>"],
    ["website", "<website URL>"],
    ["address", "<street address>"],
    ["city", "<city>"],
    ["state", "<state>"],
    ["zip_code", "<zip code>"],
    ["license_number", "<license number>"],
    ["insurance_info", "<insurance details>"],
    ["rating", "<1-5>"],
    ["invoice", "<url>", "<date>", "<amount>", "<description>"],
    ["notes", "<notes>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier (UUID) for the company |
| `alt` | Yes | Human-readable description (NIP-31) |
| `name` | Yes | Business or company name |
| `service_type` | Yes | Type of service (see Service Types below) |
| `contact_name` | No | Primary contact person |
| `phone` | No | Phone number |
| `email` | No | Email address |
| `website` | No | Website URL |
| `address` | No | Street address |
| `city` | No | City |
| `state` | No | State |
| `zip_code` | No | Zip/postal code |
| `license_number` | No | License number |
| `insurance_info` | No | Insurance provider and policy details |
| `rating` | No | Rating from 1-5 stars |
| `invoice` | No | Invoice/receipt with format: url, date (MM/DD/YYYY), amount (optional), description (optional). Can have multiple. |
| `notes` | No | Additional notes |

### Invoice Tag Format

The `invoice` tag stores uploaded invoices/receipts with metadata:

```
["invoice", "<url>", "<date>", "<amount>", "<description>"]
```

- `url` (required): URL to the uploaded invoice file (PDF or image)
- `date` (required): Date of the invoice in MM/DD/YYYY format
- `amount` (optional): Invoice amount (e.g., "$150.00")
- `description` (optional): Brief description of the service

Multiple invoice tags can be present for a single contractor to track service history.

### Service Types

Standard service types include:
- Plumber
- Electrician
- HVAC
- Landscaping
- Roofing
- General Contractor
- Pest Control
- Cleaning Service
- Pool/Spa Service
- Appliance Repair
- Handyman
- Painting
- Flooring
- Tree Service
- Septic/Sewer
- Other

Custom service types can also be used.

### Privacy Note

Invoice files are considered sensitive documents and should only be uploaded to private/trusted media servers. The application enforces this by requiring a private Blossom server to be configured before allowing invoice uploads.

Note: This kind was previously called "Contractor/Service Provider" and has been renamed to "Company/Service Provider" for broader applicability.

---

## Kind 37005: Company Work Log

A regular event (kind 37005) representing a single record of work done by a company or service provider. Used to log jobs, service visits, and invoices with description, price, completion date (or date range), notes, and optional invoice upload.

### Format

```json
{
  "kind": 37005,
  "content": "<optional encrypted JSON when using encryption>",
  "tags": [
    ["a", "37003:<pubkey>:<company-d-tag>", "", "company"],
    ["company_id", "<company d-tag>"],
    ["alt", "<human-readable description or 'Encrypted Cypher Log company work log'>"],
    ["description", "<brief description of work done>"],
    ["total_price", "<e.g. $150.00>"],
    ["completed_date", "<MM/DD/YYYY>"],
    ["completed_date_start", "<MM/DD/YYYY>"],
    ["completed_date_end", "<MM/DD/YYYY>"],
    ["notes", "<notes>"],
    ["invoice_url", "<url to uploaded invoice>"]
  ]
}
```

When encryption is enabled for the companies category, the event `content` contains NIP-44 encrypted JSON with the same logical fields; only the `alt` and reference tags remain in plaintext.

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `a` | Yes | Reference to the company (kind 37003) in the form `37003:<pubkey>:<company-d-tag>` |
| `company_id` | Yes | Company d-tag (same as in the `a` tag) |
| `alt` | Yes | Human-readable description (NIP-31) or "Encrypted Cypher Log company work log" when encrypted |
| `description` | Yes (plaintext) / in content (encrypted) | Brief description of the work done |
| `total_price` | No | Total price (e.g., "$150.00") |
| `completed_date` | No* | Single completion date in MM/DD/YYYY when work was done on one day |
| `completed_date_start` | No* | Start of date range in MM/DD/YYYY when work spanned multiple days |
| `completed_date_end` | No* | End of date range in MM/DD/YYYY. Use with `completed_date_start`; mutually exclusive with `completed_date` for a single date. |
| `notes` | No | Additional notes |
| `invoice_url` | No | URL to uploaded invoice/receipt (e.g., from Blossom) |

\* Either `completed_date` or both `completed_date_start` and `completed_date_end` should be provided to indicate when the work was completed.

### Storage

Kind 37005 is a regular event (1000–9999 range). Relays store all events; multiple work log events per company are expected. Clients query by `authors: [pubkey]` and filter or index by `company_id` to show work history per company.

---

## Kind 30229: Maintenance Schedule

An addressable event representing a maintenance schedule for an appliance or vehicle.

### Format

```json
{
  "kind": 30229,
  "content": "",
  "tags": [
    ["d", "<unique-identifier>"],
    ["alt", "Maintenance schedule: <description>"],
    ["a", "32627:<pubkey>:<appliance-d-tag>", "", "appliance"],
    ["a", "32628:<pubkey>:<vehicle-d-tag>", "", "vehicle"],
    ["a", "37003:<pubkey>:<contractor-d-tag>", "", "contractor"],
    ["description", "<maintenance description>"],
    ["part_number", "<part number>"],
    ["frequency", "<number>"],
    ["frequency_unit", "days|weeks|months|years"],
    ["mileage_interval", "<miles>"],
    ["is_log_only", "true"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier (UUID) for the maintenance schedule |
| `alt` | Yes | Human-readable description (NIP-31) |
| `a` | Conditional | Reference to an appliance (kind 32627), vehicle (kind 32628), or company (kind 37003). At least one appliance, vehicle, or home feature reference is required. Company reference is optional. |
| `description` | Yes | Description of the maintenance task |
| `part_number` | No | Part number for replacement parts |
| `frequency` | Conditional | Numeric frequency value. Required unless `is_log_only` is true. |
| `frequency_unit` | Conditional | Unit of frequency: days, weeks, months, or years. Required unless `is_log_only` is true. |
| `mileage_interval` | No | Mileage interval for vehicle maintenance (e.g., every 5000 miles). Only applicable for scheduled maintenance. |
| `is_log_only` | No | If "true", this is log-only maintenance with no recurring schedule |

### Notes

- Each maintenance schedule references either an appliance OR a vehicle, not both
- Vehicle maintenance can optionally include a mileage interval in addition to time-based frequency
- The `a` tag marker indicates whether the reference is to an "appliance", "vehicle", or "company"
- A company/service provider reference can be optionally added to link the maintenance task to a service provider from the Company/Service tab

### Log-Only Maintenance

Vehicle maintenance supports a "log-only" mode for tasks that don't have a recurring schedule. This is useful for tracking irregular maintenance like:
- Tire rotation when needed
- Brake pad replacement
- Battery replacement
- Window tinting
- Any ad-hoc maintenance

When `is_log_only` is "true":
- The `frequency` and `frequency_unit` tags are omitted
- No due dates are calculated
- The UI displays "Last completed: <date>" instead of a due date
- Users can still record completion events to track when the task was performed

### Due Date Calculation

For scheduled (non-log-only) maintenance, the next due date is calculated by:
1. Taking the `purchase_date` from the referenced appliance (kind 32627) or vehicle (kind 32628) event
2. Adding the maintenance `frequency` × `frequency_unit` to get the first due date
3. For subsequent due dates, continue adding the frequency interval

For example, if an appliance was purchased on 01/15/2024 and has a maintenance frequency of 3 months, the due dates would be:
- 04/15/2024
- 07/15/2024
- 10/15/2024
- etc.

### Encryption (NIP-44)

When the maintenance category has encryption enabled in Cypher Log settings, sensitive data is stored in the `content` field as NIP-44 encrypted JSON. Only structural tags remain in plaintext:

- **Plaintext tags (always):** `d`, `alt`, `a` (appliance/vehicle/company references only). These use UUIDs and do not reveal what is being maintained.
- **Encrypted content (when encryption on):** JSON with `description`, `frequency`, `frequency_unit`, `home_feature`, `part_number`, `parts`, `mileage_interval`, `interval_type`, `isLogOnly`, `isArchived`.

This prevents relay operators from inferring property (e.g. "oil change every 3 months", "HVAC filter") from maintenance events. Legacy events with plaintext tags are still read; new events use encrypted content when encryption is enabled.

---

## Kind 9413: Maintenance Completion

A regular event recording the completion of a maintenance task.

### Format

```json
{
  "kind": 9413,
  "content": "",
  "tags": [
    ["a", "30229:<pubkey>:<maintenance-d-tag>", "", "maintenance"],
    ["alt", "Maintenance completed on <MM/DD/YYYY>"],
    ["completed_date", "<MM/DD/YYYY>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `a` | Yes | Reference to the maintenance schedule (kind 30229) this completion is for |
| `alt` | Yes | Human-readable description (NIP-31) |
| `completed_date` | Yes | Date the maintenance was completed in MM/DD/YYYY format |
| `mileage_at_completion` | No | Mileage at time of completion (for vehicle maintenance) |
| `notes` | No | Notes about the completion |

### Notes

- Multiple completion events can exist for a single maintenance schedule, creating a history of when maintenance was performed
- Completion events are regular events (not replaceable) so the full history is preserved
- Completions are displayed chronologically under each maintenance item
- For vehicle maintenance, recording mileage at completion helps track usage-based maintenance intervals

### Encryption (NIP-44)

When the maintenance category has encryption enabled, sensitive completion data is stored in the `content` field as NIP-44 encrypted JSON:

- **Plaintext tags (always):** `a` (reference to maintenance schedule), `alt`. The `a` tag uses the maintenance UUID and does not reveal task details.
- **Encrypted content (when encryption on):** JSON with `completedDate`, `mileageAtCompletion`, `notes`, `parts`.

Legacy events with plaintext tags (`completed_date`, `notes`, `part`, etc.) are still read; new events use encrypted content when encryption is enabled.

---

## Kind 30078: Subscription

An addressable/replaceable event representing a recurring subscription or service.

Legacy kind `37004` remains read-compatible during migration. New creates/edits use kind `30078`.

### Format

```json
{
  "kind": 30078,
  "content": "",
  "tags": [
    ["d", "subscription:<unique-identifier>"],
    ["id", "<unique-identifier>"],
    ["alt", "Subscription: <name>"],
    ["name", "<subscription name/description>"],
    ["subscription_type", "<type>"],
    ["cost", "<cost>"],
    ["amount", "<cost alias>"],
    ["currency", "<currency code>"],
    ["billing_frequency", "<frequency>"],
    ["recurrence", "<frequency alias>"],
    ["start_date", "<MM/DD/YYYY>"],
    ["initial_purchase_date", "<MM/DD/YYYY>"],
    ["due_day", "<1-31>"],
    ["updated_at", "<unix-seconds>"],
    ["schema_version", "2"],
    ["company_id", "<company-d-tag>"],
    ["company_name", "<manual company name>"],
    ["linked_asset_type", "<appliance|vehicle|home_feature>"],
    ["linked_asset_id", "<asset-d-tag>"],
    ["linked_asset_name", "<asset name>"],
    ["notes", "<notes>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Namespaced stable identifier: `subscription:<id>` |
| `id` | Yes | Raw unique identifier (UUID) for the subscription |
| `alt` | Yes | Human-readable description (NIP-31) |
| `name` | Yes | Name or description of the subscription |
| `subscription_type` | Yes | Type of subscription (see Subscription Types below) |
| `cost` | Yes | Cost/price of the subscription (e.g., "15.99") |
| `amount` | Yes | Alias of `cost` for interoperability |
| `currency` | No | Currency code (e.g., "USD", "EUR", "BTC"). Defaults to user's entry currency. |
| `billing_frequency` | Yes | How often the subscription is billed (see Billing Frequencies below) |
| `recurrence` | Yes | Alias of `billing_frequency` |
| `start_date` | No | Subscription start date in MM/DD/YYYY format |
| `initial_purchase_date` | No | Alias of `start_date` |
| `due_day` | No | Day-of-month due anchor (derived from start date when available) |
| `updated_at` | Yes | Last logical update timestamp (unix seconds) |
| `schema_version` | Yes | Payload schema version |
| `company_id` | No | Reference to a Company/Service Provider (d-tag from kind 37003). Mutually exclusive with `company_name`. |
| `company_name` | No | Manual company name entry. Mutually exclusive with `company_id`. |
| `linked_asset_type` | No | Type of linked asset: `appliance`, `vehicle`, or `home_feature` |
| `linked_asset_id` | No | Reference to the linked asset's d-tag (for appliances and vehicles) |
| `linked_asset_name` | No | Name of the linked asset (required for home features, optional for appliances/vehicles) |
| `notes` | No | Additional notes about the subscription |

### Subscription Types

Standard subscription types include:
- Streaming
- Software
- Health/Wellness
- Shopping
- Vehicle
- Food
- Gaming
- News/Media
- Music
- Home
- Finance
- Pet Care

Custom subscription types can also be used.

### Billing Frequencies

Valid billing frequency values:
- `weekly` - Billed weekly
- `monthly` - Billed monthly
- `quarterly` - Billed every 3 months
- `semi-annually` - Billed every 6 months
- `annually` - Billed yearly
- `one-time` - One-time purchase (not recurring)

### Company Linking

Subscriptions can optionally be linked to a company/service provider in two ways:

1. **By reference** (`company_id`): Links to an existing company from the Companies/Services tab using the company's `d` tag identifier. This creates a two-way relationship where the company card shows active subscriptions.

2. **By name** (`company_name`): Manually entered company name for subscriptions that don't need a full company record.

Only one of `company_id` or `company_name` should be present.

### Asset Linking

Subscriptions can optionally be linked to an asset (appliance, vehicle, or home feature) to organize subscriptions by the items they relate to. This is useful for:

- Warranty service plans linked to specific appliances
- Vehicle service subscriptions (roadside assistance, maintenance plans)
- Home feature service contracts (lawn care, pool maintenance)

The linked asset is defined by three optional tags:

1. **`linked_asset_type`**: The type of asset - `appliance`, `vehicle`, or `home_feature`
2. **`linked_asset_id`**: The d-tag of the linked appliance (kind 32627) or vehicle (kind 32628)
3. **`linked_asset_name`**: The name of the asset for display purposes

For appliances and vehicles, `linked_asset_id` is required. For home features, only `linked_asset_name` is used (since home features are not separate Nostr events).

### Round-trip preservation

- Unknown tags on existing subscription events are preserved on CypherLog edits.
- Unknown payload keys are preserved when prior payload is readable (plain or decryptable).
- If encrypted payload cannot be decrypted on update, CypherLog preserves tags and writes managed fields safely, but unknown encrypted payload keys may not round-trip.

### Migration behavior

- **Dual read:** Clients should read both `37004` and `30078` during migration.
- **Canonical write:** New creates/edits publish `30078`.
- **Deterministic merge:** For duplicate logical subscription ids, prefer `30078`, then latest `updated_at`/`created_at`.
- **Deletion:** CypherLog emits kind-5 tombstones referencing both legacy and new addresses plus sibling `e` tags where available.

### Security Warning

The notes field should NOT be used to store login credentials, passwords, or other sensitive authentication information. Users should use a dedicated password manager for storing such data securely.

---

## Kind 35043: Warranty

An addressable event representing a product warranty or service protection plan.

### Format

```json
{
  "kind": 35043,
  "content": "",
  "tags": [
    ["d", "<unique-identifier>"],
    ["alt", "Warranty: <name>"],
    ["name", "<product name>"],
    ["warranty_type", "<type>"],
    ["description", "<warranty description>"],
    ["purchase_date", "<MM/DD/YYYY>"],
    ["purchase_price", "<price>"],
    ["warranty_start_date", "<MM/DD/YYYY>"],
    ["warranty_end_date", "<MM/DD/YYYY>"],
    ["warranty_length_value", "<number>"],
    ["warranty_length_unit", "weeks|months|years"],
    ["is_lifetime", "true"],
    ["linked_type", "appliance|vehicle|home_feature|custom"],
    ["linked_item_id", "<item-d-tag>"],
    ["linked_item_name", "<item name>"],
    ["company_id", "<company-d-tag>"],
    ["company_name", "<company name>"],
    ["is_registered", "true|false"],
    ["registration_date", "<MM/DD/YYYY>"],
    ["registration_number", "<registration number>"],
    ["registration_notes", "<notes>"],
    ["has_extended_warranty", "true|false"],
    ["extended_warranty_provider", "<provider name>"],
    ["extended_warranty_end_date", "<MM/DD/YYYY>"],
    ["extended_warranty_cost", "<cost>"],
    ["extended_warranty_notes", "<notes>"],
    ["document", "<url>", "<name>", "<uploadedAt>"],
    ["receipt_url", "<url>"],
    ["notes", "<notes>"],
    ["is_archived", "true"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier (UUID) for the warranty |
| `alt` | Yes | Human-readable description (NIP-31) |
| `name` | Yes | Product or item name |
| `warranty_type` | Yes | Type of warranty (see Warranty Types below) |
| `description` | No | Description of warranty coverage |
| `purchase_date` | No | Purchase date in MM/DD/YYYY format |
| `purchase_price` | No | Purchase price |
| `warranty_start_date` | No | Warranty start date (defaults to purchase date) |
| `warranty_end_date` | No | Warranty expiration date in MM/DD/YYYY format |
| `warranty_length_value` | No | Numeric warranty duration |
| `warranty_length_unit` | No | Duration unit: `weeks`, `months`, or `years` |
| `is_lifetime` | No | If "true", warranty has no expiration |
| `linked_type` | No | Type of linked item: `appliance`, `vehicle`, `home_feature`, or `custom` |
| `linked_item_id` | No | Reference to linked appliance/vehicle d-tag |
| `linked_item_name` | No | Name of linked item (for display or custom items) |
| `company_id` | No | Reference to a Company (d-tag from kind 37003) |
| `company_name` | No | Manual company name entry |
| `is_registered` | No | Whether warranty has been registered with manufacturer |
| `registration_date` | No | Date of warranty registration |
| `registration_number` | No | Registration/confirmation number |
| `registration_notes` | No | Notes about registration |
| `has_extended_warranty` | No | If "true", an extended warranty was purchased |
| `extended_warranty_provider` | No | Provider of extended warranty |
| `extended_warranty_end_date` | No | Extended warranty expiration date |
| `extended_warranty_cost` | No | Cost of extended warranty |
| `extended_warranty_notes` | No | Notes about extended warranty |
| `document` | No | Warranty document with format: url, name (optional), uploadedAt (optional). Can have multiple. |
| `receipt_url` | No | URL to purchase receipt |
| `notes` | No | Additional notes |
| `is_archived` | No | If "true", the warranty is archived |

### Warranty Types

Standard warranty types include:
- Automotive
- Appliance
- Electronics
- Tools
- Furniture
- Outdoor Gear
- Home Features
- Jewelry
- Medical
- Pet Products

Custom warranty types can also be used.

### Item Linking

Warranties can be linked to assets in the system:

1. **Appliances** (`linked_type: "appliance"`): Links to a My Stuff item (kind 32627)
2. **Vehicles** (`linked_type: "vehicle"`): Links to a Vehicle (kind 32628)
3. **Home Features** (`linked_type: "home_feature"`): Links by name only (no Nostr event)
4. **Custom** (`linked_type: "custom"`): For items not tracked elsewhere

### Extended Warranty Tracking

Warranties support tracking of extended protection plans purchased separately from the manufacturer's warranty. When `has_extended_warranty` is true, the extended warranty fields provide details about the additional coverage.

### Privacy Considerations

Warranty records may contain sensitive information (purchase prices, registration numbers). Users should consider enabling encryption for the "warranties" data category.

---

## Kind 38033: Pet/Animal

An addressable event representing a pet or animal.

### Format

```json
{
  "kind": 38033,
  "content": "",
  "tags": [
    ["d", "<unique-identifier>"],
    ["alt", "Pet: <name>"],
    ["name", "<pet name>"],
    ["pet_type", "<type>"],
    ["species", "<species/breed type>"],
    ["breed", "<breed>"],
    ["birth_date", "<MM/DD/YYYY>"],
    ["adoption_date", "<MM/DD/YYYY>"],
    ["weight", "<weight>"],
    ["color", "<color>"],
    ["sex", "<male|female|unknown>"],
    ["is_neutered", "true"],
    ["microchip_id", "<microchip number>"],
    ["license_number", "<license number>"],
    ["vet_clinic", "<vet clinic name>"],
    ["vet_phone", "<phone number>"],
    ["allergies", "<allergies>"],
    ["medications", "<medications>"],
    ["medical_conditions", "<conditions>"],
    ["last_vet_visit", "<MM/DD/YYYY>"],
    ["photo_url", "<url>"],
    ["document_url", "<url>"],
    ["notes", "<notes>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier (UUID) for the pet |
| `alt` | Yes | Human-readable description (NIP-31) |
| `name` | Yes | Pet's name |
| `pet_type` | Yes | Type of pet (see Pet Types below) |
| `species` | No | Species or breed type (e.g., "Golden Retriever") |
| `breed` | No | Breed information |
| `birth_date` | No | Birth date in MM/DD/YYYY format |
| `adoption_date` | No | Adoption date in MM/DD/YYYY format |
| `weight` | No | Weight (e.g., "45 lbs") |
| `color` | No | Coloring/markings |
| `sex` | No | Sex: `male`, `female`, or `unknown` |
| `is_neutered` | No | If "true", the pet is spayed/neutered |
| `microchip_id` | No | Microchip identification number |
| `license_number` | No | Pet license number |
| `vet_clinic` | No | Name of veterinary clinic |
| `vet_phone` | No | Veterinary clinic phone number |
| `allergies` | No | Known allergies |
| `medications` | No | Current medications |
| `medical_conditions` | No | Ongoing medical conditions |
| `last_vet_visit` | No | Date of last veterinary visit in MM/DD/YYYY format |
| `photo_url` | No | URL to pet's photo |
| `document_url` | No | URL to additional documents (can have multiple) |
| `notes` | No | Additional notes |

### Pet Types

Standard pet types include:
- Dog
- Cat
- Bird
- Fish
- Reptile
- Small Mammal
- Horse
- Livestock
- Other

Custom pet types can also be used.

### Privacy Considerations

Pet records may contain sensitive personal information (vet details, microchip IDs). Users should consider enabling encryption for this data category when using the application.

---

## Kind 35389: Project

An addressable event representing a home/farm project for tracking renovations, improvements, or other work.

### Format

```json
{
  "kind": 35389,
  "content": "",
  "tags": [
    ["d", "<unique-identifier>"],
    ["alt", "Project: <name>"],
    ["name", "<project name>"],
    ["description", "<project description>"],
    ["start_date", "<MM/DD/YYYY>"],
    ["target_completion_date", "<MM/DD/YYYY>"],
    ["status", "<planning|in_progress|on_hold|completed>"],
    ["budget", "<budget amount>"],
    ["completion_date", "<MM/DD/YYYY>"],
    ["notes", "<notes>"],
    ["a", "37003:<pubkey>:<company-d-tag>", "", "company"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier (UUID) for the project |
| `alt` | Yes | Human-readable description (NIP-31) |
| `name` | Yes | Project name |
| `description` | No | Brief description of the project |
| `start_date` | Yes | Start date in MM/DD/YYYY format |
| `target_completion_date` | No | Target completion date in MM/DD/YYYY format |
| `status` | No | Project status: `planning`, `in_progress`, `on_hold`, or `completed` |
| `budget` | No | Budget amount (e.g., "$5,000") |
| `completion_date` | No | Actual completion date in MM/DD/YYYY format |
| `notes` | No | Additional notes |
| `a` | No | Reference to linked companies (kind 37003). Can have multiple. |
| `is_archived` | No | If "true", the project is archived |

### Project Status

Valid status values:
- `planning` - Project is in the planning phase
- `in_progress` - Work is actively being done
- `on_hold` - Project is temporarily paused
- `completed` - Project is finished

### Company Linking

Projects can be linked to one or more companies/service providers using the `a` tag format:

```
["a", "37003:<pubkey>:<company-d-tag>", "", "company"]
```

Multiple `a` tags can be present to link multiple companies to a single project. This is useful for tracking all contractors, suppliers, and service providers involved in a project.

---

## Kind 1661: Project Entry (Progress Diary)

A regular event representing a progress diary entry for a project.

### Format

```json
{
  "kind": 1661,
  "content": "",
  "tags": [
    ["a", "35389:<pubkey>:<project-d-tag>", "", "project"],
    ["alt", "Project entry: <title or date>"],
    ["entry_date", "<MM/DD/YYYY>"],
    ["title", "<optional title>"],
    ["content_text", "<entry notes>"],
    ["image", "<photo url>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `a` | Yes | Reference to the parent project (kind 35389) |
| `alt` | Yes | Human-readable description (NIP-31) |
| `entry_date` | Yes | Date of the entry in MM/DD/YYYY format |
| `title` | No | Optional title for the entry |
| `content_text` | Yes | Main text content (notes, observations, etc.) |
| `image` | No | URL to an uploaded photo. Can have multiple for multiple photos. |

### Notes

- Project entries are regular events (not replaceable) so the full history is preserved
- Entries are displayed chronologically under each project
- Multiple photos can be attached to a single entry using multiple `image` tags
- Entries can be deleted using kind 5 deletion events with an `e` tag referencing the entry event ID

### Future Enhancements

Project entries are designed to support future long-form publishing to Nostr. The content structure is compatible with NIP-23 long-form content, allowing entries to potentially be shared publicly on Nostr clients like Primal.

---

## Kind 4209: Project Task

A regular event representing a to-do item for a project.

### Format

```json
{
  "kind": 4209,
  "content": "",
  "tags": [
    ["a", "35389:<pubkey>:<project-d-tag>", "", "project"],
    ["alt", "Task: <description>"],
    ["description", "<task description>"],
    ["is_completed", "true|false"],
    ["completed_date", "<MM/DD/YYYY>"],
    ["priority", "low|medium|high"],
    ["due_date", "<MM/DD/YYYY>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `a` | Yes | Reference to the parent project (kind 35389) |
| `alt` | Yes | Human-readable description (NIP-31) |
| `description` | Yes | Task description |
| `is_completed` | Yes | Whether the task is done ("true" or "false") |
| `completed_date` | No | Date when task was completed in MM/DD/YYYY format |
| `priority` | No | Task priority: `low`, `medium`, or `high` |
| `due_date` | No | Optional due date in MM/DD/YYYY format |

### Notes

- Tasks are regular events (not replaceable) so changes create new events
- To update a task (e.g., mark complete), delete the old event and create a new one
- Tasks are sorted by priority (high first) and then by creation date
- Completed tasks are displayed separately from incomplete tasks

---

## Kind 8347: Project Material/Expense

A regular event representing a material or expense item for a project.

### Format

```json
{
  "kind": 8347,
  "content": "",
  "tags": [
    ["a", "35389:<pubkey>:<project-d-tag>", "", "project"],
    ["alt", "Material: <name>"],
    ["name", "<item name>"],
    ["category", "<expense category>"],
    ["quantity", "<number>"],
    ["unit", "<unit of measurement>"],
    ["unit_price", "<price per unit>"],
    ["total_price", "<total price>"],
    ["is_purchased", "true|false"],
    ["purchased_date", "<MM/DD/YYYY>"],
    ["vendor", "<vendor/store name>"],
    ["notes", "<notes>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `a` | Yes | Reference to the parent project (kind 35389) |
| `alt` | Yes | Human-readable description (NIP-31) |
| `name` | Yes | Item name |
| `category` | Yes | Expense category (see categories below) |
| `quantity` | No | Quantity needed |
| `unit` | No | Unit of measurement (e.g., "sq ft", "each", "hours") |
| `unit_price` | No | Price per unit |
| `total_price` | Yes | Total price for this item |
| `is_purchased` | Yes | Whether the item has been purchased ("true" or "false") |
| `purchased_date` | No | Date when item was purchased in MM/DD/YYYY format |
| `vendor` | No | Where the item was/will be purchased |
| `notes` | No | Additional notes |

### Expense Categories

Valid category values:
- `materials` - Building materials, supplies
- `labor` - Labor costs, contractor fees
- `rentals` - Equipment rentals
- `permits` - Permits and fees
- `tools` - Tools purchased for the project
- `delivery` - Delivery fees
- `other` - Miscellaneous expenses

### Budget Tracking

Materials and expenses are used to track project budgets:

1. **Total Planned**: Sum of all `total_price` values
2. **Total Spent**: Sum of `total_price` for items where `is_purchased` is "true"
3. **Remaining**: Original budget minus total spent
4. **Category Breakdown**: Expenses grouped by category for analysis

The application compares these totals against the project's `budget` field (if set) to show remaining budget and over/under budget status.

---

## Kind 8348: Project Research/Planning Note

A regular event representing a structured research or planning note for a project. Each note is timestamped when created and can include optional documents and quotes.

### Format

```json
{
  "kind": 8348,
  "content": "",
  "tags": [
    ["a", "35389:<pubkey>:<project-d-tag>", "", "project"],
    ["alt", "Research: <description>"],
    ["description", "<note title/summary>"],
    ["content_text", "<main note text>"],
    ["documents", "<JSON array of {url, name?}>"],
    ["quotes", "<JSON array of quote strings>"]
  ]
}
```

When encryption is enabled for projects, the payload (description, content_text, documents, quotes) is stored in the encrypted `content` and only the `a` and `alt` tags are in plaintext.

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `a` | Yes | Reference to the parent project (kind 35389) |
| `alt` | Yes | Human-readable description (NIP-31) |
| `description` | Yes | Title or summary of the note |
| `content_text` | Yes | Main note text |
| `documents` | No | JSON array of objects with `url` (required) and optional `name` for file/link attachments |
| `quotes` | No | JSON array of strings for quotes or references |

### Behavior

- Notes are displayed in a Research & Planning section on the project page, stacked one above the other.
- Users can sort notes by **Newest first** or **Oldest first**.
- Each note shows its creation timestamp (from the event `created_at`).
- Documents are shown as links; quotes are shown in a distinct style.

---

## Kind 30100: Property Profile

An addressable event representing a single property (e.g. primary home). One event per property; replaceable by `kind:pubkey:d-tag`. Single-property mode uses `d` tag `"default"`. For multi-property design see `docs/MULTI_PROPERTY_PLAN.md`.

### Format

```json
{
  "kind": 30100,
  "content": "",
  "tags": [
    ["d", "<property-id>"],
    ["alt", "Property: <name>"],
    ["name", "<display name or address>"],
    ["year_built", "<year>"],
    ["square_footage", "<value>"],
    ["roof_type", "<type>"],
    ["roof_age", "<age>"],
    ["hvac_type", "<type>"],
    ["heating_cooling", "<description>"],
    ["lot_size", "<value>"],
    ["bedrooms", "<number>"],
    ["bathrooms", "<number>"],
    ["water_source", "well|municipal|other"],
    ["sewer_type", "septic|municipal|other"],
    ["notes", "<text>"]
  ]
}
```

When encryption is enabled for projects, the payload is stored in encrypted `content` and only `d` and `alt` are in plaintext.

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier; use `default` for single-property mode |
| `alt` | Yes | Human-readable description (NIP-31) |
| `name` | Yes | Display name or address (e.g. "123 Main St" or "Primary Home") |
| `year_built` | No | Year built (integer) |
| `square_footage` | No | Square footage (string) |
| `roof_type` | No | Roof type (e.g. asphalt shingle) |
| `roof_age` | No | Roof age (e.g. "5 years") |
| `hvac_type` | No | HVAC type |
| `heating_cooling` | No | Heating/cooling description |
| `lot_size` | No | Lot size (e.g. "0.25 acres") |
| `bedrooms` | No | Number of bedrooms |
| `bathrooms` | No | Number of bathrooms |
| `water_source` | No | `well`, `municipal`, or `other` |
| `sewer_type` | No | `septic`, `municipal`, or `other` |
| `notes` | No | Additional notes |

### Behavior

- Shown as a **Property Profile** card at the top of the Home tab dashboard.
- Single-property mode: the app uses the property with `d` = `"default"` or the first property if none is default.
- Stored and synced like other addressable kinds; encrypted when project encryption is enabled.

---

## Kind 7443: Vet Visit

A regular event representing a veterinary visit for a pet/animal.

### Format

```json
{
  "kind": 7443,
  "content": "",
  "tags": [
    ["a", "38033:<pubkey>:<pet-d-tag>", "", "pet"],
    ["alt", "Vet visit on <MM/DD/YYYY>"],
    ["visit_date", "<MM/DD/YYYY>"],
    ["visit_type", "<type>"],
    ["reason", "<reason for visit>"],
    ["vet_clinic", "<clinic name>"],
    ["veterinarian", "<vet name>"],
    ["diagnosis", "<diagnosis>"],
    ["treatment", "<treatment provided>"],
    ["prescriptions", "<medications prescribed>"],
    ["weight", "<weight at visit>"],
    ["vaccination", "<vaccination name>"],
    ["follow_up_date", "<MM/DD/YYYY>"],
    ["follow_up_notes", "<notes>"],
    ["cost", "<visit cost>"],
    ["document_url", "<url>"],
    ["notes", "<notes>"]
  ]
}
```

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `a` | Yes | Reference to the pet (kind 38033) this visit is for |
| `alt` | Yes | Human-readable description (NIP-31) |
| `visit_date` | Yes | Date of the visit in MM/DD/YYYY format |
| `visit_type` | Yes | Type of visit (see Visit Types below) |
| `reason` | Yes | Reason for the visit |
| `vet_clinic` | No | Name of veterinary clinic |
| `veterinarian` | No | Name of the veterinarian |
| `diagnosis` | No | Diagnosis or findings from the visit |
| `treatment` | No | Treatment provided during the visit |
| `prescriptions` | No | Medications prescribed |
| `weight` | No | Pet's weight at the time of visit (e.g., "45 lbs") |
| `vaccination` | No | Vaccination given. Can have multiple for multiple vaccinations. |
| `follow_up_date` | No | Scheduled follow-up appointment date in MM/DD/YYYY format |
| `follow_up_notes` | No | Notes about the follow-up appointment |
| `cost` | No | Cost of the visit (e.g., "$150.00") |
| `document_url` | No | URL to uploaded documents (receipts, records). Can have multiple. |
| `notes` | No | Additional notes about the visit |

### Visit Types

Valid visit type values:
- `checkup` - Routine Checkup
- `vaccination` - Vaccination
- `illness` - Illness/Injury
- `surgery` - Surgery
- `dental` - Dental Care
- `grooming` - Grooming
- `emergency` - Emergency
- `follow_up` - Follow-up
- `other` - Other

### Notes

- Vet visits are regular events (not replaceable) so the full visit history is preserved
- Visits are displayed chronologically under each pet, with most recent first
- Multiple vaccinations can be recorded in a single visit using multiple `vaccination` tags
- The application automatically updates the pet's `last_vet_visit` and optionally `weight` when a new visit is logged
- Follow-up appointments are highlighted in the UI when approaching or overdue
- Vet visits can be deleted using kind 5 deletion events with an `e` tag referencing the visit event ID

### Privacy Considerations

Vet visit records may contain sensitive information about pet health and medical history. All Cypher Log data categories (including pets and vet visits) are encrypted by default on public relays; data on relays marked as private is stored in plaintext on that relay only.

---

## Private Relays and Dual Publish (Cypher Log)

Cypher Log extends standard Nostr usage with **private relays**: relays you mark as private receive **plaintext** copies of your data (for self-hosted or trusted use), while all other relays receive **NIP-44 encrypted** copies. Private relay URLs are stored encrypted in app preferences and are excluded from your public relay list.

### NIP-78: Private Relay List

- The NIP-78 app data event (kind 30078, identifier `cypherlog/preferences`) may include a field **`privateRelays`**.
- When present, `privateRelays` is **NIP-44 encrypted to self** (same pattern as Blossom server URLs). Public relays store the event but cannot read the list.
- Value when decrypted: a JSON array of relay URLs (e.g. `["wss://my.relay.example"]`).
- Only **wss://** URLs are allowed as private; **ws://** URLs are filtered out on load and cannot be marked private in the UI.

### NIP-65: Relay List (Kind 10002)

- When publishing kind 10002, Cypher Log **excludes** any relay that is in the user's private relay list.
- Only "public" relays (relays not in `privateRelays`) are included in the NIP-65 event.
- This keeps private relay URLs out of the public relay list so other clients cannot discover them from NIP-65.

### Relay List Merge and Order

- The full relay list used for reading and writing is: **private relays first**, then public relays (from NIP-65 / app config), deduplicated by URL.
- Private relays are preferred for event fetching so the app can use plaintext when available.

### Dual Publish (Plain to Private, Encrypted to Public)

- When the user has at least one private relay (wss://) and at least one public relay:
  - For addressable/replaceable data that is encrypted, Cypher Log publishes **two** versions of the same logical entity:
    - **Plaintext** version → sent only to private relays.
    - **NIP-44 encrypted** version → sent only to public relays.
  - Same kind, pubkey, d-tag, and created_at; different event IDs.
- When there are no private relays, only the encrypted version is published to the pool (current single-publish behavior).
- When there are only private relays (no public), only the plaintext version is published to those relays.

### Read Path: Deduplication

- Events are deduplicated by **logical key** before parsing:
  - Addressable events: `(kind, pubkey, d-tag)`.
  - Replaceable events: `(kind, pubkey)`.
  - Other kinds: `(kind, pubkey, created_at)` or event id as appropriate.
- When multiple events exist for the same logical key (plain and encrypted copies), the app **prefers plaintext** (content that does not start with the NIP-44 marker) to avoid unnecessary decryption.
- This dedupe runs in the sync/cache layer before domain parsing.

### Delete Path: Sibling Deletion (NIP-09)

- When the user deletes an item, Cypher Log publishes a kind 5 (NIP-09) deletion event.
- To remove **both** the plaintext copy (on private relays) and the encrypted copy (on public relays), the app:
  1. Queries **private** relay set for events with the same (kind, pubkey, d-tag) [or replaceable key].
  2. Queries **public** relay set for the same.
  3. Collects all event IDs from both result sets.
  4. Publishes one kind 5 event with an `e` tag for each of these IDs (and the usual `a` tag for the address), so all copies are requested for deletion.

### WSS-Only Restriction for Private Relays

- A relay can be marked private only if its URL uses **wss://** (secure WebSocket).
- **ws://** URLs cannot be marked private in the UI (switch disabled, with tooltip explaining wss:// is required).
- If stored data ever contains a ws:// URL in the private relay list, it is cleared on load (filtered out) so plaintext is never sent over an unencrypted transport for "private" relays.
