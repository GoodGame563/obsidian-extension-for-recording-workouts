# Dynamic slider behavior


This plugin's weight slider now scales dynamically:

- For small weights the max is kept compact (e.g., 20kg -> max 40kg). The slider's max is computed from the current weight and step value.
- When you drag the slider to the end, the control automatically expands the maximum so you can select higher weights.
- The UI draws major ticks using a dynamic CSS variable `--ticks` — this adapts as the maximum changes.

If you want to customize behavior, edit the `computeDynamicMax` function in `main.ts` to tweak thresholds and scaling.

## Blocked-at-max and rebound

When the user drags the weight slider to the very end, the UI now:

- Temporarily adds a visual division (an extra tick) to indicate the slider can expand.
- Disables the slider for a short moment so the user can't immediately set the new maximum.
- Shows a short rebound animation that moves a ghost thumb back to the previous value.
 
## Gradual expansion increments

The slider now expands in small increments (20 kg by default) when the user reaches the end.
This avoids large jumps such as from 40 to 150; instead 40 → 60 → 80 etc. The increment is rounded to the
current `step` value so the slider remains aligned with chosen precision (for example, 0.5 kg step).

If you want a different increment, update the `increment` value in `main.ts` at the expansion point.
- After the animation, the real increased maximum is applied and the slider is re-enabled.

You can tweak the timing and animation in `styles.css` and `main.ts` — set the delay in the `setTimeout(...)` call (default 300ms) or change the easing in the `.rebound::after` rule.

Note: changes by mouse wheel (scroll) no longer trigger the rebound animation — pointer (drag) and keyboard interactions still do. This avoids accidental triggers when the user tries to bump the number quickly with the scroll wheel.

