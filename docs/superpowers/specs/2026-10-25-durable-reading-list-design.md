# Durable news reading list

The user selected a durable reading list after the complete open-PR review and merge. Saved stories must remain readable after live-feed replacement, switching workspaces, and reloading the browser. Build on the current NEWS Saved controls, popup bookmark action, and context menu.

## Approach

Store selected article snapshots in a versioned local document. Keeping only IDs is the current implementation and cannot reopen expired feed entries. A server account and cloud synchronization would require new infrastructure and are outside this feature. Local snapshots are the implementation choice for the user's requested durable list.

## Requirements

- Saving captures an independent `NewsArticle` snapshot including headline, source link, source, publication time, snippet, and typed metadata needed by the current popup. Feed refreshes do not mutate saved snapshots. Full publisher pages are not downloaded.
- Capture the actual article passed into the popup or context menu, including category-panel stories absent from the workspace feed.
- Desktop and mobile Saved lists open stored snapshots in the existing popup. Both expose accessible open/remove controls and explicit empty/unavailable states.
- Use a separate store with session memory that survives NEWS unmount/remount. Keep the main SIGINT store's persistence version unchanged.
- New storage key: `si-news-reading-list-v1`. Document: `{ version: 1, entries: [{ id, savedAt, article }] }`, where unresolved legacy entries use `savedAt: null` and `article: null`.
- A valid new document is authoritative even when empty. If absent, migrate IDs from `si-news-bookmarks`. Resolve legacy entries when matching feed/popup articles are observed. Keep unmatched IDs removable; removed IDs must not return on later observation.
- Persist the new document successfully before removing the old key. Do not overwrite malformed/unsupported stored documents. Validate snapshots and HTTP(S) source URLs before hydration.
- Guard storage getter, reads, JSON parsing, and writes. On failure, preserve current edits in session memory with a visible warning that changes may not survive reload. A failed save must not throw through UI interaction.
- Maximum 200 saved entries. Reject an additional save with a visible message; never silently evict articles. Preserve oversized legacy lists and existing data, allow removal, and withhold writes until within the limit.
- Ensure inside clicks on both mobile and desktop Saved surfaces do not trigger outside-click dismissal before the row action executes.
- No new runtime dependencies; use existing React, Zustand, TypeScript, Zod, and Vitest/test renderer as appropriate.

## Verification

Behavior tests cover reload persistence, immutable snapshots, save/remove, actual popup article capture, migration and delayed resolution, malformed/throwing storage, session remount fallback, capacity, and mobile saved-row interaction. Run the full suite, TypeScript, production build, and a desktop/mobile interaction check if a browser is available.
