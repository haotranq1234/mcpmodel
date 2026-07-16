#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BlockbenchBridge } from "./bridge.js";
import { buildCutePet, petGeneratorSchema } from "./pet-generator.js";
import { buildRigPreset, rigProfiles } from "./presets.js";
import { analyzeModelQuality, type ProjectSnapshot, type QualityProfile } from "./quality.js";
import { compileReferenceBlueprint, referenceBuildToolSchema } from "./reference-blueprint.js";
import { animationSchema, modelSpecSchema, validateModelReferences } from "./schemas.js";

const host = process.env.BLOCKBENCH_MCP_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.BLOCKBENCH_MCP_PORT ?? "32145", 10);
const token = process.env.BLOCKBENCH_MCP_TOKEN ?? "blockbench-mcp-local";

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("BLOCKBENCH_MCP_PORT must be an integer between 1 and 65535");
}
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  throw new Error("For safety, BLOCKBENCH_MCP_HOST must be a loopback address");
}

const bridge = new BlockbenchBridge(host, port, token);
await bridge.start();

const server = new McpServer(
  { name: "blockbench-mcp", version: "0.4.0" },
  {
    instructions: [
      "Use blockbench_status before editing.",
      "Prefer blockbench_apply_model with a complete declarative specification.",
      "For ModelEngine entities, start with blockbench_create_rig and use locators for skill attachment points.",
      "For Minecraft item models, configure display_settings and animated/emissive texture metadata.",
      "Use stable group IDs and reference those IDs from cube parents and animation tracks.",
      "Keep cube from coordinates strictly smaller than to coordinates.",
      "Use blockbench_capture_preview after major edits to visually inspect the result.",
      "When the user attaches a reference image, inspect it with vision and call blockbench_build_from_reference with a structured blueprint. The bridge compiles primitives; it does not guess unseen image content.",
      "For image references, map every visible major part to semantic bones and compressed primitives, use mirror_x only for truly symmetric parts, and set dry_run first for complex 120+ cube models.",
      "For pets, prefer blockbench_create_pet over assembling plain boxes manually, then use blockbench_capture_turntable and blockbench_quality_report.",
      "A polished pet needs a readable silhouette, layered face, paired limbs, articulated ears/tail, and idle/walk/skill/death animation coverage.",
      "Run blockbench_audit_model before saving or exporting.",
      "Never claim a model was saved unless blockbench_save_project succeeds.",
    ].join(" "),
  },
);

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

server.registerTool(
  "blockbench_status",
  { description: "Check whether the Blockbench bridge plugin is connected and inspect its current project." },
  async () => {
    const status = bridge.getStatus();
    if (!status.connected) return textResult(status);
    try {
      return textResult({ ...status, live: await bridge.request("get_project_state") });
    } catch (error) {
      return textResult({ ...status, liveError: error instanceof Error ? error.message : String(error) });
    }
  },
);

server.registerTool(
  "blockbench_create_pet",
  {
    description: "Generate and apply a polished layered chibi pet (fox, wolf, cat, or rabbit) from a compact art-direction brief. Includes semantic rigging, face details, articulated tail/ears, accessory, textures, locators, and production animation set.",
    inputSchema: petGeneratorSchema,
  },
  async (input) => {
    const spec = buildCutePet(input);
    const errors = validateModelReferences(spec);
    if (errors.length) return { isError: true, ...textResult({ ok: false, validationErrors: errors }) };
    return textResult(await bridge.request("apply_model", spec));
  },
);

server.registerTool(
  "blockbench_apply_model",
  {
    description: "Atomically create or append a precise Blockbench model from groups/bones, cubes, UVs, textures, pixel patches, and animations.",
    inputSchema: modelSpecSchema,
  },
  async (input) => {
    const spec = modelSpecSchema.parse(input);
    const errors = validateModelReferences(spec);
    if (errors.length) {
      return { isError: true, ...textResult({ ok: false, validationErrors: errors }) };
    }
    return textResult(await bridge.request("apply_model", spec));
  },
);

