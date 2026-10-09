# Local AI review integration feasibility

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
