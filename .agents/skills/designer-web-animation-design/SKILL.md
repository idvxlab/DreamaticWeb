---
name: designer-web-animation-design
description: Design natural, interruptible web motion through purposeful easing, duration, springs and consistent interaction states. Use for animation refinement, gesture/feedback behavior and polished transitions; scale marketing focal sequences separately from routine UI timing.
---

# Make web animation feel right

Determine whether an element enters, moves within the screen, changes state or repeats continuously. Tie its motion to that job. Frequent actions must feel immediate; an occasional marketing entrance may be more elaborate. A showcase brief still needs a clearly visible authored focal effect—fast tooltip rules are not a ceiling for its hero.

## Timing and easing

Use natural deceleration for arriving elements, ease-in-out for on-screen movement and a gentle asymmetric ease for hover or color changes. Use constant speed only when it describes the material, such as a rotating mechanism or progress indicator. Avoid a slow start that delays feedback.

Keep micro-feedback around 100–150ms, ordinary overlays and state changes around 150–300ms, and scale with distance and consequence. Marketing sequences can be longer when their staging earns attention. Elements perceived as a unit share a timing language. Exit can be faster than arrival, without making dismissal abrupt.

Consult [timing and easing](references/timing-and-easing.md) when choosing concrete curves. Treat these as design decisions, not arbitrary parameters to sprinkle over every element.

## Interruptible behavior

A repeated action should update an animation's target or reverse it, not stack independent timelines. Use a spring when preserving velocity makes a drag or interruption feel physical; CSS transitions are often sufficient for a bounded state change. Keep bounce subtle and justified. Native JavaScript animation can provide cancellation and reversal without assuming a React motion library.

Use [interaction mechanics](references/interaction-mechanics.md) for transform origins, flicker-free hover, springs and interruption. Keep the pointer target stable while its visual child moves. Touch and keyboard need real equivalent actions.

## Rendering and accessibility

Prefer properties that avoid repeated layout, but measure rather than asserting that every transform is free. Bound filters and blur. Use will-change only for an active or imminent animation, not on the entire document. Keep continuous work proportional to the viewport, stop hidden/offscreen work and avoid per-frame UI-state rerenders.

Provide a reduced-motion path that reduces spatial travel while preserving visible content and understandable state. Stop nonessential loops and honor pause. Keep hover-only behaviors under suitable pointer media queries and provide touch alternatives.

This Skill supports implementation within the current task. Do not emit an initial readiness greeting, wait for another user question, or replace the requested deliverable with an animation-review table. When reviewing is actually requested, make before/after differences explicit. Actual playback, repeated use and device tests decide whether the result feels smooth.

## Required references

Apply these core methods before implementing this Skill: [interaction mechanics](references/interaction-mechanics.md). Other linked references support specific techniques and remain conditional.
