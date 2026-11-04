# Procedural visual material

Use procedural rendering for a visual that genuinely needs a field, distortion, light or a material simulation. It is a background or focal artwork; meaningful text and actual product media remain semantic content. Do not label an invented shape as precise product geometry.

Create the rendering canvas dynamically from the inline script and append it to a sized, positioned container. Treat context creation as fallible. A canvas-based image effect also requires permission to use its texture: an ordinary displayed image is not proof that an opaque-origin WebGL context can upload it. If texture access fails, preserve the original image and use a texture-free procedural alternative that still belongs to the concept.

## A small, complete renderer

Own context creation, shader compilation/linking, geometry/buffer setup, uniforms, resize, frame updates and disposal. Check compile/link results. Avoid undefined library globals. For a full-screen field, a small mesh with time, progress, aspect and pointer uniforms is often enough; a full scene engine is justified only when actual geometry requires it.

Use a coherent driver for the scene and the surrounding DOM. Keep the content colors legible as the field changes. Bound the drawing-buffer resolution using viewport size and an explicit device-pixel-ratio cap. Resize only when dimensions change, not every frame. Limit geometry, particle density and shader work according to the scene's visible area.

## Lifecycle

Pause when the stage is offscreen or document.hidden, and respect a user pause state. Handle context loss by stopping and restoring a composed fallback; restore rendering only when initialization actually succeeds. Reduced motion can use a frozen procedural frame or a deliberate static composition. Clear or release obsolete resources when replacing a scene.

## Judge the material

The output should have a characteristic spatial, optical or temporal behavior. A canvas that merely exists, a generic particle cloud and a declared WebGL context do not prove the requested effect. Test visible playback, legibility, initialization failure, resize, repeat interaction and target-device performance outside the generation stage.
