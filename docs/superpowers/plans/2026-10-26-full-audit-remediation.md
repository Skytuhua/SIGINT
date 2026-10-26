# Full Audit Remediation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development; independent subsystem ownership, followed by task and whole-branch reviews.

**Goal:** Repair all 51 reportable groups from the audit of 58af9f7 and merge verified repairs.

**Architecture:** Preserve existing public workflows while fixing shared enforcement, lifecycle, data-normalization and presentation boundaries. Independent workers own disjoint files; integration and review run centrally.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Cesium, MapLibre, pnpm.

**Spec:** Audit findings reproduced in the task sections below; full evidence retained in /workspace/work/full-audit.

## Global Constraints

- Preserve existing legitimate workflows and route contracts.
- Do not fabricate live data or silently substitute unrelated data.
- Keep external fetch validation bound to connection use and cancellation through body consumption.
- Add regression coverage for security, data correctness and lifecycle bugs; verify low-impact display changes through focused checks.
- Root owns commits, dependency installation, full-suite checks and GitHub integration.

## Review Focus

- Caller cancellation and DNS/redirect validation must remain effective through full response consumption.
- Empty and partial provider results must preserve filters and source provenance.
- Unmounts and feature switches must discard stale asynchronous results.
- Denied local storage must preserve a usable application.
- Market values must retain correct units, dates and live/fallback status.

## Task 1: security

**Files and interfaces:** Own the paths identified by each finding below; preserve exported interfaces unless callers require an audited change. Security owns SSRF, rate-limit, summary, fetch-timeout and camera-proxy helpers; server excludes those. Market owns UI only; server owns Yahoo provider. Dependencies owns package/config/lock/runtime only.

- [x] Confirm each reported cause against implementation, direct callers and existing reproduction.
- [x] Add and run a failing behavior regression for nontrivial changes.
- [x] Apply the smallest complete repair per finding.
- [x] Run focused tests and type checks; record commands and exact outcomes.
- [x] Independently review the subsystem diff and resolve confirmed blockers.

- `SEC-1`: Outbound destination validation is detached from the actual connection
- `SEC-2`: Arbitrary-host response bodies are buffered before effective resource limits
- `SEC-3`: Rate-limit identity trusts a caller-controlled forwarding-header field
- `SEC-4`: Shared article-summary cache omits request context that determines the result

## Task 2: server

**Files and interfaces:** Own the paths identified by each finding below; preserve exported interfaces unless callers require an audited change. Security owns SSRF, rate-limit, summary, fetch-timeout and camera-proxy helpers; server excludes those. Market owns UI only; server owns Yahoo provider. Dependencies owns package/config/lock/runtime only.

- [x] Confirm each reported cause against implementation, direct callers and existing reproduction.
- [x] Add and run a failing behavior regression for nontrivial changes.
- [x] Apply the smallest complete repair per finding.
- [x] Run focused tests and type checks; record commands and exact outcomes.
- [x] Independently review the subsystem diff and resolve confirmed blockers.

- `server-01`: Normalize OFAC -0- placeholders before classifying sanctions entities
- `server-02`: Preserve an empty UCDP result instead of returning the unfiltered snapshot
- `server-03`: Apply requested dates to the merged news results
- `server-04`: Read timeline points from GDELT series data
- `server-05`: Do not label every PIA privacy aircraft as military
- `server-06`: Restore the malformed sanctions fallback dataset
- `server-07`: Keep the upstream deadline active through body consumption
- `server-08`: Cache successful null lookups as actual cache entries
- `server-09`: Deduplicate RSS items by identity instead of one global publication watermark
- `server-10`: Use reported quarterly EPS to calculate earnings surprises

## Task 3: news-state

**Files and interfaces:** Own the paths identified by each finding below; preserve exported interfaces unless callers require an audited change. Security owns SSRF, rate-limit, summary, fetch-timeout and camera-proxy helpers; server excludes those. Market owns UI only; server owns Yahoo provider. Dependencies owns package/config/lock/runtime only.

- [x] Confirm each reported cause against implementation, direct callers and existing reproduction.
- [x] Add and run a failing behavior regression for nontrivial changes.
- [x] Apply the smallest complete repair per finding.
- [x] Run focused tests and type checks; record commands and exact outcomes.
- [x] Independently review the subsystem diff and resolve confirmed blockers.

- `NS-01`: Stabilize optional context arrays to stop the article popup request loop
- `NS-02`: Distinguish ISO country codes from provider-specific FIPS aliases
- `NS-03`: Do not cache one map feature's enrichment under the next feature's identity
- `NS-04`: Run the primary search before sequential fallback queries
- `NS-05`: Render the search results surface outside the desktop-only branch
- `NS-06`: Use the full filtered result set for search rather than the live terminal subset
- `NS-07`: Keep empty mobile category feeds mounted until their lazy fetch can recover
- `NS-08`: Invalidate cache priming before disable/dispose can be followed by re-enable
- `NS-09`: Gracefully handle denied browser storage in map preferences
- `NS-10`: Expire buffered SSE items as the selected time window advances

