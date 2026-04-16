/**
 * Zulip target parsing and topic mapping utilities.
 *
 * Target format conventions:
 * - Stream message: "stream:<streamName>:<topicName>"
 * - Direct message: "user:<email>"
 *
 * Topic status emoji convention:
 * - 🔴 active task
 * - ✅ completed
 * - ⏸ paused
 */

export type StreamTarget = { type: "stream"; stream: string; topic: string };
export type DirectTarget = { type: "direct"; email: string };
export type ParsedTarget = StreamTarget | DirectTarget;

const STATUS_PREFIXES = ["🔴", "✅", "⏸"] as const;
export type TopicStatus = (typeof STATUS_PREFIXES)[number];

/**
 * Parse a target string into structured form.
 */
export function parseTarget(target: string): ParsedTarget {
  if (target.startsWith("user:")) {
    const email = target.slice(5);
    if (!email) throw new Error(`Invalid direct target: "${target}"`);
    return { type: "direct", email };
  }
  if (target.startsWith("stream:")) {
    const rest = target.slice(7);
    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) throw new Error(`Invalid stream target (missing topic): "${target}"`);
    const stream = rest.slice(0, colonIdx);
    const topic = rest.slice(colonIdx + 1);
    if (!stream || !topic) throw new Error(`Invalid stream target: "${target}"`);
    return { type: "stream", stream, topic };
  }
  throw new Error(`Unknown target format: "${target}"`);
}

/**
 * Build a target string from structured params.
 */
export function buildTarget(params: { type: "stream"; stream: string; topic: string }): string;
export function buildTarget(params: { type: "direct"; email: string }): string;
export function buildTarget(params: ParsedTarget): string {
  if (params.type === "direct") return `user:${params.email}`;
  return `stream:${params.stream}:${params.topic}`;
}

/**
 * Extract status emoji prefix from a topic name, if present.
 */
export function parseTopicStatus(topic: string): { status: TopicStatus | null; bare: string } {
  for (const prefix of STATUS_PREFIXES) {
    if (topic.startsWith(prefix)) {
      return { status: prefix, bare: topic.slice(prefix.length).trimStart() };
    }
  }
  return { status: null, bare: topic };
}

/**
 * Add or replace status emoji prefix on a topic name.
 */
export function setTopicStatus(topic: string, status: TopicStatus): string {
  const { bare } = parseTopicStatus(topic);
  return `${status} ${bare}`;
}
