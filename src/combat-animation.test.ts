import assert from "node:assert/strict";
import test from "node:test";
import { buildCombatCombo } from "./combat-animation.js";

test("builds a three-hit combo with anticipation, contact, follow-through and SFX cues", () => {
  const result = buildCombatCombo({
    name: "axe_combo", length: 2.4,
    bones: { body: "body", weapon: "axe", dominant_arm: "right_arm", off_arm: "left_arm", head: "head", left_leg: "left_leg", right_leg: "right_leg" },
    attacks: [
      { time: 0.55, direction: "horizontal_left", power: 0.8, sfx: "axe_swing_1" },
      { time: 1.15, direction: "horizontal_right", power: 1, sfx: "axe_swing_2" },
      { time: 1.85, direction: "overhead", power: 1.4, sfx: "axe_impact_heavy" },
    ],
  });
  assert.equal(result.hit_count, 3);
  assert.equal(result.cue_sheet[2].sfx, "axe_impact_heavy");
  assert.equal(result.animation.markers.length, 3);
  assert.ok(result.animation.tracks.find(track => track.bone === "axe")!.keyframes.length >= 10);
  assert.ok(result.animation.tracks.some(track => track.bone === "body" && track.keyframes.some(keyframe => keyframe.channel === "position")));
});

test("rejects hit times outside the combo", () => {
  assert.throws(() => buildCombatCombo({
    length: 1,
    bones: { body: "body", weapon: "axe", dominant_arm: "arm" },
    attacks: [{ time: 1.2, direction: "overhead" }],
  }), /exceeds combo length/);
});
