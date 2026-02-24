// Cypher Log Types

/**
 * Appliance - "My Stuff" Data Type
 * 
 * NOTE: This type represents items in the "My Stuff" tab (displayed in UI),
 * but uses "Appliance" naming in code for backwards compatibility with
 * existing Nostr events and data structures.
 * 
 * UI Label: "My Stuff"
 * Code/Data: "Appliance" / "appliances"
 */
export interface Appliance {
  id: string;
  model: string;
  manufacturer: string;
  purchaseDate: string; // MM/DD/YYYY format
  price?: string; // Purchase price (e.g., "$599.99")
  room: string;
  receiptUrl?: string;
  manualUrl?: string;
  isArchived?: boolean; // Whether this appliance is archived
  pubkey: string;
  createdAt: number;
}

// Vehicle Types
export const DEFAULT_VEHICLE_TYPES = [
  'Personal Vehicle',
  'Recreational',
  'Farm Machinery',
  'Business Vehicle',
  'Boat',
  'Plane',
] as const;

export type DefaultVehicleType = typeof DEFAULT_VEHICLE_TYPES[number];

/** Document attached to a vehicle (e.g. manual, registration copy). */
export interface VehicleDocument {
  url: string;
  /** Optional description/label (e.g. "Registration", "Service manual"). */
  name?: string;
  uploadedAt?: string;
}

export interface Vehicle {
  id: string;
  vehicleType: string;
  // Common fields for all vehicles
  name: string; // Display name (e.g., "2020 Toyota Camry" or "John Deere Tractor")
  make?: string;
  model?: string;
  year?: string;
  purchaseDate?: string; // MM/DD/YYYY format
  purchasePrice?: string;
  purchaseLocation?: string; // Where the vehicle was bought (dealer, private party, etc.)
  // Vehicle-specific fields
  licensePlate?: string;
  mileage?: string;
  fuelType?: string;
  // Registration
  registrationExpiry?: string; // MM/DD/YYYY format
  // Boat-specific fields
  hullId?: string; // HIN for boats
  registrationNumber?: string;
  engineHours?: string;
  // Plane-specific fields
  tailNumber?: string;
  hobbsTime?: string;
  // Farm machinery specific
  serialNumber?: string;
  // Documents
  receiptUrl?: string;
  warrantyUrl?: string;
  warrantyExpiry?: string; // MM/DD/YYYY format
  /** Documents with optional description. When present, use this instead of documentsUrls. */
  documents?: VehicleDocument[];
  /** Legacy: array of document URLs only (no description). Populated for backward compatibility. */
  documentsUrls?: string[];
  // Metadata
  notes?: string;
  isArchived?: boolean; // Whether this vehicle is archived
  pubkey: string;
  createdAt: number;
}

// Interval types for vehicle maintenance (miles vs hours)
export const INTERVAL_TYPES = [
  { value: 'miles', label: 'Miles' },
  { value: 'hours', label: 'Hours' },
] as const;

export type IntervalType = typeof INTERVAL_TYPES[number]['value'];

export interface MaintenanceSchedule {
  id: string;
  applianceId?: string; // Optional - for appliance maintenance
  vehicleId?: string; // Optional - for vehicle maintenance
  homeFeature?: string; // Optional - for home feature maintenance (e.g., "Chimney", "Gutters")
  companyId?: string; // Optional - reference to a company/service provider
  description: string;
  partNumber?: string; // Legacy single part number (deprecated, use parts instead)
  parts?: MaintenancePart[]; // Parts needed for this maintenance
  frequency?: number; // Optional for log-only maintenance
  frequencyUnit?: 'days' | 'weeks' | 'months' | 'years'; // Optional for log-only maintenance
  // Additional fields for mileage/hours-based maintenance
  mileageInterval?: number; // e.g., every 5000 miles or 100 hours
  intervalType?: IntervalType; // 'miles' or 'hours' - defaults to 'miles' for backwards compatibility
  isLogOnly?: boolean; // If true, this is log-only tracking without a recurring schedule
  isArchived?: boolean; // Whether this maintenance is archived
  pubkey: string;
  createdAt: number;
}