## Task 4: geospatial

**Files and interfaces:** Own the paths identified by each finding below; preserve exported interfaces unless callers require an audited change. Security owns SSRF, rate-limit, summary, fetch-timeout and camera-proxy helpers; server excludes those. Market owns UI only; server owns Yahoo provider. Dependencies owns package/config/lock/runtime only.

- [x] Confirm each reported cause against implementation, direct callers and existing reproduction.
- [x] Add and run a failing behavior regression for nontrivial changes.
- [x] Apply the smallest complete repair per finding.
- [x] Run focused tests and type checks; record commands and exact outcomes.
- [x] Independently review the subsystem diff and resolve confirmed blockers.

- `GEO-001`: Stop globe initialization when its component has unmounted
- `GEO-002`: Pass numeric filters the shape required by TanStack
- `GEO-003`: Initialize globe controls before waiting for optional camera data
- `GEO-004`: Observe postprocessing parameters as well as the preset
- `GEO-005`: Advance one camera at a time in single view
- `GEO-006`: Keep demonstration data out of live operational tables and metrics
- `GEO-007`: Do not consume keyboard navigation intended for other controls
- `GEO-008`: Cancel custom camera animations when selection changes or clears
- `GEO-009`: Keep native toggle inputs keyboard and screen-reader accessible

## Task 5: market

**Files and interfaces:** Own the paths identified by each finding below; preserve exported interfaces unless callers require an audited change. Security owns SSRF, rate-limit, summary, fetch-timeout and camera-proxy helpers; server excludes those. Market owns UI only; server owns Yahoo provider. Dependencies owns package/config/lock/runtime only.

- [x] Confirm each reported cause against implementation, direct callers and existing reproduction.
- [x] Add and run a failing behavior regression for nontrivial changes.
- [x] Apply the smallest complete repair per finding.
- [x] Run focused tests and type checks; record commands and exact outcomes.
- [x] Independently review the subsystem diff and resolve confirmed blockers.

- `market-heatmap-truncation`: Batch all heatmap symbols rather than silently retaining static returns for 115 stocks
- `market-heatmap-frequency`: Lower heatmap polling below the quotes endpoint request budget
- `market-commodity-cents`: Format cent-denominated commodity quotes in their actual unit
- `market-eps-units`: Give EPS a per-share formatter instead of the dollar-million formatter
- `market-2y-mislabel`: Do not label a 13-week Treasury bill quote as the US two-year yield
- `market-crypto-7d`: Calculate seven-day returns before downsampling the sparkline
- `market-crypto-fabricated-history`: Identify synthetic crypto returns and historical charts instead of displaying them as live data
- `market-crypto-dominance`: Use total crypto market cap as the dominance denominator, or label the subset explicitly
- `market-ticker-live`: Remove the LIVE label from the hardcoded desktop ticker
- `market-lineup-static-current`: Label the daily briefing snapshot and suppress fabricated fallback news
- `market-regime-missing`: Treat absent signal inputs as unknown rather than zero returns
- `market-converter-partial`: Base converter freshness on the selected currencies rather than any successful batch
- `market-stop-ignored`: Use the stop price and pending order state in simulated STOP orders
- `market-lineup-disabled`: Honor the saved Turn Off Daily Lineup setting before automatically opening the modal
- `market-earnings-dates`: Render the date of each upcoming earnings event
- `market-comparison-keyboard`: Make stock comparison suggestions keyboard selectable

## Task 6: dependencies

**Files and interfaces:** Own the paths identified by each finding below; preserve exported interfaces unless callers require an audited change. Security owns SSRF, rate-limit, summary, fetch-timeout and camera-proxy helpers; server excludes those. Market owns UI only; server owns Yahoo provider. Dependencies owns package/config/lock/runtime only.

- [x] Confirm each reported cause against implementation, direct callers and existing reproduction.
- [x] Add and run a failing behavior regression for nontrivial changes.
- [x] Apply the smallest complete repair per finding.
- [x] Run focused tests and type checks; record commands and exact outcomes.
- [x] Independently review the subsystem diff and resolve confirmed blockers.

- `DEP-UNDICI-RUNTIME-CRASH`: Attacker-selected article upstream reaches crash-prone builtin fetch parser
- `DEP-NEXT-IMAGE-CACHE`: Default self-hosted image optimizer permits unbounded disk-cache variants
- `DEP-MAPLIBRE-ATTRIBUTION`: Third-party MapTiler attribution reaches a known vulnerable HTML sanitizer

## Integration

- [x] Account for all 52 raw IDs as 51 merged reporting groups.
- [x] Run the full Vitest suite, TypeScript, production build, JSON validation and dependency audit.
- [x] Exercise desktop/mobile browser workflows and async cleanup controls.
- [x] Perform whole-branch review, repair confirmed regressions and rerun affected checks.
- [ ] Create and merge a PR after CI passes; record deployment/runtime limitations accurately.
