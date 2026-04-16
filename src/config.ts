import type { ZulipAccount, ZulipChannelConfig } from "./types.js";

/**
 * Config adapter — resolves ZulipAccount from OpenClaw config.
 */

function getZulipConfig(cfg: { channels?: Record<string, unknown> }): ZulipChannelConfig | undefined {
  return cfg.channels?.zulip as ZulipChannelConfig | undefined;
}

export const configAdapter = {
  listAccountIds(cfg: { channels?: Record<string, unknown> }): string[] {
    const zulip = getZulipConfig(cfg);
    return zulip?.accounts ? Object.keys(zulip.accounts) : [];
  },

  resolveAccount(cfg: { channels?: Record<string, unknown> }, accountId?: string): ZulipAccount {
    const zulip = getZulipConfig(cfg);
    if (!zulip?.accounts) throw new Error("No Zulip accounts configured");

    const id = accountId ?? Object.keys(zulip.accounts)[0];
    const raw = zulip.accounts[id];
    if (!raw) throw new Error(`Zulip account "${id}" not found`);

    return {
      accountId: id,
      url: raw.url,
      botEmail: raw.botEmail,
      apiKey: raw.apiKey,
    };
  },

  defaultAccountId(cfg: { channels?: Record<string, unknown> }): string | undefined {
    const zulip = getZulipConfig(cfg);
    return zulip?.accounts ? Object.keys(zulip.accounts)[0] : undefined;
  },
};
