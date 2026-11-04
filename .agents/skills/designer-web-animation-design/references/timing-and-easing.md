# Timing for the job

| Job | Useful starting range |
| --- | --- |
| Immediate micro-feedback | 100–150ms |
| Ordinary tooltip, menu or state transition | 150–250ms |
| Modal or drawer | 200–300ms |
| Deliberate marketing focal sequence | Based on its staging, distance and readable landing |

Large travel and significant changes may need more time than small feedback. Elements moving as a unit should feel coordinated. Fast repeated actions should not make users wait through an entrance each time.

## Easing material

- Arrivals: cubic-bezier(0.215, 0.61, 0.355, 1) or a stronger cubic-bezier(0.19, 1, 0.22, 1) when the motion earns it.
- On-screen relocation: cubic-bezier(0.645, 0.045, 0.355, 1) for a deliberate acceleration/deceleration.
- Quiet hover or color response: ease can be enough.
- A constant-speed mechanism, ticker or progress display may use linear; ordinary spatial feedback usually needs a different curve.

Avoid applying bounce by reflex. A spring is useful when a gesture is interrupted and retained velocity explains the response. Damping and stiffness describe a physical model; their numeric meaning depends on that model, so do not translate library presets blindly into another implementation.

Keep the meaningful default visible. Reduced motion reduces travel and nonessential loops while preserving a readable state change. A marketing entrance and an everyday menu are different contexts; do not turn a short UI timing guideline into a universal ceiling on expression.
