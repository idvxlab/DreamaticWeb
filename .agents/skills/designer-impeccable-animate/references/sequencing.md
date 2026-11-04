# Sequence, interruption and a resolved frame

Give the focal sequence a beginning, a meaningful transformation and a landing. For example, a cropped visual can resolve into separated spatial planes while a shared light sweeps across them; the text can arrive in relation to that transformation instead of being another independent reveal.

## Native animation ownership

CSS transitions suit reversible state changes. Web Animations API suits owned sequences with cancellation, reversing and an explicit currentTime. Keep references to active Animation objects rather than creating a new unbounded set on every pointer event. A state change cancels, reverses or retargets the previous motion deliberately.

An entrance may set its starting visual state only after the enhancement has initialized successfully. Keep the base DOM visible. Treat an interrupted animation as a real state: cleanup must not leave content clipped, hidden or stranded between layouts.

## Coordinated stages

Share a timing language across elements that read as a unit. Offset supporting stages so the focal action stays clear. Bound stagger by the number of meaningful items and the total wait. Use measured travel and consequence to choose duration, rather than applying one delay to every section on a long page.

## Continuous driver

For scroll or pointer input, events update targets; one scheduled frame applies the visual state. Cache geometry and refresh on resize or relevant layout change. Use bounded interpolation, and reset time accounting on resume. Do not start a new frame loop per event. A user pause must remain paused after the stage becomes visible again.

## Inspect the result externally

Observe an early frame, the focal transformation and the resolved frame. Interrupt it, reverse an action, trigger it twice, leave/reenter the viewport and test touch. A correct keyframe declaration is not proof that the intended sequence was ever visible.
