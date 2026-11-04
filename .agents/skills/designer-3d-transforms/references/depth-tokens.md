# Upstream depth tokens in readable form

Values below preserve the supplied 3d-transforms token snapshot. Choose values according to scene scale rather than treating every tier as necessary.

## perspective

| Token | Value | Meaning |
| --- | --- | --- |
| shallow | `1200px` | Minimal 3D effect. Subtle depth perception. Safe for most UI. |
| medium | `800px` | Standard 3D perspective. Card flips, page turns, rotations. |
| deep | `500px` | Pronounced 3D effect. Dramatic transforms, immersive experiences. |
| extreme | `300px` | Maximum depth distortion. Hero animations, showcase moments. |
| flat | `none` | No perspective. 2D transforms only. Use for simple rotations. |

## z-offset

| Token | Value | Meaning |
| --- | --- | --- |
| subtle | `10px` | Barely perceptible depth. Hover states, subtle lifts. |
| small | `20px` | Noticeable lift. Card hovers, focused elements. |
| medium | `40px` | Clear depth separation. Modal dialogs, overlays. |
| large | `80px` | Dramatic depth. Hero elements, featured content. |
| extreme | `150px` | Maximum depth. Breakthrough effects, dramatic reveals. |

## rotation-3d

| Token | Value | Meaning |
| --- | --- | --- |
| flip-horizontal | `{"axis": "Y", "degrees": 180, "use": "card-flip"}` | Full horizontal flip around Y axis. Card flip reveals. |
| flip-vertical | `{"axis": "X", "degrees": 180, "use": "panel-flip"}` | Full vertical flip around X axis. Panel transitions. |
| tilt-forward | `{"axis": "X", "degrees": -10, "use": "hover-state"}` | Slight forward tilt. 3D hover effect. |
| tilt-back | `{"axis": "X", "degrees": 10, "use": "press-state"}` | Slight backward tilt. Press feedback. |
| swing-in | `{"axis": "Y", "degrees": -90, "direction": "to-visible"}` | Door-swing entrance. From -90deg to 0deg. |
| swing-out | `{"axis": "Y", "degrees": 90, "direction": "to-hidden"}` | Door-swing exit. From 0deg to 90deg. |

## transform-origin

| Token | Value | Meaning |
| --- | --- | --- |
| center | `center center` | Default center origin. Symmetric rotations. |
| top | `center top` | Hinge at top. Dropdown, fold-down effects. |
| bottom | `center bottom` | Hinge at bottom. Fold-up effects. |
| left | `left center` | Hinge at left edge. Door swing from left. |
| right | `right center` | Hinge at right edge. Door swing from right. |
| top-left | `top left` | Corner hinge. Page peel from corner. |
| back | `center center -50px` | Origin behind element. For inward rotations. |

## layer-depth

| Token | Value | Meaning |
| --- | --- | --- |
| background | `{"z": -100, "scale": 0.9, "blur": "2px"}` | Far background layer. Parallax, depth of field. |
| base | `{"z": 0, "scale": 1.0, "blur": "0px"}` | Primary content plane. Normal z-position. |
| elevated | `{"z": 30, "scale": 1.0, "blur": "0px"}` | Slightly elevated. Cards, interactive elements. |
| floating | `{"z": 60, "scale": 1.02, "blur": "0px"}` | Floating above content. Modals, dialogs. |
| overlay | `{"z": 100, "scale": 1.05, "blur": "0px"}` | Top layer. Tooltips, popovers, focus elements. |

## backface-visibility

| Token | Value | Meaning |
| --- | --- | --- |
| hidden | `hidden` | Hide element when rotated away. Card flips with different front/back. |
| visible | `visible` | Show element backface (mirrored). Single-sided elements. |

## preserve-3d

| Token | Value | Meaning |
| --- | --- | --- |
| preserve | `preserve-3d` | Children maintain 3D positioning. Nested 3D transforms. |
| flat | `flat` | Children flattened to parent plane. Default, safer. |
