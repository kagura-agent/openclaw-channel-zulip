/**
 * OpenClaw Channel Plugin entry point for Zulip.
 *
 * This is the file OpenClaw's module-loader will import.
 * Uses defineChannelPluginEntry() from the Plugin SDK.
 *
 * TODO: Uncomment and implement once gateway/outbound adapters are ready.
 * For now this is a skeleton that shows the intended structure.
 */

// import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
// import { zulipPlugin } from "./plugin.js";

// export default defineChannelPluginEntry({
//   id: "zulip",
//   name: "Zulip",
//   description: "Zulip chat platform integration for OpenClaw",
//   plugin: zulipPlugin,
// });

// Skeleton export so TypeScript doesn't complain about empty module
export const PLUGIN_ID = "zulip" as const;
