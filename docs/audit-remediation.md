# Audit remediation — 2026-10-26

Repairs for all 51 reportable groups from the audit of commit `58af9f7a3b01ed1bdc423422c2b974aa42ba1bf4` (52 raw IDs; `SEC-2` and `server-07` share a deadline/body-resource boundary).

The changes preserve public camera/article requests, provider route contracts, saved articles, and existing workspaces. They fix shared enforcement and asynchronous ownership rather than hiding failed data behind unrelated or invented results.

## Repair map

| Audit ID | Repair |
| --- | --- |
| `SEC-1` | Untrusted arbitrary HTTP(S) URLs resolve public addresses once per actual connection. A per-request undici Agent pins only those addresses, retains original Host/TLS hostname, forces manual redirects, rejects resolution errors/mixed public-private answers, and destroys the connector after the consumer callback. Camera, article and OTC HEAD/range-GET paths use this boundary. Blocked ranges include private/shared/local/special IPv4, mapped and compatible IPv6, local/multicast IPv6, and known NAT64/6to4 embedded private IPv4 forms. RFC8215 local-use NAT64 prefix64:ff9b:1::/48 is rejected in full, for literal and resolved addresses regardless of suffix, while well-known64:ff9b::/96 with public embedded IPv4 remains allowed. |
| `SEC-2 / server-07` | Camera and article consume streamed bytes under one signal spanning initial DNS, per-hop validation, network and body. Camera cap 10MiB, article cap 2,500,000 decoded bytes. Oversize data is rejected without retaining remaining chunks. Readers are canceled and connectors destroyed on cap, deadline, rejected response and normal completion. Caller cancellation and cachedFetch timeout signal reach the source operation. |
| `SEC-3` | Forwarded identity is ignored by default. Explicit TRUSTED_CLIENT_IP_HEADER accepts a single validated canonical IPv4/IPv6 address, rejects lists/hostnames/ports/malformed values, and normalizes equivalent/mapped identities. Limiter maps are bounded at10,000 active entries; capacity fails closed without evicting active quota. docs/security-ingress.md documents ingress overwrite and origin restriction contract. |
| `SEC-4` | Summary cache keys include normalized headline used for relevance/extractive ranking/AI prompt. Extraction stays independent of headline. Both caches include the exact normalized fetch URL, excluding only HTTP-unsent fragments; canonical response sourceUrl is preserved. Tracking-looking query values reaching the publisher cannot alias one cache entry. |
| `server-01` | Normalize every sentinel before mapping, classify explicit SDN type first, treat a missing SDN type as Organization unless a meaningful vessel field survives, and require identifier label word boundaries. Repair snapshot classifications only using surviving valid identifiers, otherwise Other. |
| `server-02` | Track successfully loaded years independently from event count. loadAdditionalYear reports boolean availability; initial failure with no available years is unavailable, successful empty datasets are live and are remembered. Compute the unloaded default from the release version. Collect unavailable requested years and merge only their filtered snapshot events with any live results, preserving successful empty requested years. Await dynamic route params for Next 15. Successful empty provider recovery also replaces stale cached fallback data. |
| `server-03` | Compute one request-time publication interval, apply it before dedupe/threading and after video fallback insertion, and retain inclusive UTC dates and relative-window boundaries. Explicit calendar bounds take precedence over a relative timespan. |
| `server-04` | Select Volume Intensity (or the first supplied series), read its data array, and retain only dated finite numeric samples while preserving real zeroes. |
| `server-05` | Filter PIA aircraft through existing independent military-evidence classifier. |
| `server-06` | Recover first complete document, remove sentinels and invalid identifiers, preserve all19,709 distinct entities and original provenance; mark unrecoverable types Other. Coalesce refresh, await write to unique same-directory temporary path followed by atomic rename, cleanup temp, and retry empty outages. |
| `server-08` | Return entry wrappers from fresh/stale lookups and unwrap values only on hits, covering fresh,stale-while-revalidate,refresh failure and circuit-open paths. |
| `server-09` | Use bounded10,000entry seen StreamItem ID set, preserving delayed and equal-time identities and cursor reset. |
| `server-10` | Remove annualEPS fields from quote request and output unknown event consensus (em dash), omitted actual/surprise; retain date/symbol/company/calendar sorting contract. |
| `NS-01` | Stable omitted context arrays stop response-triggered request loops; AbortController cancels prior article requests and stale results are ignored. |
| `NS-02` | Generic ISO/name/ISO3 normalization preserves ISO2. Explicit bidirectional GDELT FIPS conversion is applied on raw provider ingestion and outbound source-country queries. Added sourced FIPS aliases, correcting omitted aliases such as Switzerland, Iceland, Serbia, Australia and Singapore. Review round1 closed both remaining ACLED GDELT builders via a shared validated ISO/name→FIPS converter, validating true ISO membership and supporting full English country names. Unknown/injected country input is rejected before provider cache/network, both routes return400 for unsupported countries, and a versioned ACLED cache key avoids reuse of previously misattributed data. |
| `NS-03` | Military and trade enrichment state carries response identity. Caches are written only by the owned successful fetch, outside render. Static trade fields carry their node identity. |
| `NS-04` | The single primary attempt runs and is awaited before sequential fallback queries. Existing wider fallback behavior is retained after an empty primary result. |
| `NS-05` | Search results surface is shared by desktop and mobile with a positioned desktop anchor and mobile full-width fixed sizing. Mobile cards respond to pointer, Enter and Space. |
| `NS-06` | Search counts and lists use the complete filtered result collection; selected-row and keyboard/context selection use the displayed collection. Live cutoff remains confined to live tape. Rolling retention now respects 7d/30d/from-date query bounds. Calendar bounds take precedence over rolling retention, including historical end-date-only queries; memory remains capped at 1,200 items. |
| `NS-07` | Empty mobile panels are hidden while their fetch-owning children remain mounted, allowing delayed dedicated fetches and subsequent recovery/polling. |
| `NS-08` | Runtime disposal is terminal; per-layer generations invalidate delayed cache primes and in-flight runs on disable/dispose. Both map continuations recheck generation, runtime/map identity, mounted state and current toggle after awaits. Repeated unchanged enable syncs preserve pending ownership. Startup continuations stop after unmount. |
| `NS-09` | Optional browser preference reads and writes catch denied storage getter/read/write errors. Both maps and SIGINTApp globe-height initializer use the shared safe helper. Review round1 also routes NewsDailyBriefingModal Turn Off preference writes through writeBrowserPreference so Close and Escape always call onClose when storage is denied. |
| `NS-10` | Client stream maps are pruned on a 15s clock, heartbeat and data events. Snapshot/insert capacity remains bounded, and local search reapplies the current time cutoff. |
| `GEO-001` | Each initialization owns its viewer, worker, timers, subscriptions and AbortController. Stale continuations stop after imports/initial style/viewer creation; late returned viewers are destroyed. initViewer destroys an already allocated viewer immediately on abort during terrain or tiles, and destroys late tiles before attachment. Postprocess checks viewer liveness after its import. |
| `GEO-002` | The shared single-value column inputs use an explicit case-insensitive text filter for every accessor, stringifying numeric values instead of relying on TanStack numeric-range inference. Explicit per-column filters can still override the default. |
| `GEO-003` | Essential subscriptions, click handlers, frame handlers and readiness precede optional feeds. Satellite boot, seeded render work, CCTV, static GeoJSON and scenes run independently with mount cancellation. CCTV sources each have an8second deadline and no retry; one successful source survives another failure, while both failures reject rather than publishing a false fresh empty update. Static layers use bounded shared fetch policy. |
| `GEO-004` | Style subscription equality compares preset, CRT distortion/instability, NVG brightness, FLIR contrast, sharpen and bloom. |
| `GEO-005` | NEXT SET advances one camera for effective single view and four for grid, including effective mode in callback dependencies. |
| `GEO-006` | Removed automatic flight/quake/satellite demonstration rows. Absolute KPI counts still derive from actual live arrays. Unmeasured KPI and row deltas are null and omitted; synthetic row sparklines and unrelated count-series KPI sparklines are absent. Source summary values remain zero for empty input. Existing loading/empty states and real source trends remain. |
| `GEO-007` | The globe exposes a labelled focusable region. Shortcuts require an event inside its focused context, an active viewer and enabled Hotkeys. Handled events, modifier keys, selects, inputs, textareas, buttons and editable/combobox targets retain their own keyboard behavior. |
| `GEO-008` | Custom focus animations retain a cancel handle and generation. Clear, any replacement selection, navigation controls/scenes, pointer/wheel/pinch gestures and unmount remove their private postRender listener and release lookAt transform. Late Cesium imports check generation before animation setup. Double-click publishes the new selection only after previous target/tracking teardown, preserving the replacement animation. |
| `GEO-009` | Native shared Toggle checkboxes remain in the accessibility/focus tree using a visually hidden input technique instead of display:none; focus-visible outlines the adjacent indicator. Existing label wrapping preserves the accessible name and native Space behavior. |
| `market-heatmap-truncation` | MarketHeatmapPanel now reads useHeatmapQuotes; four bounded 50-symbol batches cover all 165 symbols. Merge only finite observations; missing stocks are gray/unavailable with per-tile native titles and coverage count; no fallback return fixtures. |
| `market-heatmap-frequency` | Poll a single nonoverlapping four-request cycle every 60s after completion; honor 429 Retry-After before the next cycle, abort on unmount. Four requests/minute per mounted heatmap leaves budget for Overview siblings. |
| `market-commodity-cents` | Use one item-unit-aware formatter for price, day range and52-week range: cent-denominated quotes keep raw value with¢; dollar contracts keep $. |
| `market-eps-units` | FundRow accepts a formatter; EPS renders dollars/share at two decimals. Income heading explicitly excludes EPS from $M. |
| `market-2y-mislabel` | Relabel ^IRX as 3M and US 3M Treasury Bill; no fabricated2Y observation added. Review round 1 also maps the actual 3M click to TVC:US03MY and verifies row-to-widget identity through the real overlay. |
| `market-crypto-7d` | Calculate seven-day change from first/last valid positive raw samples before downsampling; sampled plot preserves both endpoints. |
| `market-crypto-fabricated-history` | Delete synthetic shape/fallback histories and static 1H/30D/FDV/ATH constants. Unsupported columns/history render unavailable; missing 7D has no invented line; empty market response has an empty state; retained real response becomes STALE on failure. |
| `market-crypto-dominance` | Use Shown assets total, BTC share of shown and SHARE* labels with explicit subset disclosure; locate BTC by symbol instead of row0. |
| `market-ticker-live` | Keep existing decorative constants with a visible SIMULATED · as-of unknown label and matching title; removeLIVE. |
| `market-lineup-static-current` | Remove all unsourced fallback headlines and current-day/current-time stamps. Empty news shows No headlines available. Fixture quotes, calendars, analysts, narratives and summaries have an explicit simulated-reference/unknown as-of note plus section-level labels. |
| `market-regime-missing` | Validate finite per-signal inputs; missing inputs get Unavailable/null scores. Require all 4 signals before displaying any composite/gauge needle. Apply equivalent RSP/SPY/VIX guards to breadth; label static breadth counts as undated simulation and model gauges as illustrative. |
| `market-converter-partial` | Remove all fixed FX fallbacks. Require finite positive observations for both selected currency legs; selected pair isUNAVAILABLE when absent, LIVE only when response is live and selected legs exist; samecurrency usesIDENTITY. |
| `market-stop-ignored` | Snapshot each simulated order stop/limit, start PENDING, evaluate buy/sell stop conditions on displayed spot changes, latch stop-limit trigger then enforce limit, and fill at simulatedspot only if executable. Reject invalid stop/limit and clear flash timer on unmount. Review round 1 adds a reachable Yahoo quote source in the real overlay, ticket persistence across tabs, symbol-scoped lifecycle reset, null quote/disable behavior and caller-level polling tests. Review identity repair preserves CoinGecko coin IDs through selection and uses their own provider for crypto quotes; symbols never fall through to an equity quote. |
| `market-lineup-disabled` | Read saved disabled before desktop/mobile auto-open; preserve explicit manual open; storage write failure cannot prevent modal close. |
| `market-earnings-dates` | Group upcoming rows under visible calendar-date headings using time dateTime while preserving narrow BMO/AMC time column and existing row interaction. |
| `market-comparison-keyboard` | Render suggestions as native buttons with accessibleAdd SYMBOL labels and onClick, allowing Tab/Enter/Space activation. A selector-level blur guard keeps suggestions while focus is inside and hides them only on leaving. |
| `DEP-UNDICI-RUNTIME-CRASH` | Use patched npm Undici7.30.1 and select the independently checked Node22.23.4 runtime in CI, engines and .nvmrc. Arbitrary-host requests use npm Undici explicitly. Production must select the configured runtime. |
| `DEP-NEXT-IMAGE-CACHE` | Upgrade Next15.5.28 and disable the unused image optimizer. |
| `DEP-MAPLIBRE-ATTRIBUTION` | Upgrade MapLibre6.4.1, whose sanitizer snapshots the attribute collection before removal. |

