import assert from "node:assert/strict";
import test from "node:test";
import { buildCutePet, petAccessories, petSpecies } from "./pet-generator.js";
import { validateModelReferences } from "./schemas.js";

test("generates valid production-ready pets for every supported species", () => {
  for (const species of petSpecies) {
    const model = buildCutePet({ name: `Cute ${species}`, species, accessory: "bow", animation_set: "full" });
    assert.deepEqual(validateModelReferences(model), [], species);
    assert.ok(model.cubes.length >= 40, `${species} cube detail budget`);
    assert.ok(model.groups.length >= 18, `${species} rig density`);
    assert.equal(model.animations.length, 4, `${species} animation coverage`);
    assert.ok(model.locators.length >= 3, `${species} skill sockets`);
    assert.ok(model.cubes.some(cube => cube.name.includes("eye_big_shine")), `${species} eye highlights`);
  }
});

test("all pet accessories compile without broken references", () => {
  for (const accessory of petAccessories) {
    const model = buildCutePet({ name: `Fox ${accessory}`, species: "fox", accessory, animation_set: "core" });
    assert.deepEqual(validateModelReferences(model), [], accessory);
    assert.equal(model.animations.length, 2);
  }
});

test("scales pet geometry and pivots consistently", () => {
  const normal = buildCutePet({ name: "Normal Fox", scale: 1 });
  const large = buildCutePet({ name: "Large Fox", scale: 2 });
  assert.equal(large.cubes[0].from[0], normal.cubes[0].from[0] * 2);
  assert.equal(large.groups[2].origin[1], normal.groups[2].origin[1] * 2);
  assert.equal(large.locators[0].position[2], normal.locators[0].position[2] * 2);
});
