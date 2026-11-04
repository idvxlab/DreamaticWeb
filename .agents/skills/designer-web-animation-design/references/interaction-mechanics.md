# Natural interaction mechanics

## Stable targets

Keep the pointer target stable and animate a visual child to avoid hover flicker. Set transform-origin from the place an overlay or expanding element appears to originate. A small press scale can confirm input immediately; its release should settle rather than queue behind older presses.

## Owned animation

Keep the active Animation object when using Web Animations API. Cancel, reverse or retarget it on the next interaction instead of creating an unbounded sequence. Before replacing a motion, preserve the intended current visual state or explicitly reconcile it to the new one. Account for the finished state separately from transient animation state.

For a dynamic spring, one loop updates position and velocity toward a target. Cap elapsed steps, stop when both displacement and velocity settle, and wake only for new input. For a simple state transition, CSS can perform the interpolation without a custom loop.

## Appropriate input

Pointer hover belongs inside suitable hover/pointer media conditions. Provide a tap, keyboard or deliberate automatic alternative when the same effect carries important content. A touch tap must not leave a control stuck in an irrelevant hover-only state. Focus remains visible even when spatial animation is reduced.

## Rendering budget

Avoid reading layout and writing style repeatedly during one frame. Cache geometry on entry or resize, coalesce high-frequency input, and update only owned elements. Use transforms where appropriate; restrict large blur and filter areas. Do not leave will-change on every node or claim GPU acceleration proves a frame rate.

## Actual playback

Test repeated presses, interrupted opening, pointer leave/reentry, resize, reduced motion and touch. If motion feels wrong, distinguish bad easing, incorrect origin, queued animation and a system that changed the delivered markup. The technique should resolve the observed cause rather than add another effect on top.
