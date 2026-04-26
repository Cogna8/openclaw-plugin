![OpenClaw + Cogna8](https://raw.githubusercontent.com/Cogna8/openclaw-plugin/main/docs/assets/openclaw-cogna8.png)

# Cogna8 OpenClaw Plugin

Gate OpenClaw tool calls through Cogna8's action authority runtime.

Install it, enable a few policies in the Cogna8 Portal, and your OpenClaw agents stop writing secrets to `.env`, deleting your home directory, or pushing to `main` without confirmation.

## Quick start (5 minutes)

### 1. Get an API key

Sign in at [openclaw.cogna8.ai](https://openclaw.cogna8.ai) with Google, then visit **Dashboard → API Keys** and click **Generate key**. Copy the key (starts with `cg8_sk_`).

### 2. Install the plugin

```bash
git clone https://github.com/Cogna8/openclaw-plugin.git
cd openclaw-plugin
npm install
openclaw plugins install .
```

### 3. Configure

Add the plugin to your OpenClaw config (`~/.openclaw/config.json5` or equivalent):

```json5
{
  plugins: {
    entries: {
      cogna8: {
        enabled: true,
        config: {
          apiKey: "cg8_sk_<your-key-here>"
        }
      }
    }
  }
}
```

Then restart the gateway:

```bash
openclaw gateway restart
```

### 4. Pick your policies

Visit **Dashboard → Policies** at [openclaw.cogna8.ai](https://openclaw.cogna8.ai) and enable the pre-built templates:

- **Block shell command execution** — prevents `bash`, `sh`, `zsh`, `powershell`, and related variants
- **Block file deletions** — prevents `rm`, `unlink`, `trash`, and compound variants
- **Block file writes** — prevents writes including to `.env`, `.ssh`, `.aws`, credentials files
- **Block outbound HTTP** — prevents data exfiltration via HTTP calls
- **Block code execution** — prevents `python`, `node`, `eval`, and related execution tools

You can also create custom rules for specific tools — for example, confirm rules that pause for your approval before running `sudo`, `rm -rf`, or `git push` to protected branches.

### How confirmations appear

When a confirm rule matches a tool call, OpenClaw delivers an approval prompt through whichever channel you're using — Telegram inline keyboard, Slack Block Kit buttons, Discord components, TUI prompt, or any other channel supported by your OpenClaw setup. You approve or deny in-channel. OpenClaw handles the UX; Cogna8 records the outcome for your audit log.

### 5. Verify

Trigger a tool call in OpenClaw. In the gateway logs you'll see:

```
[cogna8] Agent registered (external_id=default, public_id=agt_..., status=synced)
[cogna8] Registered. Evaluating tool calls against https://openclaw-api.cogna8.ai (agent: default, failureMode: open)
```

If a block rule matches, you'll see `[cogna8] Blocked tool call <tool_name> ...`.

If a confirm rule matches, you'll see `[cogna8] Approval required for <tool_name> (decision_id=ev_...)`.

In the Portal, the **Usage** page shows your evaluation count incrementing live, and the **Agents** page shows your plugin's registration.

## How it works

When an OpenClaw agent is about to call a tool, the plugin sends the tool-call context to Cogna8's service. Cogna8 evaluates it against your active policies and returns one of:

- `allow` - the tool call proceeds
- `block` - the tool call is stopped with a reason shown to the agent
- `confirm` - the tool call pauses for user approval

If the Cogna8 service is unreachable, behaviour depends on `failureMode`:

- `failureMode: "open"` (default) allows tool calls
- `failureMode: "closed"` blocks tool calls

All policy logic runs server-side. The plugin is a thin transport layer. You can change policies from the Portal without touching your OpenClaw config.

## Configuration options

| Option | Default | Meaning |
|---|---|---|
| `apiKey` | required | Cogna8 API key from [openclaw.cogna8.ai/dashboard/keys](https://openclaw.cogna8.ai/dashboard/keys) |
| `serverUrl` | `https://openclaw-api.cogna8.ai` | Cogna8 service base URL |
| `agentId` | `default` | Agent identifier sent to Cogna8 |
| `timeoutMs` | `3000` | Evaluate request timeout in milliseconds |
| `failureMode` | `open` | `open` allows on failure, `closed` blocks on failure |

## Resilience

The plugin automatically retries transient service errors and trips a circuit breaker on sustained failure to keep your tool calls healthy during deploys, blips, or service outages.

**Retry policy** (not configurable):

- Single retry on 502, 503, 504, and network errors (ECONNRESET, ETIMEDOUT, EAI_AGAIN, ENETUNREACH).
- 200ms delay before retry.
- Both attempts share the `timeoutMs` budget — total time is bounded at the configured `timeoutMs` (default 3000ms).
- 4xx, 500, and abort errors are not retried.

**Circuit breaker** (not configurable):

- After 5 consecutive transient failures, the breaker opens.
- While open, evaluate calls bypass the service for 30 seconds and apply `failureMode` directly.
- A single successful evaluate after cooldown closes the breaker.

These behaviors are intentionally not configurable in v0.4. They use sensible defaults derived from operational experience. If you observe them mis-tuned in production, file an issue.

## Automatic agent registration

On plugin load, the plugin registers the configured agent with Cogna8 by calling `POST /api/v1/agents/register`. Registration is idempotent - subsequent restarts return `synced` status.

One Cogna8 agent identity is used per plugin install, using the `agentId` from config (default `"default"`). All OpenClaw tool calls routed through this plugin are evaluated against that single Cogna8 identity. Multi-agent support is planned.

## Free tier

- 10,000 evaluations per month
- 10 registered agents
- 25 rules per agent
- Burst rate 100 requests/minute per API key

## Links

- [OpenClaw Portal](https://openclaw.cogna8.ai) - manage keys, policies, and view usage
- [Cogna8](https://cogna8.ai) - product site
- [Report a bug](https://github.com/Cogna8/openclaw-plugin/issues/new)

## License

MIT. See [LICENSE](./LICENSE).
