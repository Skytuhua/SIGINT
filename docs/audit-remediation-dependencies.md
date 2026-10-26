# Dependency and runtime remediation

Validated on 2026-10-26. The registry audit of the updated `pnpm-lock.yaml` reports **zero known advisories across 328 dependencies**, including development dependencies. This result covers the registry's package/version inventory; it does not establish that every package or deployed environment is free of vulnerabilities.

## Enabled dependency paths

| Audit finding | Change | Verification |
| --- | --- | --- |
| `DEP-UNDICI-RUNTIME-CRASH` / GHSA-xjj6-f33q-929c | Pin npm `undici` to `7.30.1`; select Node `22.23.4` in `.nvmrc` and CI, with `>=22.23.4 <23` in package engines. | An independently downloaded npm-distributed Node `22.23.4` reports builtin Undici `6.29.1`. The saved in-memory dispatcher reproduction for five and six content codings both caught the simulated upstream rejection and exited successfully. The affected advisory branch starts at Undici `7.18.0`. |
| `DEP-NEXT-IMAGE-CACHE` / GHSA-3x4c-7xq6-9pq8 | Pin Next to `15.5.28` and set `images.unoptimized: true`. The application uses direct image URLs. | Config assertions confirm optimization is disabled. The installed Next image request handler rejects requests when `images.unoptimized` is true, before constructing the optimizer cache. |
| `DEP-MAPLIBRE-ATTRIBUTION` / GHSA-jrc7-96c5-q579 | Pin MapLibre GL to `6.4.1`. | The installed sanitizer iterates over `Array.from(elem.attributes)`, avoiding mutation of the live attribute collection. The registry no longer reports the attribution sanitizer advisory. |

Global `fetch` uses Node's bundled Undici; updating npm `undici` alone does not replace it. Verify `node -p 'JSON.stringify({node:process.versions.node,undici:process.versions.undici})'` in the actual production process. Package engines and `.nvmrc` declare the required runtime, while CI selects it explicitly. Hosting runtime selection remains a deployment responsibility. The workspace's original Node `24.19.0` bundled vulnerable Undici `7.29.0`, so its higher Node major version was insufficient evidence of a fix.

## Version and compatibility changes

Direct dependency upgrades also include `fast-xml-parser` `5.7.0`, PostCSS `8.5.31`, Zod `4.6.7`, and Vitest `4.1.12`. Vite is an explicit development dependency at `7.3.7`: an override alone left a preexisting optional peer at `7.3.1`, which the subsequent audit detected. Node type definitions are `22.20.5`, satisfying Vite's supported Node type range.

The pnpm overrides pin patched versions of DOMPurify (`3.4.17`), protobufjs (`7.6.5`), `@protobufjs/utf8` (`1.1.1`), fast-xml-builder (`1.1.7`), Vite (`7.3.7`), esbuild (`0.28.1`), YAML (`2.8.3`), PostCSS (`8.5.31`), Nano ID 3 (`3.3.18`), Browserslist (`4.28.7`), baseline-browser-mapping (`2.11.0`), source-map-js (`1.2.2`), picomatch 2/4 (`2.3.2` / `4.0.4`), postcss-selector-parser 6/7 (`6.1.5` / `7.1.6`), and protocol-buffers-schema (`3.6.1`). Overrides that cross a transitive major version require compatibility checks when their parents change; the lockfile records the tested resolution.

Next's server package exclusion moves to `serverExternalPackages`. Zod record schemas now supply explicit string key schemas. Reading-list persistence requires no additional Zod migration: its existing storage and component tests pass against Zod 4. Next's asynchronous route parameters and MapLibre-facing application code are handled by the corresponding server and map changes.

## Checks

Run these with the selected Node `22.23.4` runtime and pnpm 9:

```sh
pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts
pnpm audit --json
pnpm exec vitest run src/lib/news/__tests__/readingList.test.ts src/components/news/__tests__/NewsWorkspace.readingList.test.ts
pnpm typecheck
```

Frozen lockfile validation passed. The two focused reading-list compatibility files passed all 32 tests. Final integrated validation passed 469 tests across 87 files, TypeScript and the production build, as recorded in [the overall remediation report](audit-remediation.md). Arbitrary-host camera/article/OTC requests now use the patched npm Undici transport explicitly with connection-bound destination validation; fixed-provider global fetch calls use the selected Node runtime.

The parser regression check uses an in-memory dispatcher: it sends a `content-encoding` header containing five or six `gzip` tokens, then invokes the response handler's error callback to simulate an early connection close. It makes no external request. Both Node `22.23.4` cases printed a caught fetch rejection and exited `0`, compared with the original workspace runtime's six-coding exit `1` from an unhandled stream error. This is a targeted runtime regression check, not an end-to-end production exploit test.