// Part used in maintenance
export interface MaintenancePart {
  name: string;
  partNumber?: string;
  cost?: string;
}

export interface MaintenanceCompletion {
  id: string;
  maintenanceId: string;
  completedDate: string; // MM/DD/YYYY format
  mileageAtCompletion?: string; // For vehicle maintenance tracking
  notes?: string;
  parts?: MaintenancePart[]; // Parts used in this maintenance
  pubkey: string;
  createdAt: number;
}

export const DEFAULT_ROOMS = [
  'Bedroom',
  'Bathroom',
  'Dining Room',
  'Utility Room',
  'Office',
  'Mudroom',
  'Kitchen',
  'Garage',
] as const;

export type DefaultRoom = typeof DEFAULT_ROOMS[number];

// Home Features - exterior and structural features that need maintenance
export const DEFAULT_HOME_FEATURES = [
  'Chimney',
  'Gutters',
  'Walkway',
  'Front Yard',
  'Back Yard',
  'Side Yard',
  'Pool',
  'Pond',
  'Garden',
  'Front Porch',
  'Back Porch',
  'Crawl Space',
] as const;

export type DefaultHomeFeature = typeof DEFAULT_HOME_FEATURES[number];

export const FREQUENCY_UNITS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
] as const;

export const WARRANTY_LENGTH_UNITS = [
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
] as const;

export type WarrantyLengthUnit = typeof WARRANTY_LENGTH_UNITS[number]['value'];

export const FUEL_TYPES = [
  { value: 'gasoline', label: 'Gasoline' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'propane', label: 'Propane' },
  { value: 'natural_gas', label: 'Natural Gas' },
  { value: 'jet_fuel', label: 'Jet Fuel' },
  { value: 'avgas', label: 'Aviation Gas' },
  { value: 'other', label: 'Other' },
] as const;

// Company/Service Provider Types
export const DEFAULT_COMPANY_TYPES = [
  'Plumber',
  'Electrician',
  'HVAC',
  'Landscaping',
  'Roofing',
  'General Contractor',
  'Pest Control',
  'Cleaning Service',
  'Pool/Spa Service',
  'Appliance Repair',
  'Handyman',
  'Painting',
  'Flooring',
  'Tree Service',
  'Septic/Sewer',
  'Vet',
  'Babysitter',
  'Security',
  'Finance/Banking',
  'Mechanic/Auto Repair',
  'Healthcare',
  'Other',
] as const;

export type DefaultCompanyType = typeof DEFAULT_COMPANY_TYPES[number];

// Subscription Types
export const DEFAULT_SUBSCRIPTION_TYPES = [
  'Streaming',
  'Software',
  'Health/Wellness',
  'Shopping',
  'Vehicle',
  'Food',
  'Gaming',
  'News/Media',
  'Music',
  'Home',
  'Finance',
  'Pet Care',
] as const;

export type DefaultSubscriptionType = typeof DEFAULT_SUBSCRIPTION_TYPES[number];

// Warranty Types
export const DEFAULT_WARRANTY_TYPES = [
  'Automotive',
  'Appliance',
  'Electronics',
  'Tools',
  'Furniture',
  'Outdoor Gear',
  'Home Features',
  'Jewelry',
  'Medical',
  'Pet Products',
] as const;

export type DefaultWarrantyType = typeof DEFAULT_WARRANTY_TYPES[number];

// Pet/Animal Types
export const DEFAULT_PET_TYPES = [
  'Dog',
  'Cat',
  'Bird',
  'Fish',
  'Reptile',
  'Small Mammal',
  'Horse',
  'Livestock',
  'Other',
] as const;

export type DefaultPetType = typeof DEFAULT_PET_TYPES[number];

// Billing Frequencies for subscriptions
export const BILLING_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi-annually', label: 'Semi-Annually' },
  { value: 'annually', label: 'Annually' },
  { value: 'one-time', label: 'One-Time' },
] as const;

export type BillingFrequency = typeof BILLING_FREQUENCIES[number]['value'];

