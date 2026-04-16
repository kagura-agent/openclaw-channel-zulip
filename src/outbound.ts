/**
 * Zulip outbound adapter for OpenClaw ChannelPlugin.
 *
 * Handles sending messages and media to Zulip via the REST API.
 */

import { ZulipClient } from "./zulip-api.js";
import { parseTarget } from "./threading.js";
import type { ZulipAccount } from "./types.js";

// Minimal type stubs for OpenClaw outbound adapter interface.
// These mirror the real types but avoid importing from openclaw internals.

interface OutboundDeliveryResult {
  ok: boolean;
  messageId?: string | number;
  error?: string;
}

interface OutboundContext {
  cfg: unknown;
  to: string;
  text: string;
  mediaUrl?: string;
  replyToId?: string | null;
  threadId?: string | number | null;
  accountId?: string | null;
  identity?: unknown;
  deps?: unknown;
}

export interface ZulipOutboundAdapter {
  deliveryMode: "gateway";
  textChunkLimit: number;
  sendText: (ctx: OutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia: (ctx: OutboundContext & { mediaUrl: string }) => Promise<OutboundDeliveryResult>;
}

function resolveClient(account: ZulipAccount): ZulipClient {
  return new ZulipClient(account.url, account.botEmail, account.apiKey);
}

export function createOutboundAdapter(resolveAccount: (accountId?: string | null) => ZulipAccount): ZulipOutboundAdapter {
  return {
    deliveryMode: "gateway",
    textChunkLimit: 10000, // Zulip supports long messages

    async sendText(ctx: OutboundContext): Promise<OutboundDeliveryResult> {
      try {
        const account = resolveAccount(ctx.accountId);
        const client = resolveClient(account);
        const target = parseTarget(ctx.to);

        let result: { id: number };
        if (target.type === "direct") {
          result = await client.sendMessage({
            type: "direct",
            to: [target.email],
            content: ctx.text,
          });
        } else {
          result = await client.sendMessage({
            type: "stream",
            to: target.stream,
            topic: target.topic,
            content: ctx.text,
          });
        }
        return { ok: true, messageId: result.id };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    async sendMedia(ctx: OutboundContext & { mediaUrl: string }): Promise<OutboundDeliveryResult> {
      try {
        const account = resolveAccount(ctx.accountId);
        const client = resolveClient(account);

        // Upload file first, then send as markdown link
        const { uri } = await client.uploadFile(ctx.mediaUrl);
        const content = ctx.text
          ? `${ctx.text}\n\n[${ctx.mediaUrl.split("/").pop()}](${uri})`
          : `[${ctx.mediaUrl.split("/").pop()}](${uri})`;

        const target = parseTarget(ctx.to);
        let result: { id: number };
        if (target.type === "direct") {
          result = await client.sendMessage({
            type: "direct",
            to: [target.email],
            content,
          });
        } else {
          result = await client.sendMessage({
            type: "stream",
            to: target.stream,
            topic: target.topic,
            content,
          });
        }
        return { ok: true, messageId: result.id };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  };
}
