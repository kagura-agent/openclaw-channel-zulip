/**
 * Zulip REST API client.
 * Standalone — no OpenClaw dependencies.
 */
export class ZulipClient {
  private baseUrl: string;
  private email: string;
  private apiKey: string;

  constructor(url: string, email: string, apiKey: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.email = email;
    this.apiKey = apiKey;
  }

  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.email}:${this.apiKey}`).toString("base64");
  }

  private async request(method: string, path: string, params?: Record<string, unknown>): Promise<unknown> {
    const url = new URL(`/api/v1${path}`, this.baseUrl);
    const headers: Record<string, string> = {
      Authorization: this.authHeader(),
    };

    let body: string | undefined;
    if (method === "GET" && params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
      }
    } else if (params) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
        )
      ).toString();
    }

    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zulip API ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json();
  }

  // --- Messages ---

  async sendMessage(params: {
    type: "stream" | "direct";
    to: string | number[];
    topic?: string;
    content: string;
  }): Promise<{ id: number }> {
    return this.request("POST", "/messages", {
      type: params.type,
      to: params.to,
      topic: params.topic,
      content: params.content,
    }) as Promise<{ id: number }>;
  }

  async editMessage(messageId: number, params: { content?: string; topic?: string }): Promise<void> {
    await this.request("PATCH", `/messages/${messageId}`, params);
  }

  async addReaction(messageId: number, emojiName: string): Promise<void> {
    await this.request("POST", `/messages/${messageId}/reactions`, { emoji_name: emojiName });
  }

  async getMessages(params: {
    anchor: string | number;
    numBefore: number;
    numAfter: number;
    narrow?: unknown[];
  }): Promise<{ messages: unknown[] }> {
    return this.request("GET", "/messages", {
      anchor: String(params.anchor),
      num_before: params.numBefore,
      num_after: params.numAfter,
      narrow: params.narrow,
    }) as Promise<{ messages: unknown[] }>;
  }

  // --- File upload ---

  async uploadFile(filePath: string): Promise<{ uri: string }> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer]), fileName);

    const res = await fetch(`${this.baseUrl}/api/v1/user_uploads`, {
      method: "POST",
      headers: { Authorization: this.authHeader() },
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json() as Promise<{ uri: string }>;
  }

  // --- Event queue (long-polling) ---

  async registerQueue(params: {
    eventTypes: string[];
    allPublicStreams?: boolean;
  }): Promise<{ queue_id: string; last_event_id: number }> {
    return this.request("POST", "/register", {
      event_types: params.eventTypes,
      all_public_streams: params.allPublicStreams,
    }) as Promise<{ queue_id: string; last_event_id: number }>;
  }

  async getEvents(queueId: string, lastEventId: number): Promise<{ events: unknown[] }> {
    return this.request("GET", "/events", {
      queue_id: queueId,
      last_event_id: lastEventId,
    }) as Promise<{ events: unknown[] }>;
  }

  async deleteQueue(queueId: string): Promise<void> {
    await this.request("DELETE", "/events", { queue_id: queueId });
  }
}
