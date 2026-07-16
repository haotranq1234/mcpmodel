import assert from "node:assert/strict";
import test from "node:test";
import { buildRigPreset, rigProfiles } from "./presets.js";
import { validateModelReferences } from "./schemas.js";

test("all professional rig presets have valid references", () => {
  for (const profile of rigProfiles) {
    const spec = buildRigPreset({ profile, name: `Test ${profile}`, scale: 1.25 });
    assert.deepEqual(validateModelReferences(spec), [], profile);
    assert.ok(spec.groups.length >= 6, profile);
    if (profile !== "weapon") assert.ok(spec.locators.length >= 2, profile);
  }
});

test("golem preset includes combat and ModelEngine conventions", () => {
  const spec = buildRigPreset({ profile: "humanoid_golem", name: "Arcane Golem" });
  const names = new Set(spec.groups.map((group) => group.name));
  for (const name of ["vfx", "body", "torso", "body_upper", "h_head", "h_jaw", "hitbox", "weapon", "projectile"]) {
    assert.equal(names.has(name), true, name);
  }
});

test("weapon preset defaults to the Minecraft Java item format", () => {
  const spec = buildRigPreset({ profile: "weapon", name: "Moon Blade" });
  assert.equal(spec.project.format, "java_block");
  assert.ok(spec.project.display_settings.gui);
  assert.equal(spec.locators.length, 0);
});
