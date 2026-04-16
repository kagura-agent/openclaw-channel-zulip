/**
 * Zulip account configuration resolved from OpenClaw config.
 */
export interface ZulipAccount {
  /** Account identifier (key in config YAML) */
  accountId: string;
  /** Zulip server URL, e.g. "http://localhost:8443" */
  url: string;
  /** Bot email address */
  botEmail: string;
  /** Bot API key */
  apiKey: string;
}

/**
 * Shape of channels.zulip in OpenClaw config YAML.
 */
export interface ZulipChannelConfig {
  accounts: Record<string, {
    url: string;
    botEmail: string;
    apiKey: string;
  }>;
}
