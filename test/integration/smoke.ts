/**
 * Smoke test: end-to-end Zulip API integration.
 *
 * Requires env vars: ZULIP_URL, ZULIP_BOT_EMAIL, ZULIP_API_KEY
 * Optional: ZULIP_TEST_STREAM (default: "general"), ZULIP_TEST_TOPIC (default: "adapter-test")
 *
 * Usage: npx tsx test/integration/smoke.ts
 */

import { ZulipClient } from "../../src/zulip-api.js";

const url = process.env.ZULIP_URL;
const email = process.env.ZULIP_BOT_EMAIL;
const apiKey = process.env.ZULIP_API_KEY;

if (!url || !email || !apiKey) {
  console.error("Missing env: ZULIP_URL, ZULIP_BOT_EMAIL, ZULIP_API_KEY");
  process.exit(1);
}

const stream = process.env.ZULIP_TEST_STREAM ?? "general";
const topic = process.env.ZULIP_TEST_TOPIC ?? "adapter-test";

const client = new ZulipClient(url, email, apiKey);

async function run() {
  const checks: Array<{ name: string; fn: () => Promise<void> }> = [
    {
      name: "Send stream message",
      fn: async () => {
        const ts = new Date().toISOString();
        const res = await client.sendMessage({
          type: "stream",
          to: stream,
          topic,
          content: `🔧 Smoke test at ${ts}`,
        });
        console.log(`  → message id: ${(res as { id: number }).id}`);
      },
    },
    {
      name: "Get messages",
      fn: async () => {
        const res = await client.getMessages({
          anchor: "newest",
          numBefore: 5,
          numAfter: 0,
          narrow: [
            { operator: "stream", operand: stream },
            { operator: "topic", operand: topic },
          ],
        });
        console.log(`  → got ${(res as { messages: unknown[] }).messages.length} messages`);
      },
    },
    {
      name: "Register event queue",
      fn: async () => {
        const reg = await client.registerQueue({ eventTypes: ["message"] });
        const queueId = (reg as { queue_id: string }).queue_id;
        console.log(`  → queue: ${queueId}`);
        await client.deleteQueue(queueId);
        console.log(`  → queue deleted`);
      },
    },
    {
      name: "Add reaction",
      fn: async () => {
        // Send a message first, then react to it
        const msg = await client.sendMessage({
          type: "stream",
          to: stream,
          topic,
          content: "React test 🎯",
        });
        await client.addReaction((msg as { id: number }).id, "thumbs_up");
        console.log(`  → reacted to ${(msg as { id: number }).id}`);
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      console.log(`[TEST] ${check.name}`);
      await check.fn();
      console.log(`  ✅ PASS`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${err}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${checks.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
