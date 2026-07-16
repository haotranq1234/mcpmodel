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
    "blockbench_build_from_reference",
    "blockbench_capture_preview",
    "blockbench_capture_turntable",
    "blockbench_create_pet",
    "blockbench_create_rig",
    "blockbench_export_model",
    "blockbench_get_project",
    "blockbench_list_capabilities",
    "blockbench_open_project",
    "blockbench_patch_model",
    "blockbench_quality_report",
    "blockbench_save_project",
    "blockbench_set_camera",
    "blockbench_status",
  ]);

  const dryRun = await client.callTool({
    name: "blockbench_build_from_reference",
    arguments: {
      dry_run: true,
      blueprint: {
        reference: {
          source_image: "attachment://reference.png",
          subject: "Small armored reference prop",
          detected_views: ["front", "right"],
          confidence: 0.9,
        },
        project: { name: "Reference dry run", target_cube_budget: [1, 10] },
        palette: [{ id: "metal", color: "#443F3B" }],
        groups: [{ id: "root", name: "reference_root" }],
        primitives: [{
          kind: "armor_plate", id: "plate", name: "front_plate", parent: "root",
          material: "metal", trim_material: "metal", from: [-2, 0, -1], to: [2, 4, 1], trim: 0.25,
        }],
      },
    },
  });
  assert.equal(dryRun.isError, undefined);
  const dryRunContent = dryRun.content as Array<{ type: string; text?: string }>;
  const parsed = JSON.parse(dryRunContent.find(item => item.type === "text")?.text ?? "{}");
  assert.equal(parsed.dry_run, true);
  assert.equal(parsed.ready_to_build, true);
  assert.equal(parsed.compile.cube_count, 5);
  await client.close();
});
