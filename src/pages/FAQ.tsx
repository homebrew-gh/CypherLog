import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { 
  Home, 
  ArrowLeft, 
  Package, 
  Car, 
  Wrench, 
  CheckCircle2, 
  Wifi, 
  Settings, 
  Shield,
  Lock,
  HelpCircle,
  ExternalLink,
  Database,
  Users,
  CreditCard,
  PawPrint,
  Stethoscope,
  Hammer,
  FileText,
  ClipboardList,
  DollarSign,
  KeyRound,
  AlertTriangle,
  StickyNote,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';

// Event kind information
const EVENT_KINDS = [
  {
    kind: 32627,
    name: 'My Stuff (Appliances)',
    category: 'Custom (Addressable)',
    icon: Package,
    color: 'sky',
    description: 'Stores information about your possessions including model, manufacturer, purchase date, price, room location, and links to receipts or manuals.',
    dataStored: [
      'Model name/number',
      'Manufacturer',
      'Purchase date & price',
      'Room location',
      'Receipt URL',
      'Manual URL',
    ],
    encrypted: true,
  },
  {
    kind: 32628,
    name: 'Vehicle',
    category: 'Custom (Addressable)',
    icon: Car,
    color: 'sky',
    description: 'Stores comprehensive vehicle information including cars, trucks, boats, planes, and farm machinery with their identification numbers, registration, and documents.',
    dataStored: [
      'Vehicle name and type',
      'Make, model, year',
      'VIN / Hull ID / Tail number',
      'License plate / Registration',
      'Mileage / Engine hours',
      'Warranty details',
      'Purchase information',
      'Documents',
    ],
    encrypted: true,
  },
  {
    kind: 37003,
    name: 'Company/Service Provider',
    category: 'Custom (Addressable)',
    icon: Users,
    color: 'sky',
    description: 'Stores information about companies and service providers including contact details, business credentials, ratings, and date-stamped invoices.',
    dataStored: [
      'Business/company name',
      'Service type (plumber, electrician, etc.)',
      'Contact info (phone, email, website)',
      'Address',
      'License and insurance info',
      'Rating (1-5 stars)',
      'Invoices with date, amount, description',
      'Notes',
    ],
    encrypted: true,
  },
  {
    kind: 30078,
    name: 'Subscription',
    category: 'Custom (Addressable)',
    icon: CreditCard,
    color: 'sky',
    description: 'Tracks recurring subscriptions and services using namespaced d-tags (e.g., subscription:<id>) for FiatLife/Amber-compatible replaceable events. Legacy kind 37004 is still read during migration.',
    dataStored: [
      'Subscription id + namespaced d-tag',
      'Subscription name',
      'Type (streaming, software, etc.)',
      'Amount/cost & currency',
      'Billing frequency/recurrence',
      'Start date + due day',
      'updatedAt + schemaVersion',
      'Linked company or asset',
      'Notes',
    ],
    encrypted: true,
  },
  {
    kind: 35043,
    name: 'Warranty',
    category: 'Custom (Addressable)',
    icon: Shield,
    color: 'sky',
    description: 'Stores warranty information including coverage dates, registration details, extended warranty info, and linked assets.',
    dataStored: [
      'Product/item name',
      'Warranty type & duration',
      'Start & end dates',
      'Registration info',
      'Extended warranty details',
      'Linked asset (appliance/vehicle)',
      'Documents & receipts',
    ],
    encrypted: true,
  },
  {
    kind: 38033,
    name: 'Pet/Animal',
    category: 'Custom (Addressable)',
    icon: PawPrint,
    color: 'sky',
    description: 'Stores pet and animal information including breed, medical history, vet contacts, and identification details.',
    dataStored: [
      'Name, species, breed',
      'Birth/adoption date',
      'Physical characteristics',
      'Microchip & license numbers',
      'Vet clinic & phone',
      'Allergies & medications',
      'Medical conditions',
      'Photo & documents',
    ],
    encrypted: true,
  },
  {
    kind: 7443,
    name: 'Vet Visit',
    category: 'Custom (Regular)',
    icon: Stethoscope,
    color: 'green',
    description: 'Records veterinary visits for pets including diagnosis, treatment, vaccinations, prescriptions, and follow-up appointments.',
    dataStored: [
      'Visit date & type',
      'Reason & diagnosis',
      'Treatment provided',
      'Vaccinations given',
      'Prescriptions',
      'Weight at visit',
      'Follow-up date',
      'Cost & documents',
    ],
    encrypted: true,
  },
  {
    kind: 35389,
    name: 'Project',
    category: 'Custom (Addressable)',
    icon: Hammer,
    color: 'amber',
    description: 'Tracks home and farm projects including renovations, improvements, and other work with status, budget, and timeline.',
    dataStored: [
      'Project name & description',
      'Status (planning, in progress, etc.)',
      'Start & target dates',
      'Budget',
      'Linked companies/contractors',
      'Notes',
    ],
    encrypted: true,
  },
  {
    kind: 1661,
    name: 'Project Entry',
    category: 'Custom (Regular)',
    icon: FileText,
    color: 'amber',
    description: 'Progress diary entries for projects including notes, observations, and photos documenting work over time.',
    dataStored: [
      'Entry date & title',
      'Content/notes',
      'Photos',
      'Reference to project',
    ],
    encrypted: true,
  },
  {
    kind: 4209,
    name: 'Project Task',
    category: 'Custom (Regular)',
    icon: ClipboardList,
    color: 'amber',
    description: 'To-do items for projects with priority levels, due dates, and completion tracking.',
    dataStored: [
      'Task description',
      'Priority (low/medium/high)',
      'Due date',
      'Completion status & date',
    ],
    encrypted: true,
  },
  {
    kind: 8347,
    name: 'Project Material/Expense',
    category: 'Custom (Regular)',
    icon: DollarSign,
    color: 'amber',
    description: 'Materials and expenses for projects with quantity, pricing, vendor information, and purchase tracking. Items are editable; you can set estimated and actual prices to track variance, and totals feed the budget tracker.',
    dataStored: [
      'Item name & category',
      'Quantity, unit & unit price',
      'Total, estimated & actual price',
      'Vendor',
      'Purchase status & date',
    ],
    encrypted: true,
  },
  {
    kind: 8348,
    name: 'Project Research/Planning Note',
    category: 'Custom (Regular)',
    icon: StickyNote,
    color: 'amber',
    description: 'Structured research and planning notes for projects. Each note has a description, main text, and optional documents or quotes. Notes are timestamped when added and can be sorted by newest or oldest.',
    dataStored: [
      'Description (title/summary)',
      'Main note text',
      'Optional document attachments',
      'Optional quotes/references',
      'Creation timestamp',
    ],
    encrypted: true,
  },
  {
    kind: 30229,
    name: 'Maintenance Schedule',
    category: 'Custom (Addressable)',
    icon: Wrench,
    color: 'green',
    description: 'Defines recurring maintenance tasks for appliances, vehicles, or home features including frequency intervals and optional part numbers.',
    dataStored: [
      'Task description',
      'Frequency (days/weeks/months/years)',
      'Mileage interval (for vehicles)',
      'Parts needed',
      'Linked company/service provider',
      'Reference to asset or home feature',
    ],
    encrypted: true,
  },
  {
    kind: 9413,
    name: 'Maintenance Completion',
    category: 'Custom (Regular)',
    icon: CheckCircle2,
    color: 'green',
    description: 'Records when a maintenance task was completed, creating a history of all maintenance performed.',
    dataStored: [
      'Completion date',
      'Mileage at completion',
      'Parts used',
      'Notes',
      'Reference to maintenance schedule',
    ],
    encrypted: true,
  },
  {
    kind: 10002,
    name: 'Relay List (NIP-65)',
    category: 'Standard (Replaceable)',
    icon: Wifi,
    color: 'purple',
    description: 'Publishes your preferred relay list so other Nostr clients can find where to reach you. Private relays are excluded—only public relay URLs are included. This is a standard Nostr event used across the ecosystem.',
    dataStored: [
      'List of public relay URLs (private relays excluded)',
      'Read/write permissions for each relay',
    ],
    encrypted: false,
  },
  {
    kind: 30078,
    name: 'App Preferences (NIP-78)',
    category: 'Standard (Addressable, d=cypherlog/preferences)',
    icon: Settings,
    color: 'slate',
    description: 'Stores your Cypher Log preferences (identified by d=cypherlog/preferences) including active tabs, view modes, custom categories, media server configuration, and (encrypted) private relay list. Synced across devices.',
    dataStored: [
      'Active tabs configuration',
      'View mode preferences',
      'Custom room names',
      'Custom type categories',
      'Blossom media server configuration',
      'Private relay list (NIP-44 encrypted)',
      'Currency preferences',
    ],
    encrypted: false,
  },
  {
    kind: 5,
    name: 'Deletion Request (NIP-09)',
    category: 'Standard (Regular)',
    icon: Database,
    color: 'red',
    description: 'Published when you delete any item. Requests that relays remove the referenced events. When using private relays, Cypher Log includes all sibling event IDs (plain and encrypted copies) so both are removed.',
    dataStored: [
      'Reference to deleted event(s)',
      'Deletion reason (optional)',
    ],
    encrypted: false,
  },
];

const FAQ_ITEMS = [
  {
    question: 'What is Nostr?',
    answer: 'Nostr (Notes and Other Stuff Transmitted by Relays) is a decentralized protocol for social networking and data storage. Instead of storing your data on a single company\'s server, your data is stored on multiple relays that you choose. You control your identity with cryptographic keys, and your data is portable across any Nostr-compatible application.',
  },
  {
    question: 'What can I track with Cypher Log?',
    answer: 'Cypher Log helps you manage your entire household and more: home appliances and possessions (My Stuff), vehicles (cars, boats, planes, farm equipment), maintenance schedules, companies and service providers, subscriptions, warranties, pets and their vet visits, and home improvement projects with budgets, progress diary, tasks, materials/expenses (with estimated vs actual pricing), and research/planning notes.',
  },
  {
    question: 'Is my data encrypted?',
    answer: 'Yes! Cypher Log uses NIP-44 encryption for all data categories: appliances, vehicles, pets, maintenance records, subscriptions, warranties, companies/service providers, and projects (including project entries, tasks, materials/expenses, and research/planning notes). Your data is encrypted with your private key before being sent to public relays. Only you can decrypt and read it. If you mark a relay as "private" in relay settings, data sent to that relay is stored in plaintext (so you can read it directly on a self-hosted or trusted relay); data on all other relays remains encrypted.',
  },
  {
    question: 'What are relays?',
    answer: 'Relays are servers that store and distribute Nostr events (data). You can connect to multiple relays for redundancy. Public relays are open to everyone. You can also mark relays as "private" in Cypher Log: private relays are prioritized for reads, receive plaintext copies of your data (for self-hosted or trusted use), and are never published in your public relay list (NIP-65). Private relays must use wss:// (secure WebSocket) so traffic is encrypted in transit.',
  },
  {
    question: 'What are private relays?',
    answer: 'In Cypher Log you can mark a relay as "private" in Settings > Manage Relays. Data sent to private relays is stored in plaintext (so the relay operator or you, if self-hosted, can read it). Data on all other relays stays NIP-44 encrypted. Private relay URLs are stored encrypted in your app preferences (NIP-78) and are never included in your public relay list (NIP-65). Only wss:// relays can be marked private. When you mark a relay private, you must confirm that you understand the data will be stored in plaintext on that relay.',
  },
  {
    question: 'What\'s the difference between paid and private relays?',
    answer: 'A paid relay is one you pay to use (e.g. subscription or usage-based). A private relay in Cypher Log is a relay you mark as "private" in Settings > Manage Relays—it receives plaintext copies of your data and is excluded from your public relay list. Paid relays are not necessarily private: many paid relays are still "public" in the sense that your relay list (NIP-65) may include them and your data is sent to them encrypted. Before assuming a relay is private or trustworthy, check the relay\'s policy: who can read data, whether they log or share data, and how they handle deletion. Only mark a relay as private in Cypher Log if you trust it with plaintext data (e.g. self-hosted or a relay with a clear privacy policy you accept).',
  },
  {
    question: 'Can I use Cypher Log on multiple devices?',
    answer: 'Yes! Because your data is stored on Nostr relays (not locally), you can access your Cypher Log from any device. Just log in with the same Nostr identity (via browser extension, Amber on Android, or other signing methods).',
  },
  {
    question: 'How do I use my Start9 or self-hosted Nostr relay?',
    answer: 'Start9 Nostr RS Relay (and other standard Nostr relays) work with Cypher Log with no special setup. Get your relay\'s WebSocket URL from the service (e.g. StartOS Nostr Properties), then add it in Settings > Manage Relays. For Start9: whitelist your pubkey (hex) in the relay config first; copy the URL from Nostr Properties; add it in Cypher Log. If you use the LAN URL (wss://...local), trust your server\'s Root CA in your browser so TLS works. You can mark wss:// relays as private if you control them. See docs/START9_NOSTR_RELAY.md in the repo for step-by-step Start9 instructions.',
  },
  {
    question: 'How do I use my Umbrel Nostr relay?',
    answer: 'Umbrel\'s official Nostr Relay app (nostr-rs-relay) works with Cypher Log like any other relay. Add the WebSocket URL in Settings > Manage Relays—e.g. ws://umbrel:4848 with Tailscale (MagicDNS), or ws://umbrel.local:4848 / ws://<Umbrel-IP>:4848 on your local network. Browsers block ws:// from HTTPS pages, so if you use Cypher Log from the normal HTTPS site, the connection may be blocked; it works when using the app from HTTP or localhost. You cannot mark ws:// relays as Private in Cypher Log (wss:// required). See docs/UMBREL_NOSTR_RELAY.md for details.',
  },
  {
    question: 'What happens if a relay goes offline?',
    answer: 'If you\'re connected to multiple relays, your data will still be available from the other relays. This is why it\'s recommended to use at least 2-3 relays. Cypher Log shows connection status indicators (green/red) in the relay management settings.',
  },
  {
    question: 'Does Cypher Log support relay authentication (NIP-42)?',
    answer: 'Yes. Cypher Log supports NIP-42 relay authentication. When a relay requires authentication (e.g. whitelisted pubkeys or auth_required for read/write), the app responds to the relay\'s AUTH challenge by signing a kind 22242 event with your logged-in Nostr identity. You must be logged in for authentication to be sent. Relays that do not require auth are unaffected. This lets you use closed or whitelisted relays (e.g. self-hosted relays that only allow your pubkey) for both reading and writing. See docs/NIP42_RELAY_AUTH.md for details.',
  },
  {
    question: 'Can other Nostr apps read my Cypher Log data?',
    answer: 'The custom event kinds used by Cypher Log are documented in our NIP specification. Other apps could theoretically read this data if they implement support for these kinds, but encrypted data can only be decrypted by you. Standard kinds like relay lists (10002) are interoperable with other Nostr clients.',
  },
  {
    question: 'How do I back up my data?',
    answer: 'Your data is automatically backed up to all your connected relays. For additional safety, you can add more relays in Settings > Manage Relays. Your private key (managed by your signer/extension) is the master key to your data - keep it safe and backed up!',
  },
  {
    question: 'Can relays see my IP address?',
    answer: 'Yes. When Cypher Log connects to a relay, that relay can see your IP address. This is how all Nostr clients work - they connect directly to relays via WebSocket. Relay operators can correlate your IP address with your pubkey and see when you connect. Your encrypted content remains unreadable, but connection metadata (IP, timestamps) is visible to relay operators. For enhanced privacy, consider using a VPN or Tor, or use only private relays you control.',
  },
  {
    question: 'How do I track vet visits for my pets?',
    answer: 'Add a pet in the Pets & Animals tab, then click on the pet to open their detail page. From there, click "Log Vet Visit" to record visits including diagnosis, treatment, vaccinations, prescriptions, weight, and follow-up appointments. The app will remind you of upcoming follow-ups.',
  },
  {
    question: 'How do I track home improvement projects?',
    answer: 'Use the Projects tab to create projects with budgets and timelines. Each project includes: a progress diary (entries with photos), a task checklist, a materials/expenses list (editable items with optional estimated vs actual prices—totals feed the budget tracker), and a Research & Planning section for structured notes with optional documents and quotes (timestamped, sortable by newest or oldest). You can link companies and contractors to keep everything organized.',
  },
  {
    question: 'Can I archive items instead of deleting them?',
    answer: 'Yes! Most items (appliances, vehicles, pets, subscriptions, warranties, maintenance, and projects) can be archived. Archived items are hidden from the main view but can be restored later. Look for the "Archive" button in the item\'s detail view.',
  },
];

const SECURITY_INFO = {
  title: 'Why Signing Apps Are More Secure Than Using Your nsec',
  description: 'Your nsec (private key) is the master key to your Nostr identity. How you handle it matters.',
  comparison: [
    {
      method: 'Signing App / Browser Extension',
      security: 'Recommended',
      icon: Shield,
      color: 'green',
      points: [
        'Your private key never leaves the signing app',
        'Each signature request requires your approval',
        'Malicious websites cannot steal your key',
        'Key is stored securely in the extension/app',
        'Works across multiple Nostr apps safely',
      ],
    },
    {
      method: 'Pasting nsec Directly',
      security: 'Less Secure',
      icon: AlertTriangle,
      color: 'amber',
      points: [
        'Website has full access to your private key',
        'Key could be logged or stolen by malicious code',
        'No approval needed for signing - automatic',
        'Key exists in browser memory (vulnerable)',
        'If site is compromised, your key is exposed',
      ],
    },
  ],
  recommendations: [
    'Use a browser extension like nos2x, Alby, or Nostr Connect',
    'On Android, use Amber as your signing app',
    'On iOS, use a compatible Nostr signer app',
    'Never share your nsec with anyone',
    'Keep a secure backup of your nsec offline',
    'If you must use nsec login, only do so on trusted devices',
  ],
};

export function FAQ() {
  useSeoMeta({
    title: 'FAQ - Cypher Log',
    description: 'Frequently asked questions about Cypher Log and the Nostr event kinds it uses.',
  });

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'sky':
        return 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300 border-sky-200 dark:border-sky-800';
      case 'amber':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'green':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-800';
      case 'purple':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'red':
        return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-200 dark:border-red-800';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const getIconColorClass = (color: string) => {
    switch (color) {
      case 'sky': return 'text-sky-600 dark:text-sky-400';
      case 'amber': return 'text-amber-600 dark:text-amber-400';
      case 'green': return 'text-green-600 dark:text-green-400';
      case 'purple': return 'text-purple-600 dark:text-purple-400';
      case 'red': return 'text-red-600 dark:text-red-400';
      default: return 'text-slate-600 dark:text-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-sky-100 dark:from-slate-900 dark:to-slate-800 tool-pattern-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-sky-200 dark:border-slate-700">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Home className="h-6 w-6 text-sky-600 dark:text-sky-400" />
              <span className="font-bold text-xl text-sky-700 dark:text-sky-300">Cypher Log</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Page Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-200 dark:bg-sky-800 mb-4">
            <HelpCircle className="h-8 w-8 text-sky-600 dark:text-sky-300" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Frequently Asked Questions
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Learn about how Cypher Log works and what data it stores
          </p>
        </div>

        {/* Event Kinds Section */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <Database className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Data Types (Event Kinds)
            </h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Cypher Log stores your data as Nostr events. Each type of data has a unique "kind" number. Here's what each kind stores:
          </p>

          <div className="grid gap-4">
            {EVENT_KINDS.map((eventKind) => {
              const Icon = eventKind.icon;
              return (
                <Card key={eventKind.kind} className="bg-white dark:bg-slate-800 border-sky-200 dark:border-slate-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${getColorClasses(eventKind.color)}`}>
                          <Icon className={`h-5 w-5 ${getIconColorClass(eventKind.color)}`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {eventKind.name}
                            <Badge variant="outline" className="font-mono text-xs">
                              kind: {eventKind.kind}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {eventKind.category}
                          </CardDescription>
                        </div>
                      </div>
                      {eventKind.encrypted && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 shrink-0">
                          <Lock className="h-3 w-3 mr-1" />
                          Encrypted
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      {eventKind.description}
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                        Data stored:
                      </p>
                      <ul className="text-xs text-slate-600 dark:text-slate-400 grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {eventKind.dataStored.map((item, index) => (
                          <li key={index} className="flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <Separator className="my-8" />

        {/* FAQ Section */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Common Questions
            </h2>
          </div>

          <div className="space-y-4">
            {FAQ_ITEMS.map((item, index) => (
              <Card key={index} className="bg-white dark:bg-slate-800 border-sky-200 dark:border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-slate-800 dark:text-slate-100">
                    {item.question}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {item.answer}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="my-8" />

        {/* Security Section */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <KeyRound className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {SECURITY_INFO.title}
            </h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {SECURITY_INFO.description}
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {SECURITY_INFO.comparison.map((method) => {
              const Icon = method.icon;
              const isSecure = method.color === 'green';
              return (
                <Card 
                  key={method.method} 
                  className={`bg-white dark:bg-slate-800 ${
                    isSecure 
                      ? 'border-green-300 dark:border-green-800' 
                      : 'border-amber-300 dark:border-amber-800'
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        isSecure 
                          ? 'bg-green-100 dark:bg-green-900' 
                          : 'bg-amber-100 dark:bg-amber-900'
                      }`}>
                        <Icon className={`h-5 w-5 ${
                          isSecure 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-amber-600 dark:text-amber-400'
                        }`} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{method.method}</CardTitle>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            isSecure 
                              ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400' 
                              : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {method.security}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {method.points.map((point, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            isSecure ? 'bg-green-500' : 'bg-amber-500'
                          }`} />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="bg-sky-50 dark:bg-slate-800 border-sky-200 dark:border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                Security Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid sm:grid-cols-2 gap-2">
                {SECURITY_INFO.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    {rec}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Learn More Section */}
        <section className="text-center">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
            Learn More About Nostr
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <a 
              href="https://nostr.com" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="border-sky-300 hover:bg-sky-50 dark:border-sky-700 dark:hover:bg-sky-900">
                <ExternalLink className="h-4 w-4 mr-2" />
                nostr.com
              </Button>
            </a>
            <a 
              href="https://github.com/nostr-protocol/nips" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="border-sky-300 hover:bg-sky-50 dark:border-sky-700 dark:hover:bg-sky-900">
                <ExternalLink className="h-4 w-4 mr-2" />
                NIPs Repository
              </Button>
            </a>
          </div>

          <div className="mt-8 space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center justify-center gap-3 flex-wrap">
              <Link to="/privacy" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Privacy Policy
              </Link>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <Link to="/terms" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Terms of Use
              </Link>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <Link to="/license" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                MIT License
              </Link>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <Link to="/" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Back to Cypher Log
              </Link>
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <a href="https://shakespeare.diy" target="_blank" rel="noopener noreferrer" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                Vibed with Shakespeare
              </a>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default FAQ;
