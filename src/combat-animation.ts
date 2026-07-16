import { z } from "zod";
import { animationSchema } from "./schemas.js";

const directionSchema = z.enum(["horizontal_left", "horizontal_right", "overhead", "uppercut", "thrust"]);

export const combatComboSchema = z.object({
  name: z.string().min(1).default("attack_combo"),
  length: z.number().positive().max(60),
  snapping: z.number().positive().max(120).default(20),
  bones: z.object({
    body: z.string().min(1),
    weapon: z.string().min(1),
    dominant_arm: z.string().min(1),
    off_arm: z.string().min(1).optional(),
    head: z.string().min(1).optional(),
    left_leg: z.string().min(1).optional(),
    right_leg: z.string().min(1).optional(),
  }),
  attacks: z.array(z.object({
    time: z.number().nonnegative(),
    direction: directionSchema,
    power: z.number().min(0.2).max(2).default(1),
    sfx: z.string().min(1).max(240).optional(),
    label: z.string().min(1).max(120).optional(),
  })).min(1).max(8),
  return_to_idle: z.boolean().default(true),
}).superRefine((value, context) => {
  for (const attack of value.attacks) {
    if (attack.time > value.length) context.addIssue({ code: "custom", message: `Attack at ${attack.time}s exceeds combo length ${value.length}s` });
  }
});

export type CombatComboInput = z.input<typeof combatComboSchema>;
type Vec3 = [number, number, number];
type Channel = "rotation" | "position" | "scale";
type Keyframe = { time: number; channel: Channel; vector: Vec3; interpolation: "linear" | "step" | "catmullrom" | "bezier" };

const weaponPoses: Record<z.infer<typeof directionSchema>, { windup: Vec3; contact: Vec3; follow: Vec3; body: Vec3 }> = {
  horizontal_left: { windup: [-12, -72, -28], contact: [8, 48, 22], follow: [15, 105, 38], body: [0, 34, 8] },
  horizontal_right: { windup: [-12, 72, 28], contact: [8, -48, -22], follow: [15, -105, -38], body: [0, -34, -8] },
  overhead: { windup: [-105, 0, -18], contact: [38, 0, 5], follow: [82, 0, 16], body: [18, 0, 4] },
  uppercut: { windup: [65, -18, 12], contact: [-28, 12, -6], follow: [-78, 22, -18], body: [-14, 18, -5] },
  thrust: { windup: [0, -28, -12], contact: [0, 10, 4], follow: [0, 22, 8], body: [-6, 12, 3] },
};

function scaled(vector: Vec3, scale: number): Vec3 {
  return vector.map(value => Number((value * scale).toFixed(4))) as Vec3;
}

