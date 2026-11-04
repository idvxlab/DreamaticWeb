---
name: designer-3d-transforms
description: Create perceptible spatial depth with CSS perspective, preserve-3d, layered z positions and coordinated rotation. Use for spatial hero compositions, card flips, page turns or immersive interface motion; distinguish CSS depth from a real product model.
---

# Compose real spatial relationships

Place perspective on a containing stage and preserve-3d along the relevant nested transform chain. Give the layers deliberate z positions and a meaningful transform origin. Rotation alone without a viewing perspective is not a complete depth composition. Avoid ancestors that unintentionally flatten or clip the scene. Size an absolutely positioned scene with an explicit responsive width and height or aspect ratio. For example, width:min(100%, 560px) plus aspect-ratio:1 gives the stage area; max-width alone can collapse to zero when its children contribute no intrinsic size.

## Choose depth by scale

Use the upstream depth scale as a starting point: perspective 1200px is shallow, 800px medium, 500px deep and 300px extreme. Typical z offsets are 10/20/40/80/150px. A large scene needs values proportional to its viewport; small offsets on a large hero may be imperceptible.

Use [depth tokens](references/depth-tokens.md) for the complete values and origins. These are available as Markdown rather than an inaccessible external token file.

## Make the requested effect visible

For a spatial showcase, author a composed focal scene with distinct foreground, content and background planes, a visible reveal or coordinated rotation, and a strong resolved frame. Hover tilt is useful supporting behavior; it is not the whole deliverable when the brief asks for a prominent animated hero.

For a flip, give each face proper backface visibility and maintain access to its content. For a page turn, use a hinge that matches the intended edge. For pointer-driven depth, cap rotation, interpolate toward the target and reset on leave. Support touch activation or an intentional automatic sequence instead of relying on hover alone.

Use [spatial patterns](references/spatial-patterns.md) for a reliable stage, interactive tilt and layered composition. Keep label text readable throughout. A procedural assembly or abstract sculptural scene is a visual metaphor; do not describe it as an accurate 3D model of a supplied product without actual geometry.

## Keep motion usable

Preserve a coherent flat composition for reduced motion and initialization failure. Stop nonessential loops offscreen or in hidden tabs, expose pause for persistent presentation motion, and restore a sensible state after repeated interaction. Limit promoted layers and expensive filters. Native transforms and JavaScript are sufficient for many spatial scenes; do not output imports or assumed libraries that are absent from the runtime.

Verify perspective, actual transforms, clipping and readability in the delivered runtime. A static frame or the presence of translateZ in source does not by itself establish a convincing spatial effect.

## Required references

Apply these core methods before implementing this Skill: [spatial patterns](references/spatial-patterns.md). Other linked references support specific techniques and remain conditional.
