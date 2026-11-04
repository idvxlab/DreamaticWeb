# Native material recipes

These recipes preserve the optical or spatial intention without requiring an unprovided package. Select the material needed by the concept, not every effect in the list.

## A spatial hero

Use a perspective stage, a visible foreground silhouette, content plane and background plane. Choreograph a change from one readable arrangement to another, with a shared light or masking system. Keep meaningful text readable and interaction targets stable. Use bounded pointer influence for responsive depth and an intentional touch/time-driven version.

## Cinematic reveal

Let occlusion, clipping or a shared element explain what is revealed. Use a strong composition at the beginning and end, with real content available throughout. A controlled blur or light sweep can support a material, but should not obscure the message or become a full-screen recurring cost. Reversing or repeating an action must land cleanly.

## A procedural field

Create the canvas dynamically in a sized container. Check for a 2D or WebGL context before starting. Keep the meaningful DOM content separate. A renderer owns its buffers, uniforms, resize, time and disposal. Do not assume Three.js/OGL objects exist; direct Canvas/WebGL is valid when it can express the desired material. Keep shader compile and context-loss failures recoverable.

Use aspect, scene time, progress and pointer as a coherent set of drivers. Cap drawing-buffer size and detail density according to visible area. A full-screen field does not need unlimited particles or geometry. Image textures require an actual permitted loading path; opaque-origin texture failures should retain the original image and a texture-free composition.

## Interrupted motion

Use Web Animations API to own and cancel or reverse an effect. For spring-like motion, preserve velocity in a bounded integrator and cap elapsed steps after suspension. Use one active clock per scene. Pointer/scroll handlers update targets and schedule work, avoiding a new loop or animation for every event.

## Dependency honesty

A missing library is a missing implementation dependency. Preserve the intended behavior with available primitives when feasible. If a required technique genuinely cannot be delivered, identify that limit in the appropriate response rather than presenting an unrelated small hover effect as the requested result. Do not install packages or fetch scripts as an implicit part of design guidance.
