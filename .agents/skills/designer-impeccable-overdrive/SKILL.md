---
name: designer-impeccable-overdrive
description: Build an ambitious, theme-specific visual or interactive moment using browser-native capabilities, including spatial scenes, cinematic reveals and procedural canvas/WebGL. Use when a marketing/showcase brief explicitly seeks a memorable, immersive result.
---

# Make one moment extraordinary

Define what would make this audience notice and understand the work. On a marketing or showcase surface, that can be sensory: a cinematic reveal, a procedural field, a scroll-driven transformation or a spatial scene responding to the visitor. On a functional interface, the same ambition may live in continuity, interruption and responsive state changes. Do not change the product's capabilities merely to add spectacle.

Consider two or three genuinely different approaches internally, then choose from the already established brief, visual world and runtime. If a direction is explicitly pinned, execute it. Do not pause an otherwise clear generation to run a command menu or obtain a second direction approval.

## Make ambition visible

Choose one focal effect with a readable setup, a significant transformation and a strong resting frame. Carry one material idea through it. A card moving three pixels or a page of identical fade-ups does not fulfill a requested cinematic hero. Preserve hierarchy, real content and usable navigation throughout; decoration cannot rescue a weak static composition.

Choose a suitable native technique:
- Layered CSS perspective and coordinated transforms for spatial compositions.
- Masks, clip-path, bounded blur/light and occlusion for an authored reveal.
- Web Animations API for cancellable sequences, springs implemented with a bounded integrator, or state continuity.
- Dynamically created Canvas/WebGL for a procedural material that CSS cannot express convincingly.
- Scroll progress or pointer position as a coherent scene driver, with touch and keyboard alternatives.

Use [native effect recipes](references/native-effects.md) for implementation mechanics and [quality and fallback](references/quality-and-fallback.md) to keep the result usable. Preserve the intended optical/spatial result when translating a library-based recipe. Do not assume external libraries, unsupported assets or plugins exist, and do not silently substitute an unrelated weaker effect.

## Engineer the finish

Default content is visible before enhancement. Detect capabilities; retain a composed alternative on initialization or context loss. Give ongoing motion an intentional quiet state and pause behavior. Scale detail and resolution to the viewport. Bound particle counts, filters and rendering work; pause offscreen work and stop when the document is hidden. Keep pointer response smooth without a layout read and write for every event.

Target smooth rendering on the actual device; a declared transform or canvas is not evidence of a frame rate. Reduced motion receives an intentional lower-motion composition. No interaction depends solely on hover, sound or a device permission.

Judge against the brief: does the moment belong to this brand, remain legible on mobile, feel coherent when interrupted, and lose something meaningful when removed? Testing must examine real playback, not just the presence of keyframes in source. Do not add an autonomous critic or repeat generation until an invented score passes.
