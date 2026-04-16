import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { createOutboundAdapter } from "../src/outbound.js";
import type { ZulipAccount } from "../src/types.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const TEST_FILE = join(import.meta.dirname ?? ".", "_test_media_file.txt");
writeFileSync(TEST_FILE, "test content");
afterAll(() => { try { unlinkSync(TEST_FILE); } catch {} });

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const testAccount: ZulipAccount = {
  accountId: "test",
  url: "http://localhost:8443",
  botEmail: "bot@test.com",
  apiKey: "test-key",
};

describe("OutboundAdapter", () => {
  const adapter = createOutboundAdapter(() => testAccount);

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has gateway delivery mode", () => {
    expect(adapter.deliveryMode).toBe("gateway");
  });

  it("has generous text chunk limit", () => {
    expect(adapter.textChunkLimit).toBeGreaterThanOrEqual(10000);
  });

  describe("sendText", () => {
    it("sends to stream target", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));
      const result = await adapter.sendText({
        cfg: {},
        to: "stream:general:hello",
        text: "hi",
      });
      expect(result).toEqual({ ok: true, messageId: 1 });
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/v1/messages");
      expect(init.method).toBe("POST");
    });

    it("sends to direct target", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 2 }));
      const result = await adapter.sendText({
        cfg: {},
        to: "user:luna@example.com",
        text: "hey",
      });
      expect(result).toEqual({ ok: true, messageId: 2 });
    });

    it("returns error on failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network fail"));
      const result = await adapter.sendText({
        cfg: {},
        to: "stream:general:test",
        text: "fail",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("network fail");
    });
  });

  describe("sendMedia", () => {
    it("uploads file then sends message with link", async () => {
      // First call: upload
      mockFetch.mockResolvedValueOnce(jsonResponse({ uri: "/user_uploads/1/image.png" }));
      // Second call: send message
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));

      const result = await adapter.sendMedia({
        cfg: {},
        to: "stream:general:media test",
        text: "check this out",
        mediaUrl: TEST_FILE,
      });

      expect(result).toEqual({ ok: true, messageId: 10 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Verify upload was called first
      const [uploadUrl] = mockFetch.mock.calls[0];
      expect(uploadUrl).toContain("/api/v1/user_uploads");
    });

    it("sends media to direct target", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ uri: "/user_uploads/2/file.pdf" }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 11 }));

      const result = await adapter.sendMedia({
        cfg: {},
        to: "user:luna@example.com",
        text: "",
        mediaUrl: TEST_FILE,
      });

      expect(result).toEqual({ ok: true, messageId: 11 });
    });

    it("returns error on upload failure", async () => {
      // uploadFile reads the file from disk before fetch, so a missing file triggers ENOENT
      const result = await adapter.sendMedia({
        cfg: {},
        to: "stream:general:test",
        text: "oops",
        mediaUrl: "/tmp/nonexistent-test-file-12345.png",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("account resolution", () => {
    it("uses provided accountId", async () => {
      const resolveAccount = vi.fn().mockReturnValue(testAccount);
      const adapterWithMock = createOutboundAdapter(resolveAccount);
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

      await adapterWithMock.sendText({
        cfg: {},
        to: "stream:general:test",
        text: "hi",
        accountId: "custom",
      });

      expect(resolveAccount).toHaveBeenCalledWith("custom");
    });
  });
});
