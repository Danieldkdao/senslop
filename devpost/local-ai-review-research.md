# Local AI review integration feasibility

> Historical research, retained for provenance. Reconciled October 24, 2026: direct provider adapters, subscription connections, local context analysis, chat, grouping, and correctness reviews are now implemented. Earlier recommendations and third-party eligibility/API observations below reflect their research dates and have not been revalidated for this documentation refresh. Use [current scope](scope.md), [PRD](prd.md), and [spec](spec.md) for application behavior, and the [roadmap](local-review-roadmap.md) for future work.

Checked October 8, 2026 against primary official documentation. This is exploratory research, not an approved specification change.

## Execution and privacy boundaries

A local CLI can read a repository and produce structured review/grouping output. Running that CLI on a laptop does not mean model inference happens on the laptop. Claude Code authenticates to Anthropic servers; Codex's normal OpenAI modes use subscription or API authentication. Keeping source out of Senslop's database addresses persistence, not transit or processing. [Claude credential use](https://code.claude.com/docs/en/legal-and-compliance), [Codex authentication](https://learn.chatgpt.com/docs/auth).

Architectural inference: source can bypass Senslop servers when a local companion calls the user's chosen provider directly and uploads only explicitly selected review metadata. If Senslop proxies a managed request, its server necessarily processes plaintext source in memory unless a separate confidential-computing design exists. AI findings and user notes may themselves contain copied source, secrets, filenames, or proprietary descriptions; they need their own local-only or selective-sync policy.

## Codex

`codex exec` supports noninteractive execution, JSONL events, final JSON Schema output, a read-only sandbox, and ephemeral runs that avoid persisting session rollout files. It reuses saved CLI authentication; API keys are the recommended default for general automation, while trusted account-based automation is separately documented. Local `codex exec --help` confirmed these flags in this environment. [Noninteractive mode](https://learn.chatgpt.com/docs/non-interactive-mode).

Signing in with ChatGPT grants subscription access, while API-key usage is billed separately and follows API organization data settings. This supports investigating a user-owned local Codex workflow; it does not establish permission to copy users' credentials to Senslop servers. [Authentication](https://learn.chatgpt.com/docs/auth).

There is now an explicit third-party subscription integration route: Sign in with ChatGPT supports eligible Plus/Pro plan usage for open-source partners and selected private clients; commercial partners remain in a limited trial. This is an eligibility and registration constraint, not universal access. Its Codex app-server guide describes passing the app's OAuth access token to a child process and sending inference to the Responses API. [Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart), [Codex app-server integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

Recommendation: prioritize an explicitly user-invoked local Codex adapter and/or evaluate the documented open-source sign-in route. Keep provider credentials on the device. Verify eligibility and current integration terms before productizing subscription billing.

## Claude Code

`claude -p` supports scripts, piped diffs, JSON/JSONL responses, schema-constrained results, and tool restrictions. Bare mode skips ambient hooks, plugins, memory, and project instructions but also skips subscription OAuth authentication and requires API/provider credentials. A subscription adapter therefore cannot simply assume bare mode works with an existing login. [Programmatic execution](https://code.claude.com/docs/en/headless).

Official guidance currently conflicts in a material way:

- The legal/compliance guide says third-party developers must use API authentication, must not offer Claude.ai login in their own applications or route Free/Pro/Max credentials on behalf of users, and must not collect, store, or intermediate session tokens. [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance).
- The official help article updated October 7, 2026 says Agent SDK, `claude -p`, and third-party app usage can still draw from subscription limits. It also announces monthly API credits for Max/Team. [Claude plan usage](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).

These pages establish technical availability but do not resolve the precise commercial permission boundary for a Senslop companion invoking a customer's logged-in CLI. Do not present this as either universally permitted or categorically impossible. Obtain written provider clarification before making Claude subscription orchestration a required product dependency. An API-key adapter or user-generated review import is a practical alternative; import still needs review-content privacy controls.

## OpenRouter managed fallback

OpenRouter does not retain prompt/response content unless input/output logging or product-use sharing is enabled; it retains request metadata. Some prompts are anonymously categorized through a ZDR model. Upstream providers have separate policies, so OpenRouter's logging default alone is insufficient. [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection), [Provider policies](https://openrouter.ai/docs/guides/privacy/provider-logging).

The ZDR guide documents `provider.zdr: true`, which restricts inference routing to eligible endpoints. It is separate from no-training controls, does not cover enabled tools/plugins, and allows implicit in-memory prompt caching. An endpoint's policy can differ from its provider's default. [ZDR controls](https://openrouter.ai/docs/guides/features/zdr).

Architectural recommendation: managed review should be an explicit opt-in mode with payload logging disabled throughout Senslop, OpenRouter logging/sharing disabled, ZDR routing enforced, and no fallback to a weaker retention policy. Do not claim that Senslop never sees source when its backend proxies the request. A defensible statement is that source is processed transiently for the requested review and is not saved by Senslop, once the implementation and operational logs actually satisfy that claim.

## Suggested provider-independent contract

Keep capture, source storage, and Git reconstruction local. Normalize provider output into groups, evidence references, findings, review status, model provenance, and analyzed revision identifiers. Offer local-only review records first, with optional metadata sync and clear treatment of free-text notes. Support local user-owned CLI, direct BYOK, and managed ZDR review through separate adapters. True offline inference is another adapter and requires a locally hosted model, rather than a Claude or ChatGPT subscription.

## October 9 implementation research

At this October 9 research checkpoint, the PRD/spec had authorized browser inspection, durable local reviews, and provider settings; source execution, AI generation, hosted inference, and subscription adapters were still deferred. Later local AI and subscription implementation superseded those deferrals as described in the current spec. Project command execution and hosted inference remain outside the current local review implementation.

Installed versions checked: Node.js 24.14.0, Next.js 16.3.8, React 19.2.8, Turborepo 2.11.7, React Hook Form 7.89.0, Zod 4.6.5, `@napi-rs/keyring` 2.1.0, and `@lobehub/icons` 5.23.0. Read Next's bundled route-handler, standalone output, and external-package guides; Turbo's bundled README and task-running guide; and installed icon declarations. These take precedence over assumptions from older versions.

- [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html): built-in `DatabaseSync` provides local SQLite without a separately compiled database dependency. SQLite remains experimental in Node 24. Transactions, versioned initialization, private directories, and secure deletion handle durable local review records.
- [Keyring native abstraction](https://github.com/Brooooooklyn/keyring-node): native platform credentials, asynchronous entries, prebuilt optional binaries, and explicit persistent Linux Secret Service selection. No fallback to memory or plaintext is accepted. Runtime verification discovered that asynchronous secrets are returned as byte arrays; normalize before UTF-8 decoding.
- [Next standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [external packages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages): native keyring remains external. Next 16.3 creates hashed aliases under `.next/node_modules`; packaging must preserve those aliases, flatten npm-incompatible symlinks, and remove disposable route caches before copying a clean bundle.
- [Git revisions](https://git-scm.com/docs/gitrevisions), [Git log](https://git-scm.com/docs/git-log), [Git diff](https://git-scm.com/docs/git-diff): selectors use local references and log data. Existing exclusion, ancestor validation, and capture limits are shared with the terminal collector. No fetch or checkout is required.
- [React Hook Form](https://react-hook-form.com/docs/useform), [useWatch](https://react-hook-form.com/docs/usewatch): validated application forms and watched conditional fields with accessible errors. Server responses preserve drafts when persistence fails.
- [LobeHub skills documentation](https://icons.lobehub.com/skills.md), [icon repository](https://github.com/lobehub/lobe-icons): registry exports differ in supported variants. `ProviderIcon` derives props from each component rather than assuming Color/Combine/Text/Avatar exist for every icon. The installed registry has no dedicated llama.cpp icon, so that provider uses Meta's icon. Callers can select every exported icon by its registry name, supported variant, and component props.

Provider metadata endpoints were checked against their official documentation:

- [OpenAI models](https://platform.openai.com/docs/api-reference/models/list): bearer-authenticated `/v1/models`; label explains the ChatGPT/OpenAI API-key distinction.
- [OpenRouter models](https://openrouter.ai/docs/api/api-reference/models/get-models), [key information](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key): public model catalog, authenticated `/key` for explicit connection tests.
- [Google models](https://ai.google.dev/api/models): `/v1beta/models` and `x-goog-api-key`, avoiding keys in URLs.
- [Anthropic models](https://docs.anthropic.com/en/api/models-list): `/v1/models`, `x-api-key`, and required API-version header.
- [xAI models](https://docs.x.ai/developers/rest-api-reference/inference/models): compatible model metadata with bearer authorization.
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server): compatible `/v1/models`; optional key and saved context-window settings.
- [LM Studio compatible API](https://lmstudio.ai/docs/developer/openai-compat/models): `/v1/models`, localhost preset, optional authentication.
- [Ollama model list](https://docs.ollama.com/api/tags): native `/api/tags`; optional key for configured servers and context-window settings.
- [Vercel model catalog](https://vercel.com/docs/ai-gateway/models-and-providers): compatible `/v1/models`; a public catalog response alone does not prove key validity.
- [Mistral models](https://docs.mistral.ai/api/endpoint/models): authenticated compatible model list.
- [DeepSeek models](https://api-docs.deepseek.com/api/list-models/): authenticated `/models` metadata.
- [OpenCode Zen](https://opencode.ai/docs/zen/): named API-key connections using Zen model IDs and base URL; catalog reachability is distinguished from credential verification, with manual IDs when unsupported.

Implementation inference: metadata-only probes satisfy connection discovery without transmitting source or performing generation. Redirects are refused so credentials cannot silently follow another endpoint; failures never echo provider response bodies or credentials. Remote compatible endpoints require HTTPS. Tests exercise native and compatible metadata formats, rejection, unavailability, bounded responses, and public-catalog limitations.

## Workspace refinement research — October 9, 2026

- Rechecked installed Next.js 16.3.8 route handlers and Turborepo 2.11.7 running-tasks guidance before implementation. Reused installed generated Base UI Select, Popover, Command, and Dialog primitives; no generated UI changes in this pass.
- [shadcn Base UI Select](https://ui.shadcn.com/docs/components/base/select), [Command](https://ui.shadcn.com/docs/components/base/command), and [Popover](https://ui.shadcn.com/docs/components/base/popover): controlled selection uses Base UI value callbacks and render composition. Command uses `shouldFilter={false}` for database search results.
- [TanStack React Pacer debounce](https://tanstack.com/pacer/latest/docs/framework/react/examples/useDebouncer) and installed 0.24.1 `useDebouncedValue` declaration/source: the hook returns a value/debouncer tuple. Delay queries by 250 ms; abort superseded fetches and ignore stale responses.
- [Drizzle SQLite documentation](https://orm.drizzle.team/docs/sqlite/get-started-sqlite): the official `node:sqlite` integration currently installs `drizzle-orm@rc`. Registry stable is 0.45.4; hosted database package uses 0.45.3. Retain the dependency-free Node 24 driver under the owner's optional-ORM allowance. Existing transactional schema version upgrades and repository isolation remain intact.
- [React Hook Form handleSubmit](https://react-hook-form.com/docs/useform/handlesubmit) and [register](https://react-hook-form.com/docs/useform/register): preserve RHF validation for inline key saves and keyboard note submission. Blank key fields keep saved credentials; failures retain transient drafts.

## Provider inputs and query refactor research — October 9, 2026

- Read installed Next.js 16.3.8 `client-side-data-fetching/tanstack-query.md` and `use-client.md`, plus Turborepo 2.11.7 task guidance. The local layout provides an isolated, stable QueryClient; hosted providers remain unchanged.
- Installed TanStack Query 5.104.1 and checked its source/types against [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery), [query cancellation](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-cancellation.md), and [SSR isolation](https://tanstack.com/query/latest/docs/framework/react/guides/ssr). Consume the fetch AbortSignal, disable automatic retries, invalidate after mutations, and use `networkMode: "always"` for loopback access without internet connectivity. History metadata uses transient memory only.
- Reused the existing shared PasswordInput and the hosted authentication form's controlled [React Hook Form](https://github.com/react-hook-form/documentation/blob/master/src/content/docs/useform/register.mdx) composition. Keep reveal/hide focus inside the inline form so it does not prematurely save a draft. Do not add password-strength checking to API keys.
- Model-selection UI is removed under the latest owner instruction; persisted configuration remains backward compatible. Connection probes keep their existing metadata-only protocol.

## Automatic connection feedback and shared UI — October 9, 2026

Read the installed Next.js 16.3.8 `use-client` guide and Turbo 2.11.7 docs README/running-tasks before this pass. Verified the installed Base UI 1.8.0 TooltipTrigger types/source and ToastViewport behavior against current official documentation (the live site now documents 1.9.0).

- [Base UI composition](https://base-ui.com/react/handbook/composition) documents merged handlers/refs through `render`; the wrapper composes one DOM element rather than nesting buttons, and callers must forward DOM props/refs. [Tooltip guidelines](https://base-ui.com/react/components/tooltip) require accessible trigger names and treat tooltips as supplementary visual hints. Tested native/shared buttons, refs, form submission, Enter/Space, links, disabled controls, and dialog triggers/focus restoration.
- [Toast](https://base-ui.com/react/components/toast) uses a portaled viewport. The installed shared viewport and dialog overlays both had `z-50`; raising the viewport to `z-[100]` puts the entire toast stack above overlays. The child toast's own stacking value alone cannot escape the viewport's stacking context. Verified notification presence, modal accessibility, dismissal, and focus restoration behavior.
- [Collapsible](https://base-ui.com/react/components/collapsible) provides trigger expanded state, keyboard behavior, and panel visibility. Existing generated shadcn Base UI primitives cover this need without another dependency.
- Existing metadata-only probe behavior stays shared. [Vercel REST model listing](https://vercel.com/docs/ai-gateway/openai-compat/rest-api) and [OpenCode model catalog](https://docs.opencode.ai/docs/zen/) describe metadata access; a publicly reachable catalog cannot establish key validity. Automatic checks preserve that caveat rather than invoking paid generation. All probe secrets stay in server-side headers read from the OS store, and no repository content is sent.

## Persistent feedback and live editor preview — October 9, 2026

Checked installed React 19.2.8, Next.js 16.3.8, and `@pierre/diffs` 1.5.2 before implementation. Read Next's bundled use-client/lazy-loading guides and Pierre's installed README, React renderer, and option declarations. The current [Pierre site](https://diffs.com/) identifies 1.5.2; its [plain-text documentation](https://diffs.com/llms-full.txt) covers stable file references, MultiFileDiff, themeType, diffStyle, indicators, inline styles, backgrounds, wrapping, and line numbers. MultiFileDiff delegates to the same FileDiff renderer as the workspace. Share visual options and theme styles; omit review/comment actions from the settings sample.

[React's state identity guide](https://react.dev/learn/preserving-and-resetting-state) explains that changing a key destroys a component's local state. Two failing parent-level regressions confirmed that first-save changes the provider form key from provider name to saved UUID, clearing its connection result. A temporary stable-key probe made both tests pass. Retain only nonsecret feedback in the existing parent by saved connection ID, while preserving ID-keyed forms to avoid stale values after deletion or recreation. The feedback has no dismissal timer and is replaced by the next connection check.