server.registerTool(
  "blockbench_build_from_reference",
  {
    description: [
      "Build a Blockbench model from an image reference already inspected by ChatGPT/another vision-capable MCP client.",
      "The caller must translate the attached image into the structured blueprint: palette, semantic bone hierarchy, dimensions, symmetry, compressed geometry primitives, sockets, and animation tracks.",
      "Supports boxes, tapered stacks, alternating chains, ragged cloth, crystal clusters, skulls, rib cages, and trimmed armor plates.",
      "Use dry_run=true first for complex references; this validates and reports compiled cube counts without changing Blockbench.",
      "After build, always capture a four-view turntable and patch discrepancies against the original image.",
    ].join(" "),
    inputSchema: referenceBuildToolSchema,
  },
  async ({ blueprint, dry_run }) => {
    const compiled = compileReferenceBlueprint(blueprint);
    const validationErrors = validateModelReferences(compiled.spec);
    if (validationErrors.length) {
      return { isError: true, ...textResult({ ok: false, validationErrors, compile: compiled.report }) };
    }
    if (dry_run) {
      return textResult({
        ok: true,
        dry_run: true,
        ready_to_build: true,
        compile: compiled.report,
        preview: {
          groups: compiled.spec.groups.map(group => group.name),
          materials: compiled.spec.textures.map(texture => texture.name),
          first_cubes: compiled.spec.cubes.slice(0, 20).map(cube => cube.name),
        },
      });
    }
    const applied = await bridge.request("apply_model", compiled.spec);
    return textResult({ ok: true, dry_run: false, compile: compiled.report, applied });
  },
);

server.registerTool(
  "blockbench_patch_model",
  {
    description: "Atomically refine existing cubes and bones by stable name/UUID after visual review, or remove unwanted cubes. Use this for turntable-driven correction without rebuilding the project.",
    inputSchema: z.object({
      cubes: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        from: z.tuple([z.number(), z.number(), z.number()]).optional(),
        to: z.tuple([z.number(), z.number(), z.number()]).optional(),
        origin: z.tuple([z.number(), z.number(), z.number()]).optional(),
        rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
        inflate: z.number().finite().optional(),
        visibility: z.boolean().optional(),
      })).max(1_000).default([]),
      groups: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        origin: z.tuple([z.number(), z.number(), z.number()]).optional(),
        rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
        visibility: z.boolean().optional(),
      })).max(1_000).default([]),
      remove_cubes: z.array(z.string().min(1)).max(1_000).default([]),
    }),
  },
  async (input) => textResult(await bridge.request("patch_model", input)),
);

server.registerTool(
  "blockbench_create_rig",
  {
    description: "Create a professional empty rig preset for a weapon, ModelEngine pet, quadruped pet, or humanoid golem, including VFX bones, hitbox, and attachment locators.",
    inputSchema: z.object({
      profile: z.enum(rigProfiles),
      name: z.string().min(1),
      scale: z.number().positive().max(100).default(1),
      format: z.string().min(1).optional().describe("Defaults to java_block for weapons and free for entity rigs"),
      texture_width: z.number().int().positive().max(4096).default(64),
      texture_height: z.number().int().positive().max(4096).default(64),
    }),
  },
  async (input) => {
    const spec = buildRigPreset(input);
    return textResult(await bridge.request("apply_model", spec));
  },
);

server.registerTool(
  "blockbench_add_animation",
  {
    description: "Add one advanced animation to the current project, including Molang values, pre/post data points, step/catmullrom/bezier interpolation, and bezier handles.",
    inputSchema: z.object({ animation: animationSchema }),
  },
  async ({ animation }) => {
    const live = await bridge.request<{
      open: boolean;
      name?: string;
      format?: string;
      texture_size?: [number, number];
      box_uv?: boolean;
    }>("get_project_state");
    if (!live.open) return { isError: true, ...textResult({ ok: false, error: "No open Blockbench project" }) };
    const spec = modelSpecSchema.parse({
      project: {
        name: live.name ?? "model",
        format: live.format ?? "free",
        texture_width: live.texture_size?.[0] ?? 64,
        texture_height: live.texture_size?.[1] ?? 64,
        box_uv: live.box_uv ?? true,
      },
      mode: "append",
      animations: [animation],
    });
    return textResult(await bridge.request("apply_model", spec));
  },
);

server.registerTool(
  "blockbench_get_project",
  {
    description: "Read a compact snapshot of the open Blockbench project, including groups, cubes, textures, animations, and bounds.",
    inputSchema: z.object({ include_uv: z.boolean().default(false) }),
  },
  async (input) => textResult(await bridge.request("get_project_state", input)),
);

server.registerTool(
  "blockbench_audit_model",
  {
    description: "Audit the active model for invalid cube bounds, missing textures, UV overflow, unrigged cubes, animation loop discontinuity, frame-strip errors, rig conventions, and item display transforms.",
    inputSchema: z.object({ profile: z.enum(["generic", "weapon", "pet", "entity"]).default("generic") }),
  },
  async (input) => textResult(await bridge.request("audit_model", input)),
);

server.registerTool(
  "blockbench_quality_report",
  {
    description: "Score the active model's art quality using structural lessons from professional weapon, pet, and golem packs: silhouette layering, semantic naming, detail density, symmetry, rig coverage, and animation timing.",
    inputSchema: z.object({ profile: z.enum(["generic", "pet", "weapon", "golem"]).default("generic") }),
  },
  async ({ profile }) => {
    const snapshot = await bridge.request<ProjectSnapshot>("get_project_state");
    return textResult(analyzeModelQuality(snapshot, profile as QualityProfile));
  },
);