## Review and integration corrections

Independent subsystem reviews identified and prompted corrections for the actual UCDP failure status, empty future-year default selection, ordering when replacing globe selection, the real source of simulated-order price updates, crypto/equity identity collisions, the three-month Treasury chart identity, Serbia’s remaining ACLED/GDELT boundary, local-use NAT64 classification, healthy-empty UCDP cache replacement, and historical end-date-only retention. Each confirmed correction has a focused regression. Blocked local storage also covers the intelligence-briefing Turn Off close and Escape actions.

Additional confirmed repairs cover query-aware rolling news retention, country-profile changes, stale cached map layers, military rows beyond the former 500-row limit, and magnitude filtering of the existing seismic table. No new earthquake globe layer was introduced.

## Verification

All checks ran against the integrated source using Node `22.23.4` and pnpm 9 where applicable.

| Check | Result |
| --- | --- |
| Full Vitest suite | 469 passed, 0 failed/skipped, across 87 test files |
| TypeScript `tsc --noEmit --incremental false` | Passed |
| Next production build | Passed; all 34 static pages generated |
| Dependency registry audit | Zero advisories across 328 dependencies |
| Committed JSON/GeoJSON under `public/data` | All 28 parsed; sanctions snapshot has 19,709 distinct IDs |
| Chromium desktop and phone production checks | Exact search, older results, viewport-contained overlays, popup request stability, saved articles, reload/remount/removal and session storage fallback passed |
| Chromium blocked-storage and OPS controls | Startup/workspace navigation and briefing close passed; native checkbox Space/focus indicator and native select arrow handling passed |
| Final whole-branch review | Approved after the two final regression proofs passed independently |
| Whitespace/diff checks | Passed |

