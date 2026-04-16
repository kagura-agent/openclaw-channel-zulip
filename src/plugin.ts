/**
 * Zulip ChannelPlugin definition — skeleton.
 *
 * This will be the full ChannelPlugin<ZulipAccount> once gateway/outbound
 * adapters are implemented.
 */

import type { ZulipAccount } from "./types.js";

export const ZULIP_META = {
  id: "zulip" as const,
  label: "Zulip",
  selectionLabel: "Zulip",
  docsPath: "channels/zulip",
  blurb: "Open-source team chat with topic-based threading",
  markdownCapable: true,
};

export const ZULIP_CAPABILITIES = {
  chatTypes: ["dm", "group", "thread"] as const,
  threads: true,
  reactions: true,
  edit: true,
  media: true,
  reply: true,
  blockStreaming: false,
};

// Full ChannelPlugin<ZulipAccount> will be assembled here once
// gateway.ts and outbound.ts are implemented.
// For now, export the building blocks.
export type { ZulipAccount };
