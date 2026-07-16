# Pack research findings

This report records structural observations only. The purchased model and texture assets were extracted to a temporary directory for analysis and are not copied into this repository.

## Dataset

| Pack | Relevant material | Main lesson |
| --- | ---: | --- |
| Fairy Animated Weapons & Tools | 68 Java item model JSON files, 86 PNG files, 24 animation metadata files | Weapon silhouette, state variants, display transforms, animated/emissive textures |
| Winter Pets 2023 | 5 ModelEngine entity `.bbmodel` files, 5 icon `.bbmodel` files, 11 textures | Compact pet rig, readable silhouette, idle/walk/skill/death animation, item icons |
| Experience Golem 1.1 | One 150-cube `.bbmodel`, 28-group rig, 6 animations, 808 keyframes | Large combat rig, articulated hands/weapon/props, skill timing and projectile/VFX synchronization |

## Weapon findings

- Visual inspection shows a tightly packed atlas with a restrained white/gold/dark palette. Thin highlights and dark edge pixels keep ornate parts readable at Minecraft scale.
- The 34 unique Fairy model names contain 9–51 cubes, averaging about 38 cubes.
- Approximately 31.6% of cubes are extremely thin and 51.3% are flat on at least one axis. Thin geometry is a major part of the ornate silhouette.
- Rotations use a disciplined angle vocabulary: `0`, `±22.5`, and `±45` degrees, mostly around X/Y with fewer Z rotations.
- Item state models change only the necessary subset. Bow draw states change 2–18 elements; charged crossbow changes 8; opening chest changes 13. This favors reusable state variants instead of rebuilding unrelated geometry.
- First-person, third-person, GUI, ground, head, and fixed transforms are all intentionally authored. A good item model is incomplete without display transforms.
- Animated textures are vertical frame strips, commonly using frame time 2. Emissive companions use a separate glow texture.
- Frame strips are mostly transparent and change only the glowing motif, which reduces visual noise and makes animation economical.

## Pet findings

- Pet atlases use compact color clusters and strong light/dark separation so eyes, face, clothing, and held props remain readable on small models.
- ModelEngine pets use 21–34 cubes and 16–20 groups: enough articulation without excessive geometry.
- Common hierarchy: model root, `vfx`, `body`, `torso`, `h_head`, eyes/ears, limbs, and `hitbox`.
- `h_`-prefixed head/eye/ear groups provide integration points for head-oriented behavior.
- Animation set is consistent: idle, 0.5-second walk loop, one signature skill, and death.
- Blinks use scale keyframes on eye groups. Skill props live under `vfx` and are hidden/revealed with scale keys.
- Separate Java item icon projects contain display transforms and simplified geometry.

## Golem findings

- The golem uses 150 cubes, 28 groups, two 256×256 textures, and six animations.
- It separates upper/lower limbs, hands, fingers, jaw, staff, potions, projectile prop, and hitbox.
- Combat motion is layered across torso, head, arms, legs, hands, weapon, and props instead of rotating only one bone.
- Animation markers/timings matter: external MythicMobs delays align with impact, throw, and projectile release moments.
- Rotation dominates the 808 keyframes, while position adds weight and scale controls visibility or emphasis.

## MCP changes derived from the research

- Professional rig presets for weapon, ModelEngine pet, quadruped pet, and humanoid golem.
- Locator/attachment support for hands, blade tips, projectiles, mouth, ground impacts, and VFX.
- Minecraft item display transforms in the declarative model schema.
- Animated texture metadata: UV frame size, frame time/order/interpolation, wrapping, render sides, and emissive/additive modes.
- Advanced keyframes with Molang values, two data points, bezier handles, and timeline markers.
- Model audit for geometry, UVs, textures, rigging, animation loops, texture strips, and display transforms.
- Local `.bbmodel` opening, active-format capability discovery, and format-aware export.

## Version 0.3 visual-loop findings

- Structural validity is not the same as visual quality. A model can pass UV/rig checks while nested bone rotations make a tail appear detached.
- Pet generation now keeps static tail shaping on cubes and reserves bone rotation for animation, preventing compounded transforms.
- The pet generator targets 40–55 semantically named cubes, 18–24 groups, layered eyes/cheeks/muzzle, three-layer paws, articulated ears/tail, three skill sockets, and idle/walk/skill/death coverage.
- `blockbench_quality_report` reports a structural score and explicitly marks `visual_review_required`; `blockbench_capture_turntable` provides the required hero/front/side/back evidence.
