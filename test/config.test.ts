import { describe, it, expect } from "vitest";
import { configAdapter } from "../src/config.js";

const sampleCfg = {
  channels: {
    zulip: {
      accounts: {
        kagura: {
          url: "http://localhost:8443",
          botEmail: "kagura-bot@localhost",
          apiKey: "key-kagura",
        },
        luna: {
          url: "http://localhost:8443",
          botEmail: "luna-bot@localhost",
          apiKey: "key-luna",
        },
      },
    },
  },
};

describe("configAdapter", () => {
  describe("listAccountIds", () => {
    it("returns all account IDs", () => {
      expect(configAdapter.listAccountIds(sampleCfg)).toEqual(["kagura", "luna"]);
    });

    it("returns empty array when no zulip config", () => {
      expect(configAdapter.listAccountIds({})).toEqual([]);
    });

    it("returns empty array when no accounts", () => {
      expect(configAdapter.listAccountIds({ channels: { zulip: {} } })).toEqual([]);
    });
  });

  describe("resolveAccount", () => {
    it("resolves named account", () => {
      const acc = configAdapter.resolveAccount(sampleCfg, "luna");
      expect(acc).toEqual({
        accountId: "luna",
        url: "http://localhost:8443",
        botEmail: "luna-bot@localhost",
        apiKey: "key-luna",
      });
    });

    it("defaults to first account when no ID given", () => {
      const acc = configAdapter.resolveAccount(sampleCfg);
      expect(acc.accountId).toBe("kagura");
    });

    it("throws when no zulip accounts configured", () => {
      expect(() => configAdapter.resolveAccount({})).toThrow("No Zulip accounts configured");
    });

    it("throws when named account not found", () => {
      expect(() => configAdapter.resolveAccount(sampleCfg, "unknown")).toThrow(
        'Zulip account "unknown" not found'
      );
    });
  });

  describe("defaultAccountId", () => {
    it("returns first account ID", () => {
      expect(configAdapter.defaultAccountId(sampleCfg)).toBe("kagura");
    });

    it("returns undefined when no config", () => {
      expect(configAdapter.defaultAccountId({})).toBeUndefined();
    });
  });
});
