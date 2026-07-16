import assert from "node:assert/strict";
import test from "node:test";
import { compileReferenceBlueprint, type ReferenceBlueprintInput } from "./reference-blueprint.js";
import { validateModelReferences } from "./schemas.js";

function blueprint(): ReferenceBlueprintInput {
  return {
    reference: {
      source_image: "attachment://grave-boss.png",
      subject: "Ancient armored grave boss with skull, chains, crystals and a ragged robe",
      style: "Minecraft dark fantasy boss",
      detected_views: ["front", "back", "left", "right", "detail", "pose"],
      confidence: 0.92,
      assumptions: ["Hidden inner armor follows the visible front silhouette"],
    },
    project: {
      name: "Reference Boss Dry Run",
      format: "free",
      texture_width: 128,
      texture_height: 128,
      box_uv: false,
      target_cube_budget: [40, 80],
    },
    palette: [
      { id: "stone", color: "#262633", render_mode: "default" },
      { id: "bone", color: "#BFB7A6", render_mode: "default" },
      { id: "dark", color: "#0F0F12", render_mode: "default" },
      { id: "purple", color: "#8D53E6", render_mode: "emissive" },
      { id: "bronze", color: "#8B795E", render_mode: "default" },
      { id: "cloth", color: "#493E57", render_mode: "default" },
    ],
    groups: [
      { id: "root", name: "reference_boss", origin: [0, 0, 0] },
      { id: "body", name: "body", parent: "root", origin: [0, 16, 0] },
      { id: "head", name: "h_head", parent: "body", origin: [0, 28, -1] },
      { id: "robe", name: "robe", parent: "body", origin: [0, 12, 1] },
      { id: "vfx", name: "vfx", parent: "root", origin: [0, 0, 0] },
    ],
    locators: [{ name: "weapon_socket", parent: "body", position: [8, 18, 0] }],
    primitives: [
      { kind: "box", id: "shoulder", name: "shoulder_plate", parent: "body", material: "stone", from: [4, 20, -2], to: [8, 24, 3], rotation: [0, 0, -12], mirror_x: true, inflate: 0, shade: true },
      { kind: "tapered_stack", id: "arm", name: "armored_arm", parent: "body", material: "stone", start: [7, 21, 0], end: [9, 11, 0], start_size: [4, 4, 4], end_size: [3, 3, 3], segments: 3, start_rotation: [0, 0, -8], end_rotation: [0, 0, -18], overlap: 0.1, mirror_x: true },
      { kind: "chain", id: "chest_chain", name: "chest_chain", parent: "body", material: "bronze", start: [-5, 20, -3], end: [5, 13, -3], links: 4, link_size: [0.7, 1.1, 0.35], alternating_roll: 45, mirror_x: false },
      { kind: "ragged_panel", id: "front_robe", name: "ragged_front_robe", parent: "robe", material: "cloth", center: [0, 8, -2], width: 10, height: 14, depth: 0.5, strips: 4, raggedness: 0.35, gap_ratio: 0.15, mirror_x: false },
      { kind: "crystal_cluster", id: "soul_core", name: "soul_crystal", parent: "body", material: "stone", glow_material: "purple", center: [0, 18, -4], size: [4, 7, 3], spikes: 5, spread: 0.7, mirror_x: false },
      { kind: "skull", id: "boss_skull", name: "boss_skull", parent: "head", bone_material: "bone", dark_material: "dark", eye_material: "purple", center: [0, 28, -2], size: [8, 8, 6], teeth: 4, mirror_x: false },
      { kind: "ribcage", id: "boss_ribs", name: "boss_ribcage", parent: "body", bone_material: "bone", core_material: "purple", center: [0, 18, -1], size: [10, 9, 5], ribs: 3, mirror_x: false },
      { kind: "armor_plate", id: "chest_plate", name: "chest_armor", parent: "body", material: "stone", trim_material: "bronze", from: [-5, 15, -3], to: [5, 23, 1], trim: 0.4, rotation: [0, 0, 0], mirror_x: false },
    ],
    animations: [{
      name: "idle", length: 2, loop: "loop", snapping: 20, markers: [],
      tracks: [{ bone: "body", keyframes: [
        { time: 0, channel: "position", vector: [0, 0, 0], interpolation: "linear" },
        { time: 1, channel: "position", vector: [0, 0.2, 0], interpolation: "catmullrom" },
        { time: 2, channel: "position", vector: [0, 0, 0], interpolation: "linear" },
      ] }],
    }],
  };
}