export interface Subscription {
  id: string;
  subscriptionType: string;
  name: string; // Description/name of the subscription
  cost: string; // Price as string to handle currency formatting
  currency?: string; // Currency code (e.g., 'USD', 'EUR', 'BTC') - defaults to user's entry currency
  billingFrequency: BillingFrequency;
  /** When the subscription began (initial purchase/start date). MM/DD/YYYY. */
  startDate?: string;
  /** Day-of-month due anchor derived from startDate when available. */
  dueDay?: string;
  companyId?: string; // Optional - link to a company/service provider
  companyName?: string; // Manual entry if not linking to a company
  // Link to assets
  linkedAssetType?: LinkedAssetType; // Type of linked asset (appliance, vehicle, home_feature)
  linkedAssetId?: string; // ID of linked appliance or vehicle
  linkedAssetName?: string; // Name for home features or display purposes
  notes?: string;
  /** Last logical update timestamp (seconds since epoch). */
  updatedAt?: number;
  /** Subscription schema version for cross-client migration. */
  schemaVersion?: string;
  isArchived?: boolean; // Whether this subscription is archived
  // Metadata
  pubkey: string;
  createdAt: number;
}

export interface Invoice {
  url: string;
  date: string; // MM/DD/YYYY format
  amount?: string;
  description?: string;
}

export interface Company {
  id: string;
  serviceType: string;
  // Basic info
  name: string; // Company or individual name
  contactName?: string; // Primary contact person
  // Contact methods
  phone?: string;
  email?: string;
  website?: string;
  // Address
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  // Business details
  licenseNumber?: string;
  insuranceInfo?: string;
  // Payment options
  acceptsBitcoin?: boolean; // Whether the business accepts Bitcoin as payment
  // Service history
  invoices: Invoice[]; // Date-stamped invoices (uploaded PDFs/images)
  // Rating/Notes
  rating?: number; // 1-5 stars
  notes?: string;
  // Metadata
  pubkey: string;
  createdAt: number;
}

/** Work log entry: work done by a company (service completed, price, date, notes, invoice) */
export interface CompanyWorkLog {
  id: string;
  companyId: string;
  /** Brief description of work done */
  description: string;
  /** Total price (e.g. "$150.00") */
  totalPrice?: string;
  /** Single completion date (MM/DD/YYYY) when not a range */
  completedDate?: string;
  /** Start of date range (MM/DD/YYYY) when work spanned multiple days */
  completedDateStart?: string;
  /** End of date range (MM/DD/YYYY) */
  completedDateEnd?: string;
  notes?: string;
  /** URL to uploaded invoice/receipt */
  invoiceUrl?: string;
  pubkey: string;
  createdAt: number;
}

// Kind numbers for our custom events
export const APPLIANCE_KIND = 32627;
export const VEHICLE_KIND = 32628;
export const COMPANY_KIND = 37003;
/** Company Work Log: work done by a company (description, price, date/range, notes, invoice) */
export const COMPANY_WORK_LOG_KIND = 37005;
export const MAINTENANCE_KIND = 30229;
export const MAINTENANCE_COMPLETION_KIND = 9413;
/** Canonical subscription kind for FiatLife/Amber-compatible replaceable writes. */
export const SUBSCRIPTION_KIND = 30078;
/** Legacy subscription kind still read during migration. */
export const SUBSCRIPTION_KIND_LEGACY = 37004;
/** Supported subscription kinds for read path during migration window. */
export const SUBSCRIPTION_KINDS_READ = [SUBSCRIPTION_KIND_LEGACY, SUBSCRIPTION_KIND] as const;
export const WARRANTY_KIND = 35043;
export const PET_KIND = 38033;
export const PROJECT_KIND = 35389;
export const PROJECT_ENTRY_KIND = 1661;
export const PROJECT_TASK_KIND = 4209;
export const PROJECT_MATERIAL_KIND = 8347;
export const PROJECT_RESEARCH_KIND = 8348;
export const VET_VISIT_KIND = 7443;
/** Property profile (addressable): one per property; single-property mode uses d-tag "default" */
export const PROPERTY_KIND = 30100;

