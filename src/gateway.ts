/**
 * Zulip gateway adapter for OpenClaw ChannelPlugin.
 *
 * Handles receiving messages from Zulip via long-polling event queue.
 */

import { ZulipClient } from "./zulip-api.js";
import { buildTarget } from "./threading.js";
import type { ZulipAccount } from "./types.js";

// Minimal type stubs — mirrors OpenClaw gateway context shape
interface GatewayContext {
  cfg: unknown;
  accountId: string;
  account: ZulipAccount;
  abortSignal: AbortSignal;
  log?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
  getStatus: () => unknown;
  setStatus: (next: { accountId: string; connected: boolean; running: boolean }) => void;
  channelRuntime?: {
    reply: {
      dispatchReplyWithBufferedBlockDispatcher: (params: unknown) => Promise<void>;
    };
  };
}

interface ZulipEvent {
  type: string;
  id: number;
  message?: {
    id: number;
    sender_email: string;
    sender_full_name: string;
    type: "stream" | "private";
    display_recipient: string | Array<{ email: string }>;
    subject: string;
    content: string;
    timestamp: number;
  };
}

const POLL_RETRY_DELAY_MS = 3000;
const BAD_QUEUE_RETRY_DELAY_MS = 1000;

export interface ZulipGatewayAdapter {
  startAccount: (ctx: GatewayContext) => Promise<void>;
  stopAccount: (ctx: GatewayContext) => Promise<void>;
}

// Track active queues for cleanup
const activeQueues = new Map<string, { client: ZulipClient; queueId: string }>();

export function createGatewayAdapter(): ZulipGatewayAdapter {
  return {
    async startAccount(ctx: GatewayContext): Promise<void> {
      const { account, abortSignal, log } = ctx;
      const client = new ZulipClient(account.url, account.botEmail, account.apiKey);

      log?.info?.(`[zulip] Starting gateway for ${account.accountId}`);

      const pollLoop = async () => {
        let queueId: string | null = null;
        let lastEventId = -1;

        const registerQueue = async () => {
          const reg = await client.registerQueue({
            eventTypes: ["message"],
            allPublicStreams: true,
          });
          queueId = (reg as { queue_id: string; last_event_id: number }).queue_id;
          lastEventId = (reg as { queue_id: string; last_event_id: number }).last_event_id;
          activeQueues.set(account.accountId, { client, queueId });
          ctx.setStatus({ accountId: account.accountId, connected: true, running: true });
          log?.info?.(`[zulip] Event queue registered: ${queueId}`);
        };

        await registerQueue();

        while (!abortSignal.aborted) {
          try {
            const response = await client.getEvents(queueId!, lastEventId);
            const events = (response as { events: ZulipEvent[] }).events;

            for (const event of events) {
              lastEventId = event.id;

              if (event.type !== "message" || !event.message) continue;
              if (event.message.sender_email === account.botEmail) continue; // skip self

              const msg = event.message;

              // Build target string
              let target: string;
              if (msg.type === "private") {
                target = buildTarget({ type: "direct", email: msg.sender_email });
              } else {
                const stream = typeof msg.display_recipient === "string"
                  ? msg.display_recipient
                  : "unknown";
                target = buildTarget({ type: "stream", stream, topic: msg.subject });
              }

              log?.info?.(`[zulip] Message from ${msg.sender_email} in ${target}`);

              // Dispatch to AI via channelRuntime if available
              if (ctx.channelRuntime) {
                try {
                  await ctx.channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher({
                    ctx: {
                      channel: "zulip",
                      accountId: account.accountId,
                      from: msg.sender_email,
                      fromName: msg.sender_full_name,
                      to: target,
                      text: msg.content,
                      messageId: String(msg.id),
                      timestamp: msg.timestamp * 1000,
                      threadId: msg.type === "stream" ? msg.subject : undefined,
                    },
                    cfg: ctx.cfg,
                    dispatcherOptions: {
                      deliver: async (payload: { text: string }) => {
                        if (msg.type === "private") {
                          await client.sendMessage({
                            type: "direct",
                            to: [msg.sender_email],
                            content: payload.text,
                          });
                        } else {
                          const stream = typeof msg.display_recipient === "string"
                            ? msg.display_recipient
                            : "unknown";
                          await client.sendMessage({
                            type: "stream",
                            to: stream,
                            topic: msg.subject,
                            content: payload.text,
                          });
                        }
                      },
                    },
                  });
                } catch (err) {
                  log?.error?.(`[zulip] Dispatch error:`, err);
                }
              }
            }
          } catch (err: unknown) {
            const errStr = String(err);
            if (errStr.includes("BAD_EVENT_QUEUE_ID")) {
              log?.warn?.(`[zulip] Queue expired, re-registering...`);
              activeQueues.delete(account.accountId);
              await sleep(BAD_QUEUE_RETRY_DELAY_MS);
              await registerQueue();
            } else if (!abortSignal.aborted) {
              log?.error?.(`[zulip] Poll error:`, err);
              await sleep(POLL_RETRY_DELAY_MS);
            }
          }
        }
      };

      // Run poll loop (non-blocking — runs until abort)
      pollLoop().catch((err) => {
        if (!abortSignal.aborted) {
          log?.error?.(`[zulip] Gateway poll loop crashed:`, err);
        }
      });
    },

    async stopAccount(ctx: GatewayContext): Promise<void> {
      const entry = activeQueues.get(ctx.account.accountId);
      if (entry) {
        try {
          await entry.client.deleteQueue(entry.queueId);
        } catch {
          // Best effort
        }
        activeQueues.delete(ctx.account.accountId);
      }
      ctx.setStatus({ accountId: ctx.account.accountId, connected: false, running: false });
      ctx.log?.info?.(`[zulip] Gateway stopped for ${ctx.account.accountId}`);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
