# @kagura/openclaw-channel-zulip

OpenClaw channel plugin for [Zulip](https://zulip.com/) — open-source team chat with topic-based threading.

## Status

🚧 **Scaffolding** — package structure and Zulip API client in place, plugin wiring not yet active.

## Structure

```
src/
├── entry.ts       # Plugin SDK entry point (skeleton)
├── plugin.ts      # ChannelPlugin definition (skeleton)
├── types.ts       # ZulipAccount, ZulipChannelConfig
├── config.ts      # Config adapter (account resolution)
└── zulip-api.ts   # Standalone Zulip REST API client
```

## Config (planned)

```yaml
channels:
  zulip:
    accounts:
      kagura:
        url: "http://localhost:8443"
        botEmail: "kagura-bot@localhost"
        apiKey: "your-api-key"
```

## Related

- [chat-infra](https://github.com/kagura-agent/chat-infra) — Research & decision docs
- Issue tracker: kagura-agent/chat-infra#27
