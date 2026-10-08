# Senslop upload transport and code parsing research

Use one bounded HTTP JSON upload for each frozen snapshot, then prepare the review in the background. Evaluate Pierre Diffs for rendering; treat deterministic import and symbol analysis as optional additions to the approved AI context flow. This note compares alternatives and explains the actual source format and the proposed parsing pipeline before implementation.

Research date: October 5, 2026. Current baseline: Node >=24, Next.js 16.3.8, React 19.2.8. Recommendations below do not amend the approved [PRD](prd.md) or [technical spec](spec.md). Candidate libraries have not been installed or integration-tested.

## Upload transport options

Keep the approved design: one authenticated HTTPS upload of a bounded, immutable snapshot; persist it in Neon before dispatching the background job. Keep the existing WebSocket service for account-scoped CLI presence. The spec's initial bounds are 1 MiB per text file and 20 MiB per snapshot, binary metadata only. Continue sync uploads a complete replacement snapshot and then merges progress; it is not a stream of patches appended to an old review. Initial browser preparation status is read from Senslop's persisted data.

“One upload” means one application transaction, not that the network transmits every byte at one instant. Network transfer still arrives in pieces. The endpoint should authenticate before accepting substantial work, enforce the actual received-byte bound even without a reliable Content-Length, validate the complete payload, and publish nothing partial. Use the same request ID after a timeout so a received-but-unacknowledged upload cannot create two reviews. The user can see upload/preparation stages without using WebSockets to transport code. Next route handlers expose standard Request body methods, including JSON and FormData; these do not provide resumability by themselves. [Next route-handler API](https://nextjs.org/docs/app/api-reference/file-conventions/route).

| Option                                      | Benefit                                                                                           | Cost and fit                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One bounded HTTP JSON request               | Smallest protocol; straightforward authorization, validation, idempotency, and atomic persistence | Interrupted transfer retries the payload. Best starting point for the approved 20 MiB cap.                                                                                                                                   |
| Several concurrent HTTP file/chunk requests | Retry only missing pieces; potential parallel throughput                                          | Requires upload sessions, owner checks per piece, manifest/hash verification, expiry/cleanup, and a final commit step. Useful when measured upload failures justify it.                                                      |
| WebSocket chunks                            | Reuses a persistent connection; bidirectional messages                                            | Reconnection, durable acknowledgement, offsets, checksums and finalization remain application responsibilities. It also expands the presence service into a separate upload backend. No current product need justifies this. |
| Resumable HTTP via tus                      | Standard mechanism for resuming from an acknowledged byte offset                                  | Adds protocol/server state and persistent temporary storage; good future choice for unreliable networks or increased size limits.                                                                                            |
| Direct object storage / multipart           | Offloads large transfers; parallel and independent part retries                                   | Adds storage and a signed-upload/finalization lifecycle, changing the approved JSONB-first architecture. Better reserved for larger snapshots.                                                                               |

tus uses HEAD to retrieve the accepted offset and PATCH to continue; parallel upload is an optional concatenation extension, not the default sequential offset flow. [tus protocol](https://tus.io/protocols/resumable-upload). S3 multipart supports independent parts, parallelism, and retransmission; AWS recommends it as a best practice at 100 MB or larger. That threshold is guidance for S3, not a universal upload limit. [S3 multipart docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html).

Compression is optional optimization after measuring real snapshots, not a reason to choose WebSockets. Bound decompressed content as well as bytes on the wire. The `ws` maintainers warn that per-message compression adds performance and memory overhead and recommend representative workload testing. [ws compression guidance](https://github.com/websockets/ws#websocket-compression).

Next.js has a consequential integration detail: when Proxy handles a request, it clones/buffers its body with a documented default 10 MB cap, below our 20 MiB envelope cap. The current [Proxy matcher](../apps/web/src/proxy.ts) excludes API routes. Preserve that separation and authenticate the upload route itself; verify full-body handling and deployed ingress limits before relying on a 20 MiB upload. Do not confuse Server Actions body settings with App Router Route Handlers. [Next Proxy body buffering](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize)

## Current raw snapshot

The existing `senslop inspect --working-tree --json` command produces the following exact JSON. It was captured from a disposable repository with a one-line change, using the built CLI. Its `eligible: false` is intentional: this miniature example does not meet the five-files-with-ten-changed-lines requirement. No source from the developer's repository is included in this example.

```json
{
  "source": {
    "kind": "working-tree",
    "base": "95f777abf9beecf1f7219e7f278705a95af87a99",
    "head": null,
    "firstParent": false
  },
  "files": [
    {
      "status": "M",
      "oldPath": "greeting.ts",
      "path": "greeting.ts",
      "before": "export const greeting = \"Hello\";\n",
      "after": "export const greeting = \"Welcome\";\n",
      "beforeHash": "e5c96872505706e28f8562d08f6f11eb6b21c00abcbfe95a64f4a3bc6c1bf6c3",
      "afterHash": "ad2219832f095f90f9bdd2096ce4773d4ffe01988d2244defd9fa1ba148dada8",
      "binary": false,
      "added": 1,
      "deleted": 1,
      "diff": "diff --git \"a/greeting.ts\" \"b/greeting.ts\"\n--- \"a/greeting.ts\"\n+++ \"b/greeting.ts\"\n@@ -1 +1 @@\n-export const greeting = \"Hello\";\n+export const greeting = \"Welcome\";\n"
    }
  ],
  "excluded": [],
  "eligibility": {
    "eligible": false,
    "qualifyingFiles": 0,
    "requiredFiles": 5,
    "requiredChangedLines": 10
  },
  "frozenContents": {
    "greeting.ts": {
      "before": "export const greeting = \"Hello\";\n",
      "after": "export const greeting = \"Welcome\";\n"
    }
  },
  "hash": "b5ad438c33faf8134b317cb1867a7fbfc0e8acc691a18985bfcb219768ed645c"
}
```

`before` and `after` are complete source strings, with newlines and quotes escaped by JSON. They are not token arrays or HTML. `diff` is a unified patch string. `@@ -1 +1 @@` identifies old/new line ranges; `-` and `+` identify deletion and addition. File identities come from the explicit manifest fields, not a renderer's interpretation of quoted patch headers. Added files have a null before side; deleted files have a null after side. Binary entries carry metadata without source contents. Git supplies machine-oriented path/status output and documented patch formats. [Git diff](https://git-scm.com/docs/git-diff)

This is a local inspection object, not a finished HTTP upload contract. The collector defines `FrozenSnapshot` and `SnapshotFile` in [snapshot.ts](../packages/cli/src/features/git/snapshot.ts); shared source validators and limits live in [contracts](../packages/contracts/src/index.ts) and [constants](../packages/contracts/src/lib/constants.ts). The review-core package is still a placeholder.

## Proposed upload envelope

Define one shared Zod upload schema before implementing the CLI sender or web route. The approved spec calls for a request ID, protocol version, source descriptor, files, hashes, and a context map. An illustrative structure is:

```json
{
  "requestId": "a-new-uuid-for-this-submission",
  "protocolVersion": 1,
  "source": {
    "kind": "working-tree",
    "base": "resolved-commit-id",
    "head": null,
    "firstParent": false
  },
  "files": [],
  "excluded": [],
  "snapshotHash": "digest-of-the-canonical-source-manifest",
  "contextMap": {
    "definitions": [],
    "relationships": [],
    "unresolvedReferences": []
  }
}
```

The empty arrays above are structural placeholders, not an eligible submission; `files` contains entries like the raw example. Exact context-map field names and hashing serialization remain proposals. Authentication travels in the authorization header; account ownership is derived server-side. Keep the CLI-only `frozenContents` lookup local because it duplicates `files.before/after`. Recompute line counts and eligibility server-side rather than trusting the CLI's claim. Freeze retries to the same bytes and request ID; reject reusing that ID with different content.

Current collection checks both selected before/after byte totals and serialized inspection JSON against 20 MiB, with a 1 MiB per-file-side read limit. The upload bound must cover the entire serialized envelope, including patch text, metadata, and context map. Removing duplicate source lowers overhead but does not justify silently raising a limit. A source digest establishes consistency, not authorship: the account credential authenticates who submitted it.

## From raw source to a review

1. **Collect locally.** Resolve commit/range identities or freeze the working tree. Preserve exact source, path/status information, and hashes. Gather bounded context from the correct frozen revisions; unchanged definitions may be important even when they are absent from the changed-file list.
2. **Accept through HTTP.** Authenticate first, enforce a byte limit while reading the body, parse JSON, then validate the shared schema. Check file paths, hashes, side existence, patch coordinates, changed-line counts, and eligibility. Do not rely only on a declared Content-Length.
3. **Save before preparing.** Persist the immutable snapshot and pending generation, then dispatch Trigger.dev using identifiers. A response such as `{reviewId, generation, status, url}` confirms acceptance; the browser polls the owned status endpoint. A failed dispatch leaves saved input available for retry. [Approved upload and job rules](spec.md#upload-api-and-job-dispatch)
4. **Derive structure.** Parse hunks into old/new line mappings. Optional syntax analysis supplies definition spans and import edges. AI proposes meaningful sections and related groups. Deterministic checks reject unknown paths, invalid ranges, and missing changed lines; cycles become explicit related groups. Prepare bounded batches, not one model call containing the entire snapshot. [Approved preparation rules](spec.md#review-preparation-task)
5. **Render a view model.** The browser receives ordered groups, file metadata, section ranges, and relationships. Load exact old/new contents for the selected file and render highlighted code. Keep file order/notes/completion in Senslop state; the renderer owns presentation, not account persistence or source truth. Fetching the selected file avoids repeatedly sending every file on each status poll.

“Clean up” means deriving navigation and presentation. Never reformat or rewrite uploaded code, strip whitespace, or replace source with AI summaries. Store note/explanation references as snapshot generation, file identity, old/new side, and one-based line ranges. UI line selections must map back to those coordinates, including deletions. [Approved rendering and explanations](spec.md#review-workspace-and-diff-renderer)

For a JavaScript/TypeScript import example, `checkout.ts` importing `Price` from `price.ts` yields a dependency edge from the consumer to its prerequisite. The review order can place `price.ts` first. Preserve whether the relationship is syntactically resolved, unresolved, or proposed by AI. A module import graph does not automatically prove the order of every function/type definition within those files.

## Parsing and rendering libraries

| Package                           | Verified capabilities                                                                                                                                                                   | Fit and limit                                                                                                                                                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pierre/diffs`                   | Parses unified patches or compares old/new files; split/stacked displays, Shiki highlighting, line selections, annotations, light/dark, virtualized CodeView, workers, SSR              | Strong first candidate for the web viewer. Annotation coordinates explicitly include old/new side and one-based source lines. Uses Shadow DOM: integrate theme through supported variables/custom themes rather than assuming Tailwind classes cross that boundary. |
| `react-diff-view`                 | `parseDiff` wraps `gitdiff-parser`; split/unified hunks, collapsed context expansion with source supplied, commenting widgets, customizable events/styles and worker-compatible parsing | Credible fallback for finer ordinary React composition. It does not automatically make rendering every large file cheap; its own README reports slow large-diff full rendering.                                                                                     |
| `parse-diff`                      | Parses unified patches into file chunks and added/deleted/context entries                                                                                                               | Small parser-only option if the chosen viewer does not already supply parsing; does not supply syntax or dependency analysis. [Source and API](https://github.com/sergeyt/parse-diff)                                                                               |
| `shiki`                           | Light/dark syntax themes in one highlighted output, controlled via CSS variables                                                                                                        | Syntax coloring, not Git parsing, semantic analysis, or dependency resolution. Already included by Pierre; avoid adding a duplicate highlighter pipeline if we choose that renderer.                                                                                |
| `dependency-cruiser`              | Programmatic JS/TS module dependency graph and JSON output; tsconfig resolution, cycles, dependency classifications                                                                     | Best turnkey file-import graph. Include type-only dependencies deliberately, restrict recursive traversal, and analyze frozen revisions rather than the current checkout. It cannot resolve runtime expressions such as `import(variable)`.                         |
| `ts-morph`                        | Import declarations/module specifiers, symbol references, configurable in-memory project                                                                                                | Better when Senslop needs exact definition/type spans and references within TS/JS. Requires enough source/config/type information for useful resolution; partial snapshots yield unresolved edges.                                                                  |
| `tree-sitter` / `web-tree-sitter` | Incremental concrete syntax trees with syntax-error tolerance; native Node and Wasm bindings                                                                                            | Future multilanguage syntax extraction. Each language needs a grammar and queries; a syntax tree alone does not resolve imports or create a correct cross-language dependency graph. Native/Wasm packaging adds CLI complexity.                                     |

Pierre's upstream manifest explicitly accepts React `^18.3.1 || ^19.0.0`, matching Senslop's React 19.2.8 declared version. Docs include a Next.js worker recipe and SSR APIs, but this does not establish that Next 16.3.8/Turbopack has been tested here. The manifest currently reads version 1.5.1; that is an upstream source observation, not verified latest published npm metadata. [Pierre docs](https://diffs.com/llms-full.txt), [manifest](https://github.com/pierrecomputer/pierre/blob/main/packages/diffs/package.json).

`react-diff-view` declares React `>=16.14.0`, but its development/test manifest uses React 18; peer acceptance alone is insufficient proof of React 19 behavior. [README](https://github.com/otakustay/react-diff-view), [manifest](https://github.com/otakustay/react-diff-view/blob/master/package.json). [Shiki dual themes](https://shiki.style/guide/dual-themes).

Dependency-cruiser exposes `cruise()` and emits module dependencies as JSON. Its default programmatic traversal follows dependencies recursively, including node_modules; options should explicitly constrain that. Use JSON/own options rather than executing an arbitrary repository's JavaScript config. The current upstream engine range is `^22 || ^24 || >=26`: supported Node 24 fits, but Senslop's broader `>=24` CLI range also admits Node 25, which this library excludes. A dependency decision must reconcile that range. [API](https://github.com/sverweij/dependency-cruiser/blob/main/doc/api.md), [options](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md), [dynamic import limits](https://github.com/sverweij/dependency-cruiser/blob/main/doc/faq.md), [manifest](https://github.com/sverweij/dependency-cruiser/blob/main/package.json).

ts-morph supports retrieving imports, locating source modules, finding references, and an in-memory filesystem. Keep this read-only and populated from the frozen source boundary. [Imports](https://ts-morph.com/details/imports), [references](https://ts-morph.com/navigation/finding-references), [in-memory projects](https://ts-morph.com/setup/file-system). Tree-sitter parses syntax and supports separate native/Wasm JavaScript bindings; semantic resolution would be our additional work. [Tree-sitter introduction](https://tree-sitter.github.io/tree-sitter/).

## Recommended next decisions and checkpoints

Use one bounded HTTP JSON submission and keep the existing WebSocket service scoped to presence. Evaluate `@pierre/diffs` with the exact current patches and preserved full source before selecting it. Keep language-independent AI context as the baseline; if deterministic TypeScript references are desired next, trial `ts-morph` against an in-memory frozen project. Use `dependency-cruiser` instead when the immediate goal is a broader module graph; do not install both by default.

The first implementation checkpoint should cover the shared upload contract, HTTP route, and CLI sender: duplicate retries create one review, changed bytes under the same request ID fail, oversized bodies fail, hashes and patch coordinates agree, and the server rechecks eligibility. Confirm the 20 MiB boundary end-to-end through the Railway deployment. The renderer checkpoint should cover deleted/renamed files, quoted and Unicode paths, missing final newline, CRLF, binary metadata, exact selection coordinates, collapsed context, mobile, both themes, and near-limit files. Parser evaluation must preserve frozen revisions and explicitly report unresolved imports rather than fabricate graph edges. These are future build checks, not checks completed by this research.

All choices in this note are planning proposals. The approved PRD/spec and application implementation remain unchanged.
