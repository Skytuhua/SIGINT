# Durable Reading List Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the single coherent feature task, with independent review before merge.

**Goal:** Make saved NEWS articles available after the live feed changes or the app reloads.

**Architecture:** A separate versioned local reading-list document stores explicit article snapshots and unresolved legacy bookmarks. A module-backed store and React hook connect a shared Saved list to the existing NEWS workspace and popup.

**Tech Stack:** React 18.3.1, TypeScript 5.5.4, existing Zustand/Zod, Vitest 4 and React test renderer.

**Spec:** `docs/superpowers/specs/2026-10-25-durable-reading-list-design.md`

## Global Constraints

- New storage key: `si-news-reading-list-v1`; legacy key: `si-news-bookmarks`.
- Version 1 document: `{ version: 1, entries: [{ id, savedAt, article }] }`.
- Maximum 200 entries; no silent eviction or destructive migration.
- A valid new empty document overrides legacy data.
- Preserve the main SIGINT persistence version; add no runtime dependencies.
- Storage failures keep session edits and show a visible warning.

## Review Focus

- Category-panel articles can exist outside `feedItems`: save the actual popup article.
- Mobile unmounts NEWS: session fallback must survive component remount.
- Malformed/newer stored documents must remain untouched.
- Failed migration writes must preserve legacy IDs.
- Mobile mousedown must not unmount Saved before row click/removal.

### Task 1: Deliver a durable reading list through existing NEWS controls

**Files:**
- Create `src/lib/news/readingList.ts` and behavioral tests under `src/lib/news/__tests__/`.
- Create `src/hooks/useNewsReadingList.ts` and hook tests under `src/hooks/__tests__/`.
- Create `src/components/news/NewsSavedArticlesList.tsx` and interaction tests under `src/components/news/__tests__/`.
- Modify `src/components/news/NewsWorkspace.tsx`, `src/components/news/NewsPopupModal.tsx`, and `src/app/globals.css` only where needed for this feature.
- Update `README.md` with the local reading-list behavior and capacity.

**Interfaces:**
- `ReadingListEntry`: `{ id: string; savedAt: number | null; article: NewsArticle | null }`.
- A store factory accepts a lazy storage provider, exposes stable snapshot/subscription, hydration, toggle(article), remove(id), and reconcile(articles) operations. Exact internal names may follow existing conventions.
- `useNewsReadingList` exposes entries, saved membership, toggle/remove/reconcile, and visible warning state without causing server hydration mismatch.
- Popup `onToggleBookmark` receives the current `NewsArticle`, not just its ID.
- Shared saved rows accept entries, open/remove callbacks, and warning text; desktop/mobile use the same behavior.

- [ ] Write behavior tests first. Assert that a saved article can be reopened after replacing the feed and reconstructing the store from storage, and that later changes to the input do not mutate the saved snapshot.
- [ ] Add migration, empty-document precedence, delayed resolution, removal-before-resolution, throwing getter/read/write, unsupported document, HTTP(S) validation, capacity, and oversized legacy tests. Observe expected failures before implementing.
- [ ] Implement the snapshot model and guarded persistence/store. Retain legacy data until a successful new write, and keep operations usable in session memory.
- [ ] Implement the hook, shared Saved list, actual-article popup callback, and workspace integration. Remove duplicated ID-only render paths and fix both Saved boundaries.
- [ ] Add hook/UI behavior tests for popup stories outside the feed, reopening saved snapshots, removal, remount fallback, visible storage/capacity warnings, and inside mobile interactions. Confirm failing behavior before the final change.
- [ ] Run focused tests, then `npx --yes pnpm@9 test`, `npx --yes pnpm@9 typecheck`, `npx --yes pnpm@9 build`, and `git diff --check`.
- [ ] Commit only feature files and documentation. Produce a report with changed interfaces, test evidence, limits, and any remaining concern; request independent review before publishing.