export interface Pet {
  id: string;
  petType: string;
  name: string;
  species?: string; // e.g., "Golden Retriever", "Siamese Cat"
  breed?: string;
  birthDate?: string; // MM/DD/YYYY format
  adoptionDate?: string; // MM/DD/YYYY format
  weight?: string; // e.g., "45 lbs"
  color?: string;
  sex?: 'male' | 'female' | 'unknown';
  isNeutered?: boolean;
  microchipId?: string;
  licenseNumber?: string;
  // Veterinary info
  vetClinic?: string;
  vetPhone?: string;
  /** Linked company (from Companies/Services) - when set, vet card appears there */
  vetCompanyId?: string;
  // Medical info
  allergies?: string;
  medications?: string;
  medicalConditions?: string;
  lastVetVisit?: string; // MM/DD/YYYY format
  // Documents
  photoUrl?: string;
  documentsUrls?: string[];
  // General
  notes?: string;
  isArchived?: boolean;
  // Metadata
  pubkey: string;
  createdAt: number;
}

// Linked item types (shared between Warranty and Subscription)
export type LinkedAssetType = 'appliance' | 'vehicle' | 'home_feature';

// Warranty linked item types (extends LinkedAssetType with 'custom')
export type WarrantyLinkedType = LinkedAssetType | 'custom';

// Document for warranty
export interface WarrantyDocument {
  url: string;
  name?: string;
  uploadedAt?: string;
}

/** Single property profile (e.g. primary home). For multi-property, see docs/MULTI_PROPERTY_PLAN.md */
export interface Property {
  id: string; // d-tag; use "default" for single-property mode
  name: string; // Display name, e.g. "123 Main St" or "Primary Home"
  yearBuilt?: number;
  squareFootage?: string;
  roofType?: string;
  roofAge?: string; // Years or description
  hvacType?: string;
  heatingCooling?: string; // e.g. "Gas furnace, central AC"
  lotSize?: string;
  bedrooms?: number;
  bathrooms?: number;
  waterSource?: 'well' | 'municipal' | 'other';
  sewerType?: 'septic' | 'municipal' | 'other';
  notes?: string;
  pubkey: string;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  startDate: string; // MM/DD/YYYY format
  // Status tracking
  status?: 'planning' | 'in_progress' | 'on_hold' | 'completed';
  // Budget and timeline
  budget?: string;
  completionDate?: string; // MM/DD/YYYY format - when project was completed
  targetCompletionDate?: string; // MM/DD/YYYY format - planned completion date
  // Linked companies/service providers
  companyIds?: string[]; // Array of company IDs linked to this project
  // General
  notes?: string;
  isArchived?: boolean;
  // Metadata
  pubkey: string;
  createdAt: number;
}

// Project Entry (Progress Diary Entry)
export interface ProjectEntry {
  id: string;
  projectId: string; // Reference to the parent project
  entryDate: string; // MM/DD/YYYY format - date of the entry
  title?: string; // Optional title for the entry
  content: string; // Main text content (notes, observations, etc.)
  // Photos and media
  photoUrls?: string[]; // Array of uploaded photo URLs
  // Metadata
  pubkey: string;
  createdAt: number;
}

// Project Task (To-Do Item)
export interface ProjectTask {
  id: string;
  projectId: string; // Reference to the parent project
  description: string; // Task description
  isCompleted: boolean; // Whether the task is done
  completedDate?: string; // MM/DD/YYYY format - when task was completed
  priority?: 'low' | 'medium' | 'high'; // Task priority
  dueDate?: string; // MM/DD/YYYY format - optional due date
  // Metadata
  pubkey: string;
  createdAt: number;
}

// Project Research/Planning Note (structured note with optional documents and quotes)
export interface ProjectResearchDocument {
  url: string;
  name?: string;
}

export interface ProjectResearchNote {
  id: string;
  projectId: string;
  description: string; // Title/summary of the note
  content: string; // Main text
  documents?: ProjectResearchDocument[]; // Optional file/link attachments
  quotes?: string[]; // Optional quotes or references
  pubkey: string;
  createdAt: number; // Unix timestamp when note was added
}

// Expense categories for budget tracking
export const EXPENSE_CATEGORIES = [
  { value: 'materials', label: 'Materials' },
  { value: 'labor', label: 'Labor' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'permits', label: 'Permits & Fees' },
  { value: 'tools', label: 'Tools' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'other', label: 'Other' },
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]['value'];

