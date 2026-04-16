import { describe, it, expect } from "vitest";
import { parseTarget, buildTarget, parseTopicStatus, setTopicStatus } from "../src/threading.js";

describe("parseTarget", () => {
  it("parses stream target", () => {
    expect(parseTarget("stream:general:hello world")).toEqual({
      type: "stream",
      stream: "general",
      topic: "hello world",
    });
  });

  it("parses stream target with colons in topic", () => {
    expect(parseTarget("stream:dev:fix: bug #42")).toEqual({
      type: "stream",
      stream: "dev",
      topic: "fix: bug #42",
    });
  });

  it("parses direct target", () => {
    expect(parseTarget("user:luna@example.com")).toEqual({
      type: "direct",
      email: "luna@example.com",
    });
  });

  it("throws on unknown format", () => {
    expect(() => parseTarget("channel:foo")).toThrow("Unknown target format");
  });

  it("throws on empty email", () => {
    expect(() => parseTarget("user:")).toThrow("Invalid direct target");
  });

  it("throws on missing topic", () => {
    expect(() => parseTarget("stream:general")).toThrow("missing topic");
  });

  it("throws on empty stream name", () => {
    expect(() => parseTarget("stream::topic")).toThrow("Invalid stream target");
  });
});

describe("buildTarget", () => {
  it("builds stream target", () => {
    expect(buildTarget({ type: "stream", stream: "general", topic: "hello" })).toBe(
      "stream:general:hello"
    );
  });

  it("builds direct target", () => {
    expect(buildTarget({ type: "direct", email: "luna@example.com" })).toBe(
      "user:luna@example.com"
    );
  });

  it("roundtrips stream target", () => {
    const target = "stream:dev:🔴 task in progress";
    expect(buildTarget(parseTarget(target) as { type: "stream"; stream: string; topic: string })).toBe(target);
  });
});

describe("parseTopicStatus", () => {
  it("detects active status", () => {
    expect(parseTopicStatus("🔴 deploy fix")).toEqual({ status: "🔴", bare: "deploy fix" });
  });

  it("detects done status", () => {
    expect(parseTopicStatus("✅ deploy fix")).toEqual({ status: "✅", bare: "deploy fix" });
  });

  it("detects paused status", () => {
    expect(parseTopicStatus("⏸ deploy fix")).toEqual({ status: "⏸", bare: "deploy fix" });
  });

  it("returns null for no status", () => {
    expect(parseTopicStatus("deploy fix")).toEqual({ status: null, bare: "deploy fix" });
  });
});

describe("setTopicStatus", () => {
  it("adds status to bare topic", () => {
    expect(setTopicStatus("deploy fix", "🔴")).toBe("🔴 deploy fix");
  });

  it("replaces existing status", () => {
    expect(setTopicStatus("🔴 deploy fix", "✅")).toBe("✅ deploy fix");
  });
});