server.registerTool(
  "blockbench_list_capabilities",
  { description: "List Blockbench model formats and the capabilities/codec of the active format." },
  async () => textResult(await bridge.request("list_capabilities")),
);

server.registerTool(
  "blockbench_open_project",
  {
    description: "Open an uncompressed .bbmodel project from a local path in a new Blockbench project tab for inspection or editing.",
    inputSchema: z.object({ path: z.string().min(1) }),
  },
  async (input) => textResult(await bridge.request("open_project", input)),
);

server.registerTool(
  "blockbench_set_camera",
  {
    description: "Set the active Blockbench preview camera before visual inspection.",
    inputSchema: z.object({
      position: z.tuple([z.number(), z.number(), z.number()]),
      target: z.tuple([z.number(), z.number(), z.number()]).default([0, 8, 0]),
      orthographic: z.boolean().default(false),
      fov: z.number().min(1).max(120).default(45),
    }),
  },
  async (input) => textResult(await bridge.request("set_camera", input)),
);

server.registerTool(
  "blockbench_capture_preview",
  {
    description: "Capture the active 3D viewport so the AI can visually verify proportions, silhouette, and colors.",
    inputSchema: z.object({
      width: z.number().int().min(64).max(2048).default(640),
      height: z.number().int().min(64).max(2048).default(640),
      crop: z.boolean().default(false),
    }),
  },
  async (input) => {
    const result = await bridge.request<{ data_url: string; width: number; height: number }>("capture_preview", input);
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(result.data_url);
    if (!match) return textResult(result);
    return {
      content: [
        { type: "image" as const, mimeType: match[1], data: match[2] },
        { type: "text" as const, text: `Blockbench preview ${result.width}x${result.height}` },
      ],
    };
  },
);

server.registerTool(
  "blockbench_capture_turntable",
  {
    description: "Automatically frame and capture hero, front, side, and back views of the active model for an AI visual refinement loop.",
    inputSchema: z.object({
      views: z.array(z.enum(["hero", "front", "side", "back"])).min(1).max(4).default(["hero", "front", "side", "back"]),
      width: z.number().int().min(128).max(2048).default(640),
      height: z.number().int().min(128).max(2048).default(640),
      orthographic: z.boolean().default(false),
      distance: z.number().positive().max(10).default(1.8).describe("Camera distance multiplier relative to the largest model dimension"),
    }),
  },
  async (input) => {
    const snapshot = await bridge.request<ProjectSnapshot>("get_project_state");
    if (!snapshot.open || !snapshot.bounds) {
      return { isError: true, ...textResult({ ok: false, error: "No model geometry is open in Blockbench" }) };
    }
    const { min, max, size } = snapshot.bounds;
    const target = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2 + size[1] * 0.05,
      (min[2] + max[2]) / 2,
    ];
    const distance = Math.max(...size) * input.distance;
    const positions: Record<string, number[]> = {
      hero: [target[0] + distance * 0.72, target[1] + distance * 0.38, target[2] - distance * 0.72],
      front: [target[0], target[1] + size[1] * 0.08, target[2] - distance],
      side: [target[0] + distance, target[1] + size[1] * 0.08, target[2]],
      back: [target[0], target[1] + size[1] * 0.08, target[2] + distance],
    };
    const content: Array<
      { type: "text"; text: string } |
      { type: "image"; mimeType: string; data: string }
    > = [];
    for (const view of input.views) {
      await bridge.request("set_camera", {
        position: positions[view], target, orthographic: input.orthographic, fov: 35,
      });
      const preview = await bridge.request<{ data_url: string; width: number; height: number }>("capture_preview", {
        width: input.width, height: input.height, crop: false,
      });
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(preview.data_url);
      content.push({ type: "text", text: `${view} view ${preview.width}x${preview.height}` });
      if (match) content.push({ type: "image", mimeType: match[1], data: match[2] });
    }
    return { content };
  },
);

server.registerTool(
  "blockbench_save_project",
  {
    description: "Save the active project as a .bbmodel file on the local machine.",
    inputSchema: z.object({ path: z.string().min(1) }),
  },
  async (input) => textResult(await bridge.request("save_project", input)),
);

server.registerTool(
  "blockbench_export_model",
  {
    description: "Export using the active format codec, such as a Minecraft Java item JSON, or use codec 'project' for .bbmodel.",
    inputSchema: z.object({ path: z.string().min(1), codec: z.string().min(1).optional() }),
  },
  async (input) => textResult(await bridge.request("export_model", input)),
);

const transport = new StdioServerTransport();
await server.connect(transport);

async function shutdown() {
  await server.close();
  await bridge.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
