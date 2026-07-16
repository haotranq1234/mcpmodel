import { modelSpecSchema, type ModelSpec } from "./schemas.js";

export const rigProfiles = ["weapon", "modelengine_pet", "quadruped_pet", "humanoid_golem"] as const;
export type RigProfile = typeof rigProfiles[number];

export interface RigPresetInput {
  profile: RigProfile;
  name: string;
  scale?: number;
  format?: string;
  texture_width?: number;
  texture_height?: number;
}

function safeName(value: string): string {
  const name = value.trim().replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return name || "model";
}

export function buildRigPreset(input: RigPresetInput): ModelSpec {
  const name = safeName(input.name);
  const scale = input.scale ?? 1;
  const s = (value: number) => Number((value * scale).toFixed(4));
  const project = {
    name: input.name,
    format: input.format ?? (input.profile === "weapon" ? "java_block" : "free"),
    texture_width: input.texture_width ?? 64,
    texture_height: input.texture_height ?? 64,
    box_uv: true,
    display_settings: {},
  };

  if (input.profile === "weapon") {
    const weaponLocators = project.format === "java_block" ? [] : [
      { id: "grip_socket", name: "grip_socket", parent: "handle", position: [0, s(4), 0] as [number, number, number] },
      { id: "blade_tip", name: "blade_tip", parent: "blade", position: [0, s(28), 0] as [number, number, number] },
      { id: "projectile_spawn", name: "projectile_spawn", parent: "vfx", position: [0, s(28), 0] as [number, number, number] },
    ];
    return modelSpecSchema.parse({
      project: {
        ...project,
        display_settings: {
          thirdperson_righthand: { translation: [0, 2, 1] },
          thirdperson_lefthand: { translation: [0, 2, 1] },
          firstperson_righthand: { rotation: [-10, 0, 0], translation: [0, 2, 0] },
          firstperson_lefthand: { rotation: [-10, 0, 0], translation: [0, 2, 0] },
          ground: { rotation: [45, 0, 0], translation: [0, 4, 0] },
          gui: { rotation: [30, 225, 0], scale: [0.85, 0.85, 0.85] },
          head: { rotation: [-90, 90, 90] },
          fixed: { rotation: [0, 90, 0], scale: [1.5, 1.5, 1.5] },
        },
      },
      groups: [
        { id: "root", name, origin: [0, 0, 0] },
        { id: "weapon", name: "weapon", parent: "root", origin: [0, s(8), 0] },
        { id: "handle", name: "handle", parent: "weapon", origin: [0, s(8), 0] },
        { id: "guard", name: "guard", parent: "weapon", origin: [0, s(8), 0] },
        { id: "blade", name: "blade", parent: "weapon", origin: [0, s(8), 0] },
        { id: "vfx", name: "vfx", parent: "weapon", origin: [0, s(8), 0] },
      ],
      locators: weaponLocators,
    });
  }

  if (input.profile === "modelengine_pet") {
    return modelSpecSchema.parse({
      project,
      groups: [
        { id: "root", name, origin: [0, 0, 0] },
        { id: "vfx", name: "vfx", parent: "root", origin: [0, 0, 0] },
        { id: "body", name: "body", parent: "root", origin: [0, s(3), 0] },
        { id: "torso", name: "torso", parent: "body", origin: [0, s(3), 0] },
        { id: "head", name: "h_head", parent: "torso", origin: [0, s(8), 0] },
        { id: "left_eye", name: "h_left_eye", parent: "head", origin: [s(-2), s(10.5), s(-3)] },
        { id: "right_eye", name: "h_right_eye", parent: "head", origin: [s(2), s(10.5), s(-3)] },
        { id: "left_ear", name: "h_left_ear", parent: "head", origin: [s(-3.5), s(12.5), s(-1.5)] },
        { id: "right_ear", name: "h_right_ear", parent: "head", origin: [s(3.5), s(12.5), s(-1.5)] },
        { id: "left_arm", name: "left_arm", parent: "torso", origin: [s(-2.25), s(6.5), 0] },
        { id: "right_arm", name: "right_arm", parent: "torso", origin: [s(2.25), s(6.5), 0] },
        { id: "left_leg", name: "left_leg", parent: "body", origin: [s(-1.5), s(3), 0] },
        { id: "right_leg", name: "right_leg", parent: "body", origin: [s(1.5), s(3), 0] },
        { id: "hitbox", name: "hitbox", origin: [0, s(6), 0] },
      ],
      locators: [
        { name: "head_fx", parent: "head", position: [0, s(10), s(-3)] },
        { name: "left_hand_socket", parent: "left_arm", position: [s(-2.25), s(3), s(-1)] },
        { name: "right_hand_socket", parent: "right_arm", position: [s(2.25), s(3), s(-1)] },
      ],
    });
  }

  if (input.profile === "quadruped_pet") {
    return modelSpecSchema.parse({
      project,
      groups: [
        { id: "root", name, origin: [0, 0, 0] },
        { id: "vfx", name: "vfx", parent: "root", origin: [0, 0, 0] },
        { id: "body", name: "body", parent: "root", origin: [0, s(5), 0] },
        { id: "torso", name: "torso", parent: "body", origin: [0, s(6), 0] },
        { id: "head", name: "h_head", parent: "torso", origin: [0, s(8), s(-5)] },
        { id: "front_left_leg", name: "front_left_leg", parent: "body", origin: [s(-2), s(4), s(-3)] },
        { id: "front_right_leg", name: "front_right_leg", parent: "body", origin: [s(2), s(4), s(-3)] },
        { id: "back_left_leg", name: "back_left_leg", parent: "body", origin: [s(-2), s(4), s(3)] },
        { id: "back_right_leg", name: "back_right_leg", parent: "body", origin: [s(2), s(4), s(3)] },
        { id: "tail", name: "tail", parent: "body", origin: [0, s(7), s(5)] },
        { id: "hitbox", name: "hitbox", origin: [0, s(5), 0] },
      ],
      locators: [
        { name: "mouth_socket", parent: "head", position: [0, s(7), s(-8)] },
        { name: "back_fx", parent: "torso", position: [0, s(9), 0] },
      ],
    });
  }

  return modelSpecSchema.parse({
    project,
    groups: [
      { id: "root", name, origin: [0, 0, 0] },
      { id: "vfx", name: "vfx", parent: "root", origin: [0, 0, 0] },
      { id: "body", name: "body", parent: "root", origin: [0, s(18), 0] },
      { id: "torso", name: "torso", parent: "body", origin: [0, s(19), 0] },
      { id: "body_upper", name: "body_upper", parent: "torso", origin: [0, s(28), 0] },
      { id: "head", name: "h_head", parent: "body_upper", origin: [0, s(40), s(-2)] },
      { id: "jaw", name: "h_jaw", parent: "head", origin: [0, s(38), s(-4)] },
      { id: "left_arm", name: "left_arm", parent: "body_upper", origin: [s(-9), s(35), 0] },
      { id: "left_forearm", name: "left_middle_arm", parent: "left_arm", origin: [s(-16), s(25), 0] },
      { id: "left_hand", name: "left_hand", parent: "left_forearm", origin: [s(-17), s(13), 0] },
      { id: "right_arm", name: "right_arm", parent: "body_upper", origin: [s(9), s(35), 0] },
      { id: "right_forearm", name: "right_middle_arm", parent: "right_arm", origin: [s(16), s(25), 0] },
      { id: "right_hand", name: "right_hand", parent: "right_forearm", origin: [s(17), s(13), 0] },
      { id: "left_leg", name: "left_leg", parent: "body", origin: [s(-5), s(19), 0] },
      { id: "left_foot", name: "left_foot", parent: "left_leg", origin: [s(-5), s(7), s(-1)] },
      { id: "right_leg", name: "right_leg", parent: "body", origin: [s(5), s(19), 0] },
      { id: "right_foot", name: "right_foot", parent: "right_leg", origin: [s(5), s(7), s(-1)] },
      { id: "weapon", name: "weapon", parent: "right_hand", origin: [s(17), s(13), 0] },
      { id: "projectile", name: "projectile", parent: "vfx", origin: [0, s(18), 0] },
      { id: "hitbox", name: "hitbox", origin: [0, s(20), 0] },
    ],
    locators: [
      { name: "left_hand_socket", parent: "left_hand", position: [s(-17), s(10), 0] },
      { name: "right_hand_socket", parent: "right_hand", position: [s(17), s(10), 0] },
      { name: "projectile_spawn", parent: "projectile", position: [0, s(20), s(-8)] },
      { name: "ground_impact", parent: "vfx", position: [0, 0, 0] },
    ],
  });
}
