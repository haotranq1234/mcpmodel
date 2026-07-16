import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";
import { BlockbenchBridge } from "./bridge.js";

test("authenticates a plugin and completes an RPC request", async () => {
  const port = 40_000 + Math.floor(Math.random() * 10_000);
  const bridge = new BlockbenchBridge("127.0.0.1", port, "test-token", 2_000);
  await bridge.start();
  const client = new WebSocket(`ws://127.0.0.1:${port}`);

  await new Promise<void>((resolve, reject) => {
    client.once("open", () => {
      client.send(JSON.stringify({
        type: "hello",
        token: "test-token",
        client: { name: "Test Blockbench", pluginVersion: "0.1.0" },
      }));
    });
    client.on("message", (buffer) => {
      const message = JSON.parse(buffer.toString()) as { type: string; id?: string; method?: string };
      if (message.type === "hello_ack") {
        resolve();
      } else if (message.type === "request" && message.id) {
        client.send(JSON.stringify({ type: "response", id: message.id, result: { method: message.method } }));
      }
    });
    client.once("error", reject);
  });

  assert.equal(bridge.getStatus().connected, true);
  assert.deepEqual(await bridge.request("ping"), { method: "ping" });
  client.close();
  await bridge.close();
});

