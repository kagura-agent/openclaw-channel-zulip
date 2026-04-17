/**
 * Smoke test: end-to-end Zulip API integration.
 *
 * Covers E2E test plan TC-1 through TC-8 (excluding TC-9 cron/heartbeat).
 *
 * Requires env vars: ZULIP_URL, ZULIP_BOT_EMAIL, ZULIP_API_KEY
 * Optional: ZULIP_TEST_STREAM (default: "general"), ZULIP_TEST_TOPIC (default: "adapter-test")
 *
 * Usage: npx tsx test/integration/smoke.ts
 */

import { ZulipClient } from "../../src/zulip-api.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const url = process.env.ZULIP_URL;
const email = process.env.ZULIP_BOT_EMAIL;
const apiKey = process.env.ZULIP_API_KEY;

if (!url || !email || !apiKey) {
  console.error("Missing env: ZULIP_URL, ZULIP_BOT_EMAIL, ZULIP_API_KEY");
  process.exit(1);
}

const stream = process.env.ZULIP_TEST_STREAM ?? "general";
const topic = process.env.ZULIP_TEST_TOPIC ?? `adapter-test-${Date.now()}`;

const client = new ZulipClient(url, email, apiKey);

async function run() {
  const checks: Array<{ name: string; tc: string; fn: () => Promise<void> }> = [
    // TC-1: Bot authentication & identity
    {
      name: "Bot authentication (getOwnUser)",
      tc: "TC-1",
      fn: async () => {
        const user = await client.getOwnUser();
        if (!user.user_id || !user.email) throw new Error("Missing user_id or email");
        console.log(`  → user_id: ${user.user_id}, email: ${user.email}, name: ${user.full_name}`);
      },
    },

    // TC-2: Send messages
    {
      name: "Send stream message",
      tc: "TC-2",
      fn: async () => {
        const ts = new Date().toISOString();
        const res = await client.sendMessage({
          type: "stream",
          to: stream,
          topic,
          content: `🔧 Smoke test at ${ts}`,
        });
        console.log(`  → message id: ${res.id}`);
      },
    },
    {
      name: "Send markdown message",
      tc: "TC-2",
      fn: async () => {
        const res = await client.sendMessage({
          type: "stream",
          to: stream,
          topic,
          content: "**bold** `code` [link](https://example.com)\n```js\nconsole.log('hi');\n```",
        });
        console.log(`  → markdown message id: ${res.id}`);
      },
    },
    {
      name: "Send long message (>2000 chars)",
      tc: "TC-2",
      fn: async () => {
        const content = "A".repeat(2500) + " — end of long message";
        const res = await client.sendMessage({
          type: "stream",
          to: stream,
          topic,
          content,
        });
        console.log(`  → long message id: ${res.id}, length: ${content.length}`);
      },
    },

    // TC-3: Receive messages
    {
      name: "Get messages from topic",
      tc: "TC-3",
      fn: async () => {
        const res = await client.getMessages({
          anchor: "newest",
          numBefore: 10,
          numAfter: 0,
          narrow: [
            { operator: "stream", operand: stream },
            { operator: "topic", operand: topic },
          ],
        });
        if (res.messages.length === 0) throw new Error("No messages found");
        console.log(`  → got ${res.messages.length} messages`);
      },
    },

    // TC-4: Topic routing — stream/topic listing
    {
      name: "List streams",
      tc: "TC-4",
      fn: async () => {
        const res = await client.getStreams();
        if (res.streams.length === 0) throw new Error("No streams found");
        console.log(`  → ${res.streams.length} streams: ${res.streams.map(s => s.name).join(", ")}`);
      },
    },
    {
      name: "Get stream ID by name",
      tc: "TC-4",
      fn: async () => {
        const id = await client.getStreamId(stream);
        if (typeof id !== "number") throw new Error(`Expected number, got ${typeof id}`);
        console.log(`  → stream "${stream}" id: ${id}`);
      },
    },
    {
      name: "List topics in stream",
      tc: "TC-4",
      fn: async () => {
        const streamId = await client.getStreamId(stream);
        const res = await client.getStreamTopics(streamId);
        if (res.topics.length === 0) throw new Error("No topics found");
        const ourTopic = res.topics.find(t => t.name === topic);
        console.log(`  → ${res.topics.length} topics, our topic found: ${!!ourTopic}`);
      },
    },

    // TC-5: Topic rename (status flow)
    {
      name: "Rename topic (status prefix)",
      tc: "TC-5",
      fn: async () => {
        // Send a message to a sub-topic, then rename it
        const subTopic = `${topic}/rename-test`;
        const msg = await client.sendMessage({
          type: "stream",
          to: stream,
          topic: subTopic,
          content: "Testing topic rename",
        });
        const newName = `🔴 ${subTopic}`;
        await client.renameTopic(msg.id, newName);
        console.log(`  → renamed to "${newName}"`);
        // Rename back to clean up
        await client.renameTopic(msg.id, `✔ ${subTopic}`);
        console.log(`  → resolved to "✔ ${subTopic}"`);
      },
    },

    // TC-6: File upload
    {
      name: "Upload file",
      tc: "TC-6",
      fn: async () => {
        const tmpFile = join(tmpdir(), `zulip-smoke-${Date.now()}.txt`);
        writeFileSync(tmpFile, "Smoke test file content\n".repeat(10));
        try {
          const res = await client.uploadFile(tmpFile);
          if (!res.uri) throw new Error("No URI returned");
          console.log(`  → uploaded: ${res.uri}`);
          // Send message with the uploaded file
          await client.sendMessage({
            type: "stream",
            to: stream,
            topic,
            content: `File upload test: [test file](${res.uri})`,
          });
          console.log(`  → sent message with file link`);
        } finally {
          try { unlinkSync(tmpFile); } catch { /* ignore */ }
        }
      },
    },

    // TC-7: Emoji reactions
    {
      name: "Add and remove reaction",
      tc: "TC-7",
      fn: async () => {
        const msg = await client.sendMessage({
          type: "stream",
          to: stream,
          topic,
          content: "Reaction test 🎯",
        });
        await client.addReaction(msg.id, "thumbs_up");
        console.log(`  → added 👍 to ${msg.id}`);
        await client.removeReaction(msg.id, "thumbs_up");
        console.log(`  → removed 👍 from ${msg.id}`);
      },
    },

    // TC-8: Event queue (register + poll + delete)
    {
      name: "Event queue lifecycle",
      tc: "TC-8",
      fn: async () => {
        const reg = await client.registerQueue({ eventTypes: ["message"] });
        if (!reg.queue_id) throw new Error("No queue_id");
        console.log(`  → registered queue: ${reg.queue_id}`);
        // Send a message to generate an event
        await client.sendMessage({
          type: "stream",
          to: stream,
          topic,
          content: "Event queue test",
        });
        // Poll for events
        const events = await client.getEvents(reg.queue_id, reg.last_event_id);
        console.log(`  → polled ${events.events.length} events`);
        await client.deleteQueue(reg.queue_id);
        console.log(`  → queue deleted`);
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      console.log(`[${check.tc}] ${check.name}`);
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