export function buildCombatCombo(raw: CombatComboInput) {
  const input = combatComboSchema.parse(raw);
  const tracks = new Map<string, Keyframe[]>();
  const push = (bone: string | undefined, keyframe: Keyframe) => {
    if (!bone) return;
    const list = tracks.get(bone) ?? [];
    list.push({ ...keyframe, time: Number(Math.max(0, Math.min(input.length, keyframe.time)).toFixed(4)) });
    tracks.set(bone, list);
  };
  const neutral = (bone: string | undefined, channel: Channel = "rotation") => push(bone, { time: 0, channel, vector: [0, 0, 0], interpolation: "linear" });
  for (const bone of Object.values(input.bones)) neutral(bone);
  neutral(input.bones.body, "position");

  const attacks = [...input.attacks].sort((left, right) => left.time - right.time);
  const cueSheet: Array<{ time: number; label: string; sfx?: string; direction: string; power: number }> = [];
  for (const [index, attack] of attacks.entries()) {
    const pose = weaponPoses[attack.direction];
    const windupTime = Math.max(0, attack.time - (0.16 + attack.power * 0.08));
    const followTime = Math.min(input.length, attack.time + 0.08 + attack.power * 0.055);
    const settleTime = Math.min(input.length, attack.time + 0.22 + attack.power * 0.1);
    push(input.bones.weapon, { time: windupTime, channel: "rotation", vector: scaled(pose.windup, attack.power), interpolation: "bezier" });
    push(input.bones.weapon, { time: attack.time, channel: "rotation", vector: scaled(pose.contact, attack.power), interpolation: "linear" });
    push(input.bones.weapon, { time: followTime, channel: "rotation", vector: scaled(pose.follow, attack.power), interpolation: "catmullrom" });
    push(input.bones.dominant_arm, { time: windupTime, channel: "rotation", vector: scaled(pose.windup, attack.power * 0.62), interpolation: "bezier" });
    push(input.bones.dominant_arm, { time: attack.time, channel: "rotation", vector: scaled(pose.contact, attack.power * 0.58), interpolation: "linear" });
    push(input.bones.dominant_arm, { time: followTime, channel: "rotation", vector: scaled(pose.follow, attack.power * 0.48), interpolation: "catmullrom" });
    push(input.bones.off_arm, { time: windupTime, channel: "rotation", vector: scaled(pose.body, -0.42 * attack.power), interpolation: "bezier" });
    push(input.bones.off_arm, { time: followTime, channel: "rotation", vector: scaled(pose.body, 0.28 * attack.power), interpolation: "catmullrom" });
    push(input.bones.body, { time: windupTime, channel: "rotation", vector: scaled(pose.body, -0.55 * attack.power), interpolation: "bezier" });
    push(input.bones.body, { time: attack.time, channel: "rotation", vector: scaled(pose.body, attack.power), interpolation: "linear" });
    push(input.bones.body, { time: settleTime, channel: "rotation", vector: scaled(pose.body, 0.12), interpolation: "catmullrom" });
    const lunge = attack.direction === "thrust" ? 2.2 : 0.7;
    push(input.bones.body, { time: windupTime, channel: "position", vector: [0, 0, -0.18 * attack.power], interpolation: "bezier" });
    push(input.bones.body, { time: attack.time, channel: "position", vector: [0, 0, lunge * attack.power], interpolation: "linear" });
    push(input.bones.body, { time: settleTime, channel: "position", vector: [0, 0, 0], interpolation: "catmullrom" });
    push(input.bones.head, { time: attack.time, channel: "rotation", vector: scaled(pose.body, -0.22), interpolation: "linear" });
    push(input.bones.left_leg, { time: windupTime, channel: "rotation", vector: [0, 0, index % 2 ? -8 : 8], interpolation: "bezier" });
    push(input.bones.right_leg, { time: attack.time, channel: "rotation", vector: [0, 0, index % 2 ? 10 : -10], interpolation: "linear" });
    cueSheet.push({ time: attack.time, label: attack.label ?? `hit_${index + 1}`, sfx: attack.sfx, direction: attack.direction, power: attack.power });
  }

  if (input.return_to_idle) {
    for (const bone of Object.values(input.bones)) push(bone, { time: input.length, channel: "rotation", vector: [0, 0, 0], interpolation: "catmullrom" });
    push(input.bones.body, { time: input.length, channel: "position", vector: [0, 0, 0], interpolation: "catmullrom" });
  }

  const animation = animationSchema.parse({
    name: input.name,
    length: input.length,
    loop: "once",
    snapping: input.snapping,
    markers: attacks.map((attack, index) => ({ time: attack.time, color: index % 8, label: attack.label ?? `hit_${index + 1}` })),
    tracks: [...tracks.entries()].map(([bone, keyframes]) => {
      const unique = new Map<string, Keyframe>();
      for (const keyframe of keyframes) unique.set(`${keyframe.channel}:${keyframe.time}`, keyframe);
      return { bone, keyframes: [...unique.values()].sort((left, right) => left.time - right.time) };
    }),
  });
  return { animation, cue_sheet: cueSheet, hit_count: attacks.length };
}
