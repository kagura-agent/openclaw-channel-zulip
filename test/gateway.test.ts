import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGatewayAdapter } from "../src/gateway.js";

// Mock ZulipClient
const mockRegisterQueue = vi.fn();
const mockGetEvents = vi.fn();
const mockDeleteQueue = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("../src/zulip-api.js", () => {
  return {
    ZulipClient: class MockZulipClient {
      constructor() {}
      registerQueue = mockRegisterQueue;
      getEvents = mockGetEvents;
      deleteQueue = mockDeleteQueue;
      sendMessage = mockSendMessage;
    },
  };
});

function makeCtx(overrides: Record<string, unknown> = {}) {
  const abortController = new AbortController();
  return {
    cfg: {},
    accountId: "test-account",
    account: {
      accountId: "test-account",
      url: "http://localhost:8443",
      botEmail: "bot@test.com",
      apiKey: "test-key",
    },
    abortSignal: abortController.signal,
    abortController,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    getStatus: vi.fn(),
    setStatus: vi.fn(),
    channelRuntime: undefined as unknown,
    ...overrides,
  };
}

describe("GatewayAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers event queue on start", async () => {
    mockRegisterQueue.mockResolvedValueOnce({ queue_id: "q1", last_event_id: -1 });
    // getEvents will block until abort — simulate by rejecting after short delay
    mockGetEvents.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("aborted")), 50))
    );

    const adapter = createGatewayAdapter();
    const ctx = makeCtx();

    // Start and let it run briefly
    await adapter.startAccount(ctx as any);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockRegisterQueue).toHaveBeenCalledWith({
      eventTypes: ["message"],
      allPublicStreams: true,
    });
    expect(ctx.setStatus).toHaveBeenCalledWith({
      accountId: "test-account",
      connected: true,
      running: true,
    });

    // Cleanup
    ctx.abortController.abort();
  });

  it("skips messages from self (bot email)", async () => {
    mockRegisterQueue.mockResolvedValueOnce({ queue_id: "q1", last_event_id: -1 });

    let callCount = 0;
    mockGetEvents.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          events: [
            {
              type: "message",
              id: 0,
              message: {
                id: 100,
                sender_id: 1,
                sender_email: "bot@test.com", // self
                sender_full_name: "Bot",
                type: "stream",
                display_recipient: "general",
                subject: "test",
                content: "hello",
                timestamp: 1000,
              },
            },
          ],
        });
      }
      // Block on subsequent calls
      return new Promise(() => {});
    });

    const dispatchMock = vi.fn();
    const ctx = makeCtx({
      channelRuntime: {
        reply: { dispatchReplyWithBufferedBlockDispatcher: dispatchMock },
      },
    });

    const adapter = createGatewayAdapter();
    await adapter.startAccount(ctx as any);
    await new Promise((r) => setTimeout(r, 50));

    // Self-message should be skipped — no dispatch
    expect(dispatchMock).not.toHaveBeenCalled();

    ctx.abortController.abort();
  });

  it("dispatches stream messages with correct target", async () => {
    mockRegisterQueue.mockResolvedValueOnce({ queue_id: "q1", last_event_id: -1 });

    let callCount = 0;
    mockGetEvents.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          events: [
            {
              type: "message",
              id: 0,
              message: {
                id: 200,
                sender_id: 10,
                sender_email: "user@test.com",
                sender_full_name: "User",
                type: "stream",
                display_recipient: "general",
                subject: "greetings",
                content: "hi there",
                timestamp: 2000,
              },
            },
          ],
        });
      }
      return new Promise(() => {});
    });

    const dispatchMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      channelRuntime: {
        reply: { dispatchReplyWithBufferedBlockDispatcher: dispatchMock },
      },
    });

    const adapter = createGatewayAdapter();
    await adapter.startAccount(ctx as any);
    await new Promise((r) => setTimeout(r, 50));

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const dispatchArg = dispatchMock.mock.calls[0][0];
    expect(dispatchArg.ctx.channel).toBe("zulip");
    expect(dispatchArg.ctx.to).toBe("stream:general:greetings");
    expect(dispatchArg.ctx.from).toBe("user@test.com");
    expect(dispatchArg.ctx.text).toBe("hi there");
    expect(dispatchArg.ctx.threadId).toBe("greetings");

    ctx.abortController.abort();
  });

  it("dispatches DM messages with user: target", async () => {
    mockRegisterQueue.mockResolvedValueOnce({ queue_id: "q1", last_event_id: -1 });

    let callCount = 0;
    mockGetEvents.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          events: [
            {
              type: "message",
              id: 0,
              message: {
                id: 300,
                sender_id: 20,
                sender_email: "luna@test.com",
                sender_full_name: "Luna",
                type: "private",
                display_recipient: [{ email: "luna@test.com" }, { email: "bot@test.com" }],
                subject: "",
                content: "secret message",
                timestamp: 3000,
              },
            },
          ],
        });
      }
      return new Promise(() => {});
    });

    const dispatchMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      channelRuntime: {
        reply: { dispatchReplyWithBufferedBlockDispatcher: dispatchMock },
      },
    });

    const adapter = createGatewayAdapter();
    await adapter.startAccount(ctx as any);
    await new Promise((r) => setTimeout(r, 50));

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const dispatchArg = dispatchMock.mock.calls[0][0];
    expect(dispatchArg.ctx.to).toBe("user:luna@test.com");
    expect(dispatchArg.ctx.threadId).toBeUndefined();

    ctx.abortController.abort();
  });

  it("DM deliver callback uses sender_id (not email) in to array", async () => {
    mockRegisterQueue.mockResolvedValueOnce({ queue_id: "q1", last_event_id: -1 });

    let callCount = 0;
    mockGetEvents.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          events: [
            {
              type: "message",
              id: 0,
              message: {
                id: 400,
                sender_id: 42,
                sender_email: "luna@test.com",
                sender_full_name: "Luna",
                type: "private",
                display_recipient: [{ email: "luna@test.com", id: 42 }, { email: "bot@test.com", id: 1 }],
                subject: "",
                content: "test dm",
                timestamp: 4000,
              },
            },
          ],
        });
      }
      return new Promise(() => {});
    });

    const dispatchMock = vi.fn().mockImplementation(async (params: any) => {
      // Simulate the AI reply by calling deliver
      await params.dispatcherOptions.deliver({ text: "reply" });
    });
    const ctx = makeCtx({
      channelRuntime: {
        reply: { dispatchReplyWithBufferedBlockDispatcher: dispatchMock },
      },
    });

    const adapter = createGatewayAdapter();
    await adapter.startAccount(ctx as any);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "direct",
      to: [42],  // user ID, not email string
      content: "reply",
    });

    ctx.abortController.abort();
  });

  it("stopAccount deletes queue and sets disconnected", async () => {
    mockRegisterQueue.mockResolvedValueOnce({ queue_id: "q1", last_event_id: -1 });
    mockGetEvents.mockImplementation(() => new Promise(() => {})); // block
    mockDeleteQueue.mockResolvedValueOnce(undefined);

    const ctx = makeCtx();
    const adapter = createGatewayAdapter();

    await adapter.startAccount(ctx as any);
    await new Promise((r) => setTimeout(r, 20));

    await adapter.stopAccount(ctx as any);

    expect(ctx.setStatus).toHaveBeenCalledWith({
      accountId: "test-account",
      connected: false,
      running: false,
    });
  });

  it("ignores non-message events", async () => {
    mockRegisterQueue.mockResolvedValueOnce({ queue_id: "q1", last_event_id: -1 });

    let callCount = 0;
    mockGetEvents.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          events: [
            { type: "heartbeat", id: 0 },
            { type: "subscription", id: 1 },
          ],
        });
      }
      return new Promise(() => {});
    });

    const dispatchMock = vi.fn();
    const ctx = makeCtx({
      channelRuntime: {
        reply: { dispatchReplyWithBufferedBlockDispatcher: dispatchMock },
      },
    });

    const adapter = createGatewayAdapter();
    await adapter.startAccount(ctx as any);
    await new Promise((r) => setTimeout(r, 50));

    expect(dispatchMock).not.toHaveBeenCalled();
    ctx.abortController.abort();
  });

  it("re-registers queue on BAD_EVENT_QUEUE_ID error", async () => {
    mockRegisterQueue
      .mockResolvedValueOnce({ queue_id: "q1", last_event_id: -1 })
      .mockResolvedValueOnce({ queue_id: "q2", last_event_id: -1 });

    let callCount = 0;
    mockGetEvents.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("BAD_EVENT_QUEUE_ID: queue does not exist"));
      }
      return new Promise(() => {}); // block
    });

    const ctx = makeCtx();
    const adapter = createGatewayAdapter();
    await adapter.startAccount(ctx as any);

    // Wait for re-registration (includes BAD_QUEUE_RETRY_DELAY_MS = 1000ms)
    await new Promise((r) => setTimeout(r, 1500));

    expect(mockRegisterQueue).toHaveBeenCalledTimes(2);
    expect(ctx.log.warn).toHaveBeenCalledWith(expect.stringContaining("Queue expired"));

    ctx.abortController.abort();
  });
});
