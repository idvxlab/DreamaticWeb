# Build a coherent 3D stage

Perspective belongs on the containing stage. The transformed objects occupy its 3D space; preserve-3d belongs on intermediate containers whose children must retain separate depth. Keep any clipping surface separate when an overflow or compositing choice would flatten the scene.

```css
.stage { position:relative; width:min(100%, 560px); aspect-ratio:1; perspective:800px; perspective-origin:50% 45%; }
.assembly { transform-style: preserve-3d; }
.back { transform: translateZ(-100px) scale(1.1); }
.middle { transform: translateZ(0); }
.front { transform: translateZ(60px); }
```

These classes define relationships, not a finished artistic direction. Choose the silhouette, material, scale and staging from the subject. For a focal hero, coordinate the planes through a significant spatial transformation and a readable landing; do not stop at a tiny hover lift.

## Flip and hinge

Put front and back faces in the same containing block with backface-visibility:hidden. Rotate the back by 180deg, then rotate the shared parent to reveal it. A page turn uses a meaningful edge origin. Keep both states accessible through a real control and avoid trapping focus in an invisible face.

## Pointer tilt

Normalize pointer position using cached stage bounds. Map it to bounded rotation values and interpolate toward the target in one scheduled update. Reset on leave. Do not measure and write layout on every raw event or start a second clock per move. Touch can toggle a state or use a designed automatic entrance instead.

## Depth and legibility

Keep meaningful text on a readable plane, align its apparent scale with its role and avoid clipping important content at extreme perspective. Layer scale compensations are artistic choices, not evidence of actual product dimensions. An abstract assembly must not be presented as an exact engineering model.

## Reduced motion and lifecycle

Compose the flat state first. Under reduced motion retain its hierarchy and useful state feedback while limiting travel, rotation and loops. Pause ongoing presentation motion offscreen or in hidden tabs and keep a user's explicit pause state. Reset time accounting on resume so the scene does not jump. Verify matrix/perspective, visible composition and interaction in preview and after an editor round trip.
