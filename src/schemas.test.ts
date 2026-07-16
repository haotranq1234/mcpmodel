import assert from "node:assert/strict";
import test from "node:test";
import { modelSpecSchema, validateModelReferences } from "./schemas.js";

test("parses a complete model and validates references", () => {
  const spec = modelSpecSchema.parse({
    project: { name: "Test Pet" },
    groups: [{ id: "root_bone", name: "root", origin: [0, 8, 0] }],
    textures: [{ name: "pet.png", width: 16, height: 16, fill: "#ff0000ff" }],
    cubes: [{
      name: "body",
      parent: "root_bone",
      from: [-2, 4, -3],
      to: [2, 8, 3],
      faces: { north: { texture: "pet.png", uv: [0, 0, 4, 4] } },
    }],
    animations: [{
      name: "idle",
      length: 1,
      tracks: [{ bone: "root_bone", keyframes: [{ time: 0, channel: "rotation", vector: [0, 0, 0] }] }],
    }],
  });
  assert.deepEqual(validateModelReferences(spec), []);
  assert.equal(spec.project.format, "free");
  assert.equal(spec.project.texture_width, 64);
});

test("reports invalid geometry and missing references", () => {
  const spec = modelSpecSchema.parse({
    project: { name: "Broken" },
    cubes: [{ name: "bad", parent: "missing", from: [1, 0, 0], to: [0, 1, 1] }],
  });
  const errors = validateModelReferences(spec);
  assert.equal(errors.length, 2);
  assert.match(errors.join("\n"), /from values smaller/);
  assert.match(errors.join("\n"), /missing parent/);
});

test("allows append references to existing Blockbench objects", () => {
  const spec = modelSpecSchema.parse({
    project: { name: "Append" },
    mode: "append",
    cubes: [{ name: "new_part", parent: "existing_bone", from: [0, 0, 0], to: [1, 1, 1] }],
  });
  assert.deepEqual(validateModelReferences(spec), []);
});

test("supports animated emissive textures, locators, display transforms, and advanced keyframes", () => {
  const spec = modelSpecSchema.parse({
    project: {
      name: "Advanced",
      display_settings: { gui: { rotation: [30, 225, 0], scale: [0.8, 0.8, 0.8] } },
    },
    groups: [{ id: "vfx", name: "vfx" }],
    locators: [{ name: "projectile_spawn", parent: "vfx", position: [0, 8, -4] }],
    textures: [{
      name: "glow.png",
      width: 64,
      height: 1088,
      uv_width: 64,
      uv_height: 64,
      render_mode: "emissive",
      frame_time: 2,
    }],
    animations: [{
      name: "vfx_loop",
      length: 1,
      markers: [{ time: 0.5, color: 2, label: "impact" }],
      tracks: [{
        bone: "vfx",
        keyframes: [
          { time: 0, channel: "scale", data_points: [[0, 0, 0], [1, 1, 1]], interpolation: "step" },
          { time: 1, channel: "position", vector: ["math.sin(query.anim_time)", 0, 0] },
        ],
      }],
    }],
  });
  assert.deepEqual(validateModelReferences(spec), []);
  assert.equal(spec.textures[0].render_mode, "emissive");
  assert.equal(spec.locators[0].name, "projectile_spawn");
});
