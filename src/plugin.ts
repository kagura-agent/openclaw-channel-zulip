/**
 * Zulip ChannelPlugin — full assembly.
 */

import type { ZulipAccount, ZulipChannelConfig } from "./types.js";
import { createGatewayAdapter } from "./gateway.js";
import { createOutboundAdapter } from "./outbound.js";
import { zulipConfigAdapter } from "./config.js";

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

/**
 * Build the full Zulip channel plugin.
 */
export function createZulipPlugin() {
  const gateway = createGatewayAdapter();

  // Outbound needs account resolution — we create a factory that gets
  // cfg at call time. For now, store a resolver reference.
  let currentCfg: unknown = null;

  const resolveAccount = (accountId?: string | null): ZulipAccount => {
    if (!currentCfg) throw new Error("Zulip plugin: config not initialized");
    const cfg = currentCfg as { channels?: { zulip?: ZulipChannelConfig } };
    const zulip = cfg.channels?.zulip;
    if (!zulip?.accounts) throw new Error("No Zulip accounts configured");
    const id = accountId ?? Object.keys(zulip.accounts)[0];
    const raw = zulip.accounts[id];
    if (!raw) throw new Error(`Zulip account not found: ${id}`);
    return { accountId: id, url: raw.url, botEmail: raw.botEmail, apiKey: raw.apiKey };
  };

  const outbound = createOutboundAdapter(resolveAccount);

  return {
    id: "zulip" as const,
    meta: ZULIP_META,
    capabilities: ZULIP_CAPABILITIES,
    config: zulipConfigAdapter,
    gateway: {
      startAccount: async (ctx: Parameters<typeof gateway.startAccount>[0]) => {
        currentCfg = ctx.cfg;
        return gateway.startAccount(ctx);
      },
      stopAccount: gateway.stopAccount,
    },
    outbound,
  };
}

export type { ZulipAccount };
