import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";

export interface BridgeClientInfo {
  name: string;
  blockbenchVersion?: string;
  pluginVersion?: string;
  project?: { name?: string; format?: string } | null;
  connectedAt: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

type IncomingMessage =
  | { type: "hello"; token?: string; client?: Omit<BridgeClientInfo, "connectedAt"> }
  | { type: "response"; id: string; result?: unknown; error?: { message?: string; stack?: string } }
  | { type: "event"; event: string; data?: unknown };

export class BlockbenchBridge {
  private server?: WebSocketServer;
  private socket?: WebSocket;
  private client?: BridgeClientInfo;
  private pending = new Map<string, PendingRequest>();

  constructor(
    readonly host: string,
    readonly port: number,
    private readonly token: string,
    private readonly requestTimeoutMs = 30_000,
  ) {}

  async start(): Promise<void> {
    if (this.server) return;
    await new Promise<void>((resolve, reject) => {
      const server = new WebSocketServer({ host: this.host, port: this.port });
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.once("listening", () => {
        server.off("error", onError);
        this.server = server;
        this.bindServer(server);
        resolve();
      });
    });
  }

  private bindServer(server: WebSocketServer): void {
    server.on("connection", (socket, request) => {
      const remote = request.socket.remoteAddress;
      if (remote && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) {
        socket.close(1008, "Local connections only");
        return;
      }
      let authenticated = false;
      const authTimer = setTimeout(() => socket.close(1008, "Handshake timeout"), 5_000);

      socket.on("message", (buffer) => {
        let message: IncomingMessage;
        try {
          message = JSON.parse(buffer.toString()) as IncomingMessage;
        } catch {
          socket.close(1003, "Invalid JSON");
          return;
        }

        if (!authenticated) {
          if (message.type !== "hello" || message.token !== this.token) {
            socket.close(1008, "Invalid bridge token");
            return;
          }
          clearTimeout(authTimer);
          authenticated = true;
          if (this.socket && this.socket !== socket) this.socket.close(1012, "Replaced by new Blockbench client");
          this.socket = socket;
          this.client = {
            name: message.client?.name ?? "Blockbench",
            blockbenchVersion: message.client?.blockbenchVersion,
            pluginVersion: message.client?.pluginVersion,
            project: message.client?.project,
            connectedAt: new Date().toISOString(),
          };
          socket.send(JSON.stringify({ type: "hello_ack", server: "blockbench-mcp", version: "0.4.0" }));
          return;
        }

        if (message.type === "response") {
          const entry = this.pending.get(message.id);
          if (!entry) return;
          clearTimeout(entry.timeout);
          this.pending.delete(message.id);
          if (message.error) {
            const error = new Error(message.error.message ?? "Unknown Blockbench error");
            if (message.error.stack) error.stack = message.error.stack;
            entry.reject(error);
          } else {
            entry.resolve(message.result);
          }
        }
      });

      socket.on("close", () => {
        clearTimeout(authTimer);
        if (this.socket === socket) {
          this.socket = undefined;
          this.client = undefined;
          this.rejectAll(new Error("Blockbench disconnected"));
        }
      });
    });
  }

  getStatus() {
    return {
      listening: Boolean(this.server),
      endpoint: `ws://${this.host}:${this.port}`,
      connected: Boolean(this.socket && this.socket.readyState === this.socket.OPEN),
      client: this.client ?? null,
      pendingRequests: this.pending.size,
    };
  }

  async request<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== socket.OPEN) {
      throw new Error(`Blockbench is not connected. Load the bridge plugin and connect to ws://${this.host}:${this.port}.`);
    }
    const id = randomUUID();
    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Blockbench request '${method}' timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
      socket.send(JSON.stringify({ type: "request", id, method, params }), (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  async close(): Promise<void> {
    this.rejectAll(new Error("Bridge server stopped"));
    this.socket?.close(1001, "Bridge server stopped");
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = undefined;
    }
  }

  private rejectAll(error: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
    this.pending.clear();
  }
}
