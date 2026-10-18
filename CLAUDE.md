@AGENTS.md

# Claude Code notes for Cypher Log

AGENTS.md (imported above) is the main project guide and is shared with Cursor/opencode. Keep it as the source of truth; this file only adds what it doesn't cover.

Cypher Log is a private home-management app (appliances, vehicles, maintenance, subscriptions, warranties, pets, projects) stored as custom Nostr kinds, optionally NIP-44 encrypted to the user's own key. It ships as a web app (GitHub Pages / GitLab Pages / Vercel), an Android app via Capacitor, and a StartOS package. It is part of the homebrew suite (FiatLife, NoMoXcel, ERV) that shares one Nostr identity and personal relay.

## Commands

Node 20 (`.nvmrc`). Every npm script runs `npm i --silent` first.

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (Vite, port 8080) |
| Full check (what CI runs) | `npm run test` (tsc → eslint → vitest → vite build) |
| Typecheck only | `npx tsc --noEmit` |
| Lint only | `npx eslint` |
| Unit tests only | `npx vitest run` (single file: `npx vitest run src/path/File.test.tsx`) |
| Production build | `npm run build` (also copies `dist/index.html` to `dist/404.html` for SPA routing) |

`npm run test` must pass before a change is done (see AGENTS.md). Custom ESLint rules live in `eslint-rules/` (no inline `<script>`, no placeholder comments, require a web manifest).

## Android (Capacitor)

- Config: `capacitor.config.json` (appId `io.cypherlog.app`, `webDir: dist`). Native project is `android/`.
- `npm run cap:sync` builds the web app and runs `npx cap sync android`. Run it after any web change you want in the APK.
- `npm run cap:open:android` opens Android Studio; or build from the CLI with `cd android && ./gradlew assembleDebug`.
- `npm run generate:android-icons` regenerates launcher icons (`scripts/generate-android-launcher-icons.mjs`).
- Custom native plugins live in `android/app/src/main/java/io/cypherlog/app/` (`AmberSignerPlugin`, `ReceiptPickerPlugin`, registered in `MainActivity`). Their TypeScript sides are in `src/lib/capacitor/`, with `src/lib/amberAndroidSigner.ts` wrapping Amber (NIP-55) signing. Changing a plugin means editing both sides.
- Android webview quirks have caused repeated bugs around Radix dialogs and file pickers (see git log for `fix(android)` / `fix(maintenance)`). Keep platform checks so the browser behavior is unchanged, and say when a change can only be verified on a device.
- Background: `docs/MOBILE_APP_STRATEGY.md` (Amber is a launch requirement on Android).

## StartOS package

`packages/start9/` is a separate npm project (its own `package.json`, `node_modules`, Makefile) that wraps the built site as a `.s9pk`. Build with `cd packages/start9 && npm ci && make x86-import`; typecheck with `npm run check` there. See `packages/start9/README.md` and `docs/START9_NOSTR_RELAY.md`. Build output (`*.s9pk`, `javascript/`, `.pack`) is gitignored.

## Nostr protocol

- `NIP.md` is the spec for all custom kinds (32627, 32628, 37003, 30229, 9413, 37004, 35043, 38033, 35389, 1661, 4209, 8347, 7443). Update it whenever an event schema changes.
- The `nostr` MCP server (`.mcp.json`, same server opencode uses) gives `read_nip`, `read_kind`, `read_nips_index` and `generate_kind`. Use it for the NIP research AGENTS.md requires, and use `generate_kind` rather than inventing a kind number.
- `.mcp.json` also provides `js-dev` (npm/jsr package and script helpers).
- Encryption, relays and sync are covered in `docs/` (`ENCRYPTION_ANALYSIS.md`, `PRIVATE_RELAYS_PLAN.md`, `PRIVATE_RELAY_BACKFILL.md`, `NIP42_RELAY_AUTH.md`, `RELAY_RATE_LIMITS.md`, `TOR_AND_RELAYS.md`). Read the relevant one before touching those areas.

## Working in this repo with Claude Code

- AGENTS.md says to commit when finished. In Claude Code, ask before committing or pushing, and never commit unrelated uncommitted work already in the tree.
- AGENTS.md's design standards and "don't write tests unless asked" rule apply as written.
- Ignore `.tmp-amber/`, `.gradle-home/`, `dist/` and `android/app/build/` (scratch and build output).
