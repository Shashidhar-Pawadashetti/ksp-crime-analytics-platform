# esbuild Bundle Report — Phase 1

| Function | Bundle Size | Externalized | Cross-folder deps bundled | Issues |
|----------|------------|-------------|--------------------------|--------|
| classifier | 6.0 KB | zcatalyst-sdk-node | 0 | None |
| nl_sql | 12.2 KB | zcatalyst-sdk-node | 0 | None |
| rag | 6.6 KB | zcatalyst-sdk-node | 0 | None |
| pipeline | 33.1 KB | zcatalyst-sdk-node | 0 | None |
| session | 6.7 KB | zcatalyst-sdk-node | 0 | None |
| query_exec | 3.9 KB | zcatalyst-sdk-node | 0 | None |
| test | 439 B | zcatalyst-sdk-node | 0 | None |
| entity-matching-engine | 21.9 KB | zcatalyst-sdk-node | 4 (normaliser, phonetic, scorer, threshold) | None |
| graph-traversal | 24.7 KB | zcatalyst-sdk-node | 4 (bfs, traversalService, validation, pathUtils) | None |
| personmaster-api | 439 B | zcatalyst-sdk-node | 0 | None |
| personmaster-writer | 14.3 KB | zcatalyst-sdk-node | 2 (writer, validator) | None |
| sync-full | 74.4 KB | zcatalyst-sdk-node, fs, path, os | 9 (entity-matching-engine: normaliser, phonetic, scorer, threshold; personmaster-builder: documentBuilder, clusterBuilder, edgeBuilder, edgeValidation; personmaster-writer: writer) | None |
| sync-incremental | 74.3 KB | zcatalyst-sdk-node, fs, path | 2 (personmaster-builder: documentBuilder, edgeBuilder) | None |

## Externalized packages

All 13 functions externalize `zcatalyst-sdk-node` (injected by Catalyst at runtime). Node.js built-in modules (`fs`, `path`, `os`, `http`, `https`, `Buffer`, etc.) are auto-externalized by `--platform=node` and do not appear in the bundles.

## Dynamic require warnings

No dynamic require warnings were produced by esbuild. All `require()` calls in the bundles are either:
- Static string literals for externalized packages (`require("zcatalyst-sdk-node")`)
- Standard esbuild runtime helpers (`__require()` function wrappers)

## Missing dependency warnings

No missing dependency warnings. All dependencies resolved correctly because esbuild traversed `require('../')` paths relative to the function's directory and found the target files on disk.

## Runtime verification

All 13 bundles were verified to load without `MODULE_NOT_FOUND`:

| Function | Loads without error |
|----------|-------------------|
| classifier | ✅ |
| nl_sql | ✅ |
| rag | ✅ |
| pipeline | ✅ |
| session | ✅ |
| query_exec | ✅ |
| test | ✅ |
| entity-matching-engine | ✅ |
| graph-traversal | ✅ |
| personmaster-api | ✅ |
| personmaster-writer | ✅ |
| sync-full | ✅ |
| sync-incremental | ✅ |
