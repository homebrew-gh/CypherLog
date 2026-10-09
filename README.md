# Cypher Log

Your private home management hub. Track appliances, vehicles, maintenance schedules, subscriptions, warranties, projects, pets, and more — all encrypted and synced via Nostr.

[![Edit with Shakespeare](https://shakespeare.diy/badge.svg)](https://shakespeare.diy/clone?url=https%3A%2F%2Fgithub.com%2Fhomebrew-gh%2FCypherLog.git)

## Features

- **All-in-One Tracking** — Appliances, vehicles, subscriptions, warranties, pets, projects, and service providers
- **Private & Portable** — End-to-end encryption with Nostr. Your data, your control
- **Stay Organized** — Schedule maintenance, plan projects, and never miss a renewal
- **Local-First** — Data cached locally for instant loading, synced with Nostr relays in the background
- **Multi-Account Support** — Switch between Nostr accounts seamlessly
- **Lightning Payments** — Support via zaps with WebLN and NWC integration

## Screenshots

*Coming soon*

## Getting Started

### Prerequisites

- Node.js 18+
- A Nostr browser extension (Alby, nos2x, etc.) or generate keys in-app

### Installation

```bash
# Clone the repository
git clone https://github.com/homebrew-gh/CypherLog.git
cd CypherLog

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build for Production

```bash
npm run build
```

### Run Tests

```bash
npm run test
```

## Technology Stack

Cypher Log is built with the following open source technologies:

### Core Framework

| Technology | Description | License |
|------------|-------------|---------|
| [React](https://react.dev/) | UI framework | MIT |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe JavaScript | Apache-2.0 |
| [Vite](https://vitejs.dev/) | Build tool and dev server | MIT |

### Nostr Integration

| Technology | Description | License |
|------------|-------------|---------|
| [Nostrify](https://nostrify.dev/) | Nostr protocol framework | MIT |
| [nostr-tools](https://github.com/nbd-wtf/nostr-tools) | Nostr utilities and NIP implementations | Unlicense |

### UI Components & Styling

| Technology | Description | License |
|------------|-------------|---------|
| [shadcn/ui](https://ui.shadcn.com/) | Accessible UI components | MIT |
| [Radix UI](https://www.radix-ui.com/) | Headless UI primitives | MIT |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first CSS framework | MIT |
| [Lucide React](https://lucide.dev/) | Icon library | ISC |
| [cmdk](https://cmdk.paco.me/) | Command menu component | MIT |
| [Vaul](https://vaul.emilkowal.ski/) | Drawer component | MIT |
| [Embla Carousel](https://www.embla-carousel.com/) | Carousel component | MIT |

### State Management & Data Fetching

| Technology | Description | License |
|------------|-------------|---------|
| [TanStack Query](https://tanstack.com/query) | Data fetching and caching | MIT |
| [React Router](https://reactrouter.com/) | Client-side routing | MIT |
| [idb](https://github.com/jakearchibald/idb) | IndexedDB wrapper | ISC |

### Forms & Validation

| Technology | Description | License |
|------------|-------------|---------|
| [React Hook Form](https://react-hook-form.com/) | Form management | MIT |
| [Zod](https://zod.dev/) | Schema validation | MIT |

### Utilities

| Technology | Description | License |
|------------|-------------|---------|
| [date-fns](https://date-fns.org/) | Date utility library | MIT |
| [clsx](https://github.com/lukeed/clsx) | Class name utility | MIT |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | Tailwind class merging | MIT |
| [class-variance-authority](https://cva.style/) | Component variants | Apache-2.0 |

### Charts & Visualization

| Technology | Description | License |
|------------|-------------|---------|
| [Recharts](https://recharts.org/) | React charting library | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) | QR code generation | MIT |

### Lightning/Bitcoin Integration

| Technology | Description | License |
|------------|-------------|---------|
| [Alby SDK](https://github.com/getAlby/js-sdk) | Lightning wallet integration | MIT |

### Fonts

| Font | Description | License |
|------|-------------|---------|
| [Inter](https://rsms.me/inter/) | Primary UI font | OFL |
| [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) | Heading font | OFL |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | Monospace font | OFL |

### Development Tools

| Technology | Description | License |
|------------|-------------|---------|
| [ESLint](https://eslint.org/) | Code linting | MIT |
| [Vitest](https://vitest.dev/) | Testing framework | MIT |
| [Testing Library](https://testing-library.com/) | React testing utilities | MIT |

## Nostr Protocol

Cypher Log uses custom Nostr event kinds for data storage. See [NIP.md](./NIP.md) for the complete protocol specification.

### Custom Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| 32627 | Addressable | Home appliances/stuff |
| 32628 | Addressable | Vehicles |
| 37003 | Addressable | Companies/service providers |
| 30229 | Addressable | Maintenance schedules |
| 9413 | Regular | Maintenance completions |
| 37004 | Addressable | Subscriptions |
| 35043 | Addressable | Warranties |
| 38033 | Addressable | Pets/animals |
| 35389 | Addressable | Projects |
| 1661 | Regular | Project diary entries |
| 4209 | Regular | Project tasks |
| 8347 | Regular | Project materials/expenses |
| 7443 | Regular | Vet visits |

### Encryption

Cypher Log supports optional NIP-44 encryption for sensitive data categories. When enabled, data is encrypted to your own public key before being published to relays.

## Project Structure

```
src/
├── components/     # UI components
│   ├── auth/       # Authentication components
│   ├── tabs/       # Main tab views
│   └── ui/         # shadcn/ui components
├── contexts/       # React context providers
├── hooks/          # Custom React hooks
├── lib/            # Utility functions
├── pages/          # Route page components
└── test/           # Test utilities
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Part of the homebrew suite

This app is one of a set of self-hosted, Nostr-based apps that share one identity and one personal relay. The suite-level plan — end goal, architecture, how each app fits — lives in [homebrew-suite](https://github.com/homebrew-gh/homebrew-suite) (`PLAN.md`).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Shakespeare](https://shakespeare.diy)
- Powered by the [Nostr](https://nostr.com) protocol
- UI components from [shadcn/ui](https://ui.shadcn.com/)

## Support

If you find Cypher Log useful, consider supporting development:

- Zap the developer on Nostr
- Star this repository
- Share with others who might benefit

---

Made with care for homeowners who value privacy and organization.
