import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZulipClient } from "../src/zulip-api.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ZulipClient", () => {
  let client: ZulipClient;

  beforeEach(() => {
    client = new ZulipClient("http://localhost:8443", "bot@test.com", "test-api-key");
    mockFetch.mockReset();
  });

  it("sends auth header", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, result: "success" }));
    await client.sendMessage({ type: "stream", to: "general", topic: "test", content: "hello" });

    const [, init] = mockFetch.mock.calls[0];
    const expected = "Basic " + Buffer.from("bot@test.com:test-api-key").toString("base64");
    expect(init.headers.Authorization).toBe(expected);
  });

  it("sendMessage posts to /messages", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 42 }));
    const result = await client.sendMessage({
      type: "stream",
      to: "general",
      topic: "greetings",
      content: "hi there",
    });

    expect(result).toEqual({ id: 42 });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/messages");
    expect(init.method).toBe("POST");
  });

  it("editMessage patches /messages/:id", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "success" }));
    await client.editMessage(42, { content: "edited" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/messages/42");
    expect(init.method).toBe("PATCH");
  });

  it("addReaction posts emoji", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "success" }));
    await client.addReaction(42, "thumbs_up");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/messages/42/reactions");
    expect(init.method).toBe("POST");
  });

  it("registerQueue posts to /register", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ queue_id: "q1", last_event_id: -1 }));
    const result = await client.registerQueue({ eventTypes: ["message"] });

    expect(result).toEqual({ queue_id: "q1", last_event_id: -1 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/register");
  });

  it("getEvents fetches from /events", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ events: [{ id: 0, type: "heartbeat" }] }));
    const result = await client.getEvents("q1", -1);

    expect(result).toEqual({ events: [{ id: 0, type: "heartbeat" }] });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/events");
    expect(url).toContain("queue_id");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(client.sendMessage({ type: "stream", to: "x", content: "y" })).rejects.toThrow("404");
  });

  it("getMessages fetches with narrow params", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ messages: [] }));
    await client.getMessages({ anchor: "newest", numBefore: 10, numAfter: 0 });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/messages");
    expect(url).toContain("anchor=newest");
  });
});
