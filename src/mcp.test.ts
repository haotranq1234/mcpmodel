import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("starts over stdio and exposes the Blockbench tools", async () => {
  const port = 50_000 + Math.floor(Math.random() * 10_000);
  const serverPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      BLOCKBENCH_MCP_PORT: String(port),
      BLOCKBENCH_MCP_TOKEN: "integration-test-token",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "blockbench-mcp-test", version: "0.1.0" });
  await client.connect(transport);
  const result = await client.listTools();
  const names = result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "blockbench_add_animation",
    "blockbench_apply_model",
    "blockbench_audit_model",
    "blockbench_capture_preview",
    "blockbench_create_rig",
    "blockbench_export_model",
    "blockbench_get_project",
    "blockbench_list_capabilities",
    "blockbench_open_project",
    "blockbench_save_project",
    "blockbench_set_camera",
    "blockbench_status",
  ]);
  await client.close();
});
