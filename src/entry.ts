/**
 * Plugin entry point for OpenClaw channel plugin system.
 *
 * When OpenClaw's plugin-sdk is available, this would use:
 *   import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
 *
 * For now, export the plugin factory directly.
 */

import { createZulipPlugin } from "./plugin.js";

const zulipPlugin = createZulipPlugin();

export default zulipPlugin;

// Also export for programmatic use
export { createZulipPlugin } from "./plugin.js";
export { ZulipClient } from "./zulip-api.js";
export type { ZulipAccount, ZulipChannelConfig } from "./types.js";
export { parseTarget, buildTarget, parseTopicStatus, setTopicStatus } from "./threading.js";
