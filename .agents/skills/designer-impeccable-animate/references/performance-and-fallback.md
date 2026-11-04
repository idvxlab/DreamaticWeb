# Bound animation work

Prefer changes that avoid repeated layout, but treat the whole scene as the performance unit: large layers, masks, filters and pixel count can still be costly. Isolate expensive work to the focal region. Use will-change for known work rather than promoting every element.

Use an IntersectionObserver to suspend nonessential loops outside the viewport, and document visibility to suspend hidden-tab work. Keep the user's own pause state separate from visibility. Handle the reduced-motion preference at initialization and when it changes. Restore an intentional lower-motion state without leaving elements invisible.

Provide a real pause/resume control for persistent presentation motion. Its label and state should agree. Use stable semantic buttons with event listeners and keyboard access; a moving scene must not move the hit target away from a user.

Native animation can be paused and resumed as a group. For a procedural clock, cancel the scheduled frame, retain scene time, and reset the previous timestamp on resume. Bound the elapsed step so returning to a suspended tab does not cause a huge jump.

Desktop, touch and reduced-motion variants should communicate the same content and hierarchy. The simpler path is an authored alternative, not an empty container. Testing should inspect frame stability and actual playback on target devices; do not invent measurements.