test("compiles every image-reference primitive into a valid model spec", () => {
  const result = compileReferenceBlueprint(blueprint());
  assert.deepEqual(validateModelReferences(result.spec), []);
  assert.equal(result.report.within_budget, true);
  assert.ok(result.report.cube_count >= 40);
  assert.equal(result.report.primitive_count, 8);
  assert.equal(result.report.warnings.length, 0);
  assert.ok(result.report.painted_pixel_count > 0);
  assert.equal(result.report.flat_material_count, 0);
  for (const kind of ["box", "tapered_stack", "chain", "ragged_panel", "crystal_cluster", "skull", "ribcage", "armor_plate"]) {
    assert.equal(result.report.primitive_breakdown[kind], 1, kind);
  }
});

test("compiles curved organic fins for Fancy-style silhouettes", () => {
  const input = blueprint();
  input.primitives.push({
    kind: "organic_fin", id: "tail_fin", name: "curved_tail_fin", parent: "body", material: "stone",
    root: [0, 18, 2], tip: [0, 16, 12], root_width: 6, tip_width: 0.4, thickness: 0.35,
    segments: 5, bend: [2, 3, 0], twist: [-8, 22], mirror_x: false,
  });
  const result = compileReferenceBlueprint(input);
  assert.equal(result.report.primitive_breakdown.organic_fin, 1);
  assert.equal(result.spec.cubes.filter(cube => cube.name.startsWith("tail_fin_segment_")).length, 5);
});

test("packs cube faces into distinct material UV tiles", () => {
  const result = compileReferenceBlueprint(blueprint());
  const faces = result.spec.cubes[0].faces!;
  assert.notDeepEqual(faces.north!.uv, faces.south!.uv);
  assert.ok((result.report.uv_tiles_used.stone ?? 0) > 6);
  assert.deepEqual(result.report.uv_tile_overflow, {});
});

test("compiles overlapping armor plates and cargo cage frames", () => {
  const input = blueprint();
  input.primitives.push({
    kind: "layered_armor", id: "pauldron", name: "layered_pauldron", parent: "body",
    material: "stone", trim_material: "bronze", center: [8, 22, 0], size: [6, 3, 5], layers: 3,
    layer_offset: [0.5, -1, 0.4], scale_step: [-0.08, -0.05, -0.05], rotation: [0, 0, -10], rotation_step: [0, 0, -5], trim_thickness: 0.2,
    mirror_x: true,
  });
  input.primitives.push({
    kind: "cage_frame", id: "cargo", name: "cargo_cage", parent: "body", material: "bronze",
    from: [-4, 4, 3], to: [4, 12, 11], rail_thickness: 0.3, vertical_bars: 2, horizontal_bars: 1, depth_braces: 1,
    rotation: [0, 0, 0], mirror_x: false,
  });
  const result = compileReferenceBlueprint(input);
  assert.equal(result.report.primitive_breakdown.layered_armor, 1);
  assert.equal(result.report.primitive_breakdown.cage_frame, 1);
  assert.ok(result.spec.cubes.some(cube => cube.name.startsWith("pauldron_plate_")));
  assert.ok(result.spec.cubes.some(cube => cube.name.startsWith("cargo_vertical_")));
});

test("mirrors exact geometry across X without duplicating centered parts", () => {
  const result = compileReferenceBlueprint(blueprint());
  const left = result.spec.cubes.find(cube => cube.name === "shoulder_plate");
  const right = result.spec.cubes.find(cube => cube.name === "shoulder_plate_mirrored");
  assert.ok(left && right);
  assert.equal(right.from[0], -left.to[0]);
  assert.equal(right.to[0], -left.from[0]);
});

test("rejects image blueprints that reference an unknown material", () => {
  const input = blueprint();
  const first = input.primitives[0];
  if (first.kind !== "box") throw new Error("fixture changed");
  first.material = "missing";
  assert.throws(() => compileReferenceBlueprint(input), /missing material/);
});
