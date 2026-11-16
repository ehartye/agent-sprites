# Opt-in passive native text planes

`createPhaserUi({ passiveTextPlanes: true, ... })` optionally groups already-admitted passive text paint. Default is false; normal and interactive mounts retain their original paint paths. The portable tree, semantic records, source checks, glyph/object admission and logical fragment budgets are unchanged. This is a native materialization optimization, not a smaller logical budget.

The eligible WebGL path copies consecutive opaque font pixels in their original pass order into a scene-owned nearest-filtered texture. It never infers authority from semantic IDs. Only absolute/text entries, binary source alpha, opacity1, untinted nearest sources, unit source scale and integer geometry qualify. Intrinsic clipping is applied in the plane and stationary viewport clipping stays native. Canvas keeps original glyph images, including Phaser's per-sprite rounding behavior.

Nonunit parent/ancestor alpha, non-normal blending, rotated/fractional transforms, camera follow/bounds/shake, fractional effective camera geometry or changed source filtering fall back. A lifecycle-owned scene prerender eligibility observer handles borrowed transform/filter changes even without a new publication. It does not subscribe to input or change the model.

At most128 active planes and4MiB retained raster RGBA are selected per mount; unsupported/overflow entries keep stock images. Native canvas and GPU storage add corresponding storage beyond the retained raster. During atomic replacement old and candidate resources can coexist until reconciliation retires old consumers. Allocation is owned before native callbacks run, including reentrant disposal. `inspect().native.textPlanes` and `textPlaneRGBABytes` report selected active storage when enabled. Existing immutable borrowed-source identity requirements continue to apply.

Keep the feature opt-in unless exact source-specific WebGL/Canvas fallback pixels, lifecycle behavior and representative timings are verified. Fewer objects alone do not prove better performance. Source closure remains the same16 files, with the pure raster helper internal to ui-runtime.mjs and absent from the public ui-index exports.
