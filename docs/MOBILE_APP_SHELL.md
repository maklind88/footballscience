# Football Science Mobile App Shell

Football Science must remain one product. The web platform at `https://footballscience.xyz` is the product source of truth, and any mobile or App Store package must behave as a shell around that live platform.

## Product Contract

- Live URL: `https://footballscience.xyz`
- Bundle ID target: `xyz.footballscience.app`
- Display name: `Football Science`
- Primary device targets: desktop and iPad.
- Secondary device targets: iPhone and Android.
- Desktop strategy: installable live PWA first, native desktop shell only if a clear workflow needs it later.
- iPad strategy: App Store shell around the live platform, optimized for tablet workspace use.
- Data source of truth: existing backend, Supabase, central sync and guarded APIs.
- Mobile shell role: open the same live platform with app-grade metadata, icon, launch surface and future native capabilities.
- The shell must not fork product logic, duplicate data ownership, write to a separate local store, or point to `file://`, `localhost`, preview deployments, or staging.

## What Updates Instantly

These changes should appear in the installed app after the normal live deploy, without a new App Store release:

- UI and module changes.
- Copy, spacing, layout and design-system updates.
- Dashboard, Squad, Medical, Session Planner, Scouting, Video and Admin behavior.
- Backend/API behavior.
- Permission changes enforced by backend.
- Supabase-backed data changes.

## What Requires App Store Review

These changes require a new iOS build and App Store review:

- App icon, display name, launch screen or bundle ID.
- Native push notification capability.
- Native camera, microphone, photo library or file-system capability.
- Native deep link/universal link capability.
- Any new native code or entitlement.

## Desktop and iPad Path

1. Ship the installable desktop/iPad PWA foundation from Live.
2. Validate desktop Chrome/Edge install behavior from `https://footballscience.xyz`.
3. Validate iPad Safari add-to-home-screen behavior from `https://footballscience.xyz`.
4. Enroll or confirm Apple Developer Program membership.
5. Create the App Store Connect iPad app with bundle ID `xyz.footballscience.app`.
6. Prepare privacy answers from the platform data inventory before submitting.
7. Build the first iPad shell against `https://footballscience.xyz`.
8. Test through TestFlight with the live QA account on iPad.
9. Submit with reviewer notes explaining that this is a private coaching platform and providing a test login through App Store Connect, never in source code.

## Review Risk

Apple can reject apps that are only a low-value website wrapper. To reduce that risk, the first App Store shell should be positioned as a signed-in iPad coaching workspace and should add at least one clear tablet value when needed, such as push notifications, camera/video upload workflow, file handling, or a native share/deep-link path.

## Current Repository Foundation

- `manifest.webmanifest` defines installable app metadata for the live web product.
- `assets/pwa/` contains PWA and iOS home-screen icons.
- `src/core/mobile-app-shell-contract.mjs` defines the one-product mobile shell contract.
- `qa/mobile-app-shell-contract.api.spec.mjs` protects the contract from local/preview/staging drift.
- No service worker is registered yet. That is intentional until we design a cache strategy that cannot serve stale app code, stale auth state or stale coaching data.