The build retains the existing Tailwind warning that its content configuration is empty; this application supplies its styles in the global stylesheet. Browser checks use controlled API responses that follow route contracts and intentionally unavailable external providers.

The original security failures no longer reproduce in focused deterministic tests: changing DNS cannot change the approved destination; private and local-use literal/DNS forms are rejected; oversized or stalled body reads cancel; caller cancellation remains active; untrusted identity headers do not replenish quotas; headline/request-URL variants do not poison another summary context. Public camera images, article HTML, OTC HEAD/range-GET requests, public DNS forms and successful body reads remain covered.

Shared security enforcement lives in `src/lib/server/ssrf.ts`, `src/lib/server/fetchWithTimeout.ts` and `src/lib/server/rateLimit.ts`, with the article-summary provider and camera routes as direct consumers. Regression coverage includes `src/lib/server/__tests__/outbound.test.ts`, `fetchWithTimeout.test.ts`, `rateLimit.test.ts`, provider/route tests and adapter deadline tests. These are repository-level fixes and checks; no live exploitation or formal hosted Codex Security scan is claimed.

## Data and deployment limits

- The recovered sanctions snapshot contains 19,709 distinct entities. Original source provenance and age are preserved. Previously lost types for 16,610 OFAC entries are explicitly `Other`; valid surviving identifiers preserve 1,933 vessels and 164 aircraft. A successful official source refresh replaces those degraded types. The official OFAC endpoints were blocked by this workspace’s configured egress policy, so no types were invented.
- Annual quote EPS cannot substantiate quarterly earnings results. Missing quarterly values and unsupported crypto histories/metrics display as unavailable. Retained ticker and daily-lineup fixtures are labelled simulated with unknown as-of time.
- Orders are local simulations evaluated against observed quote updates; there is no brokerage execution.
- The dependency registry audit reports no known advisories for the selected lockfile. That inventory is distinct from proving production exploitability or the absence of all vulnerabilities. [Dependency and runtime details](audit-remediation-dependencies.md) record exact versions and controls.
- Actual production must select the configured Node runtime. Hosting account restrictions prevented verifying a new Vercel deployment during this work.
- Untrusted forwarding headers use one shared rate-limit identity by default. Per-client quotas require the explicit overwriting-ingress contract in [the ingress guide](security-ingress.md).
- Browser checks use deterministic providers. Exhaustive live-provider access, all WebGL timing schedules and assistive-technology interaction are not established by those checks.

## Execution decisions

The repairs used a dedicated branch in the existing clean managed checkout and the validated audit as the implementation scope. This avoided redundant design and isolation approval requests; if that scope or workspace choice is unsuitable, the integrated change remains reviewable and reversible through the pull request.