// Project Material/Expense Item
export interface ProjectMaterial {
  id: string;
  projectId: string; // Reference to the parent project
  name: string; // Item name
  category: ExpenseCategory; // Expense category
  quantity?: number; // Quantity needed
  unit?: string; // Unit of measurement (e.g., "sq ft", "each", "hours")
  unitPrice?: string; // Price per unit
  totalPrice: string; // Total price for this item (legacy / display)
  estimatedPrice?: string; // Estimated cost when planning
  actualPrice?: string; // Actual cost paid (for variance vs estimated)
  isPurchased: boolean; // Whether the item has been bought
  purchasedDate?: string; // MM/DD/YYYY format - when item was purchased
  vendor?: string; // Where it was purchased from
  notes?: string; // Additional notes
  // Metadata
  pubkey: string;
  createdAt: number;
}

export interface Warranty {
  id: string;
  warrantyType: string;
  // Basic warranty info
  name: string; // Product/item name
  description?: string;
  // Purchase info
  purchaseDate?: string; // MM/DD/YYYY format
  purchasePrice?: string;
  // Warranty duration
  warrantyStartDate?: string; // MM/DD/YYYY format - defaults to purchase date
  warrantyEndDate?: string; // MM/DD/YYYY format - calculated from purchaseDate + warrantyLength
  warrantyLength?: string; // Legacy field (deprecated)
  warrantyLengthValue?: number; // Numeric value for warranty length
  warrantyLengthUnit?: 'weeks' | 'months' | 'years'; // Unit for warranty length
  isLifetime?: boolean; // Whether this is a lifetime warranty
  // Link to other items
  linkedType?: WarrantyLinkedType; // Type of linked item
  linkedItemId?: string; // ID of linked appliance, vehicle, etc.
  linkedItemName?: string; // For custom items or display purposes
  // Service provider/company
  companyId?: string; // Reference to a company/service provider
  companyName?: string; // Manual entry if not linking to a company
  // Registration info
  isRegistered?: boolean;
  registrationDate?: string; // MM/DD/YYYY format
  registrationNumber?: string;
  registrationNotes?: string;
  // Extended warranty
  hasExtendedWarranty?: boolean;
  extendedWarrantyProvider?: string;
  extendedWarrantyEndDate?: string; // MM/DD/YYYY format
  extendedWarrantyCost?: string;
  extendedWarrantyNotes?: string;
  // Documents
  documents?: WarrantyDocument[]; // Array of warranty documents
  receiptUrl?: string; // Purchase receipt
  // General
  notes?: string;
  isArchived?: boolean; // Whether this warranty is archived
  // Metadata
  pubkey: string;
  createdAt: number;
}

// Vet Visit Types
export const VET_VISIT_TYPES = [
  { value: 'checkup', label: 'Routine Checkup' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'illness', label: 'Illness/Injury' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'dental', label: 'Dental Care' },
  { value: 'grooming', label: 'Grooming' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'other', label: 'Other' },
] as const;

export type VetVisitType = typeof VET_VISIT_TYPES[number]['value'];

export interface VetVisit {
  id: string;
  petId: string; // Reference to the parent pet
  visitDate: string; // MM/DD/YYYY format
  visitType: VetVisitType;
  // Vet information
  vetClinic?: string;
  veterinarian?: string; // Name of the veterinarian
  /** Linked company (from Companies/Services) - when set, visit appears in that company's Log Work */
  companyId?: string;
  // Visit details
  reason: string; // Reason for visit
  diagnosis?: string; // Diagnosis/findings
  treatment?: string; // Treatment provided
  prescriptions?: string; // Medications prescribed
  // Weight tracking
  weight?: string; // Weight at visit (e.g., "45 lbs")
  // Vaccinations
  vaccinations?: string[]; // List of vaccinations given
  // Follow-up
  followUpDate?: string; // MM/DD/YYYY format - next appointment
  followUpNotes?: string;
  // Costs
  cost?: string; // Visit cost
  // Documents
  documentsUrls?: string[]; // Uploaded documents (receipts, records, etc.)
  // Notes
  notes?: string;
  // Metadata
  pubkey: string;
  createdAt: number;
}
