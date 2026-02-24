# CypherLog Mobile App Strategy (iOS + Android)

This document outlines the best path to ship CypherLog as installable mobile apps while preserving the current PWA experience and minimizing maintenance overhead.

## Executive Recommendation

For CypherLog, the best first approach is:

1. Keep a **single shared application codebase** (your existing React + Vite app).
2. Package it as native mobile apps using **Capacitor** (one iOS shell + one Android shell around the same web app).
3. Add native capabilities incrementally only where they provide clear user value.

This gives you app-store distribution and native APIs without rewriting the app in two separate native codebases.

## Android Requirement: Amber Signer Support (Mandatory)

For Android, CypherLog should treat **Amber integration as a launch-blocking requirement**, not an optional enhancement.

Why this matters:

- Your PWA route failed specifically because PWA environments do not reliably support the Android app-to-app signing flow needed for Amber.
- A native Android wrapper gives you access to Android intents/activity result flows, which are the correct foundation for Amber.
- This enables a first-class Nostr login/signing UX that aligns with how Android Nostr users already expect to operate.

## Why This Is Best for CypherLog

CypherLog already has production-grade PWA groundwork:

- Web manifest and install metadata.
- Custom service worker with offline caching/update flow.
- Mobile-aware app behavior and network resilience patterns.
- Existing UX that you already like and want to preserve.

A Capacitor-based architecture lets you reuse nearly all current UI, state, Nostr logic, and routing while still accessing native features when needed.

## Decision Framework: Separate Native Apps vs Single Shared Codebase

### Option A: Two Separate Native Apps (Swift + Kotlin)

Pros:

- Maximum platform control and polish.
- Best possible deep OS integration.
- Fine-grained performance tuning per platform.

Cons:

- Highest development and maintenance cost.
- Features implemented twice.
- Slower release velocity and higher regression risk.
- More difficult to keep behavior consistent with current PWA.

When this is justified:

- You need advanced platform-specific experiences that web technologies cannot support.
- You have dedicated iOS and Android engineering capacity long term.

### Option B: Single Shared Codebase + Native Shell (Recommended)

Pros:

- Keep one feature implementation for both platforms.
- Fastest path to app stores.
- Reuse the existing PWA look and behavior.
- Lower QA matrix and lower long-term cost.

Cons:

- Some native APIs require plugins and extra platform-specific testing.
- Certain edge-case UX patterns can differ by platform and require conditional handling.

When this is justified:

- You prioritize speed, consistency, and maintainability.
- Your current web app already performs well on mobile (true for CypherLog).

## Feasibility: Can We Keep the Current PWA Features?

Yes, this is very feasible.

Core product functionality can stay shared across:

- Navigation, tabs, dialogs, forms, and themes.
- Nostr relay logic, publishing/subscriptions, data transforms.
- IndexedDB/local data management patterns.
- Existing PWA update/offline UX patterns (with some native adaptations).

### What Changes in a Native Wrapper Context

- Service Worker behavior differs from browser-installed PWA behavior and may be reduced in importance once inside a native webview.
- Some browser APIs behave differently on iOS/Android webviews than in Chrome/Safari proper.
- Native app distribution introduces app signing, provisioning, store policies, and release pipeline requirements.

## Amber Login and Signing Flow (Android)

CypherLog should implement a dedicated Android signer bridge for Amber with a clear fallback strategy.

### Target Behavior

1. User taps `Log in with Amber` in CypherLog Android app.
2. App launches Amber through Android intent.
3. User approves pubkey access/signing permission in Amber.
4. CypherLog receives callback result and stores session linkage (not private key).
5. For each signing/encryption action, CypherLog requests Amber signature via bridge.
6. Amber returns signed payload; CypherLog publishes event as usual.

### Architecture Approach

- Keep all app UI/state in shared React code.
- Implement a small Android-native bridge layer that:
  - checks Amber availability,
  - launches intents,
  - receives callback results,
  - exposes a JS-accessible API to the web layer.
- Add capability detection in the shared login flow:
  - Android native app + Amber installed -> Amber path,
  - otherwise fallback to existing signer methods (browser extension, NWC, etc. where applicable).

### Security/Session Rules

- Never request or store `nsec` in CypherLog app storage.
- Store only minimal session references needed to re-establish Amber linkage.
- Require explicit user re-authorization when Amber or app identity changes.
- Log signer errors/events without leaking sensitive payload data.

## Recommended Implementation Plan

## Phase 0 - Readiness Assessment (No Product Changes)

- Confirm mobile performance baseline on current PWA.
- Inventory all browser APIs currently used.
- Classify each capability as:
  - works unchanged in Capacitor webview,
  - needs a Capacitor plugin,
  - should be reworked for native behavior.

Deliverables:

- API compatibility checklist.
- Plugin selection list.
- Risk register for iOS/Android differences.

## Phase 1 - Create Native Shells with Shared Web Build

- Add Capacitor to the existing project.
- Create iOS and Android platform projects.
- Wire build output into Capacitor sync/copy pipeline.
- Run current app inside both shells without feature rewrites.
- Add Android bridge scaffolding for Amber availability check and intent roundtrip.

Deliverables:

- Internal test builds on physical iOS and Android devices.
- Baseline smoke test checklist.

## Phase 2 - Native Capability Parity

Add only what meaningfully improves user outcomes:

- Push notifications (maintenance reminders, key events).
- Native deep links/universal links/app links.
- Secure credential/key material storage via Keychain/Keystore plugins.
- Better file share/open-in flows.
- Optional biometric gate for sensitive actions.
- Production Amber login/sign integration for Android.

Deliverables:

- Native capability matrix (feature by platform).
- Security model update for mobile key handling.
- Amber compatibility matrix (Android versions, OEM variants, Amber versions).

## Phase 3 - Production Hardening

- Offline and reconnect stress testing under poor network conditions.
- Background/foreground lifecycle handling for live Nostr sessions.
- Memory and startup performance tuning.
- Crash reporting and analytics instrumentation.

Deliverables:

- Mobile SLO targets (launch time, crash-free sessions, sync reliability).
- Release candidate sign-off report.

## Phase 4 - Store Release and Operations

- App Store and Play Store metadata/assets.
- Privacy policy and permission disclosures.
- Phased rollout strategy.
- Patch/hotfix playbook.

Deliverables:

- v1 store releases.
- Release runbook for ongoing operations.

## Potential Pitfalls

1. **Service worker assumptions in native webview**
   - Browser PWA caching patterns do not map 1:1 to app-embedded webviews.
   - Mitigation: rely on app-bundled assets + explicit in-app caching strategy; treat SW as web-channel optimization.

2. **Nostr realtime lifecycle on mobile**
   - WebSocket/relay behavior can be interrupted in background mode.
   - Mitigation: implement robust reconnect, backoff, and visibility/app-state handling tuned for mobile lifecycle.

3. **Key management and signing security**
   - Mobile threat model differs from desktop browser.
   - Mitigation: move sensitive secrets to native secure storage and define explicit signer architecture per platform.

4. **Push notification complexity**
   - APNs and FCM setup, token lifecycles, and permissions can be tricky.
   - Mitigation: design push architecture early; include fallback local notifications where possible.

5. **Store policy compliance**
   - Content, payments, and account flows can trigger review friction.
   - Mitigation: align UX and permission prompts with Apple/Google policy from the beginning.

6. **Plugin lock-in or maintenance drift**
   - Some plugins become stale.
   - Mitigation: prefer well-maintained official plugins and keep a fallback plan for custom native bridges.

7. **Amber integration edge cases (Android)**
   - Intent callback handling can vary by device/OEM and app lifecycle state.
   - Mitigation: validate warm/cold start callback paths, add robust timeout/retry UX, and test across multiple Android versions/devices.

## Efficiency Gains from Native Packaging

1. **One feature, two platforms**
   - Product logic ships once instead of duplicated Swift/Kotlin implementations.

2. **Shared design system**
   - Existing UI components and styles remain your primary implementation layer.

3. **Shared QA and release cadence**
   - Most regressions are caught in one place; platform-specific validation focuses on integrations.

4. **Faster iteration**
   - Most features can ship with web-layer changes plus periodic native shell updates.

5. **Broader distribution**
   - Keep PWA channel for web users while adding app-store discoverability and trust.

## Areas Where Fully Native Still Wins (Long-Term Consideration)

If CypherLog later needs any of these at scale, evaluate selective native screens or a larger rewrite:

- Heavy real-time rendering workloads with strict frame-time requirements.
- Complex background processing requirements not suited to web runtime constraints.
- Very deep OS integrations beyond plugin ecosystem coverage.

## Suggested Architecture for CypherLog

- **UI and product logic:** existing React app (shared).
- **Mobile runtime:** Capacitor iOS and Android wrappers.
- **Native bridge layer:** plugins for secure storage, push, deep links, and device integrations.
- **Data/network model:** keep current Nostr + app-state architecture, with mobile lifecycle hardening.

This keeps CypherLog’s current identity and UX while giving you true native distribution and selective native power where it matters.

## Practical Next Steps

1. Approve architecture direction: **shared codebase + Capacitor wrappers**.
2. Run a short technical spike (1-2 weeks) to validate:
   - startup performance,
   - Nostr connectivity lifecycle,
   - secure storage flow,
   - push prototype,
   - Amber login + sign roundtrip on Android physical devices.
3. Define MVP scope for store launch (must-have vs later native enhancements), with Amber marked as Android GA blocker.
4. Build phased rollout plan: internal test -> beta -> public release.

## Summary

For CypherLog, creating two fully separate native apps is usually not the best first move. The strongest path is a shared codebase that powers both iOS and Android via native shells, then progressively adds native capabilities where they materially improve security, reliability, and UX. This approach is feasible, efficient, and aligned with your current PWA-first success.
