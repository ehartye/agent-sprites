# Shared geometry project format

The approved third milestone introduces a versioned storage representation while retaining expanded version 1 as the default interchange snapshot. It shares immutable parameter trees; every frame retains independent shape identity, style, order and history.

## Representation

Version 2 retains the version 1 project metadata and cell metadata. A top-level geometry dictionary replaces repeated shape type/parameter pairs:

```json
{
  "version": 2,
  "geometry": {
    "g0": { "type": "polygon", "params": { "points": [{"x":1,"y":1},{"x":6,"y":1},{"x":1,"y":6}], "filled": true } }
  },
  "cells": {
    "0,0": { "name": "idle", "reference": null, "shapes": [
      { "id": "s1", "name": "ear", "geometryRef": "g0", "color": "#de9e58", "zIndex": 0, "visible": true }
    ] },
    "0,1": { "name": "blink", "reference": null, "shapes": [
      { "id": "s2", "name": "ear", "geometryRef": "g0", "color": "#de9e58", "zIndex": 0, "visible": true }
    ] }
  }
}
```

The fragment omits ordinary required grid/dimension/palette fields for readability. Dictionary IDs follow deterministic first encounter order over canonical row-major cells and shape paint order. Equality uses type and canonical JSON parameter values: object key order is irrelevant, array order is significant. Colors, names, IDs, visibility and z-order remain per instance. Unchanged room/background shapes therefore share geometry just as character pieces do.

Validate dictionary keys and references, cell/grid bounds, supported JSON values and depth, unique cell-local IDs/names, and expanded work budgets before allocating the model. Reject missing references and malformed records clearly. Keep existing supported prototype-like animation group names as ordinary explicit entries; they never become geometry dictionary keys. No executable metadata, proxies or in-place migration.

## Runtime and edits

Load each dictionary parameter tree once, validate its retained surface/layer state and deeply freeze it. Loaded instances reference that immutable tree. The params accessor remains enumerable so existing shape spreads and history snapshots retain the established public shape contract; private sharing state must not leak into JSON or snapshots.

A parameter replacement detaches that instance. Direct mutation paths explicitly request a mutable owned copy before modifying coordinates, nested points or secondary colors. Audit Cell.updateShapeParams/recolorShape and CellManager shift/mirror/rotate fast paths, plus all handler/transform helpers. Existing setters that replace a cloned parameter tree already detach. Clone/copy may share frozen geometry; mutable source parameters still deep-copy. One frame's move, recolor, layer transform, clear/delete, undo or redo cannot affect another frame.

Project.toJSON() still returns independent expanded V1 data. Add toSharedJSON() for deterministic V2 and toStorageJSON() that preserves the project's selected storage format. Serialization of already shared trees memoizes immutable parameter identities, avoiding repeated canonicalization of the same large background for every frame. It does not first construct an expanded project snapshot.

## Integration and compatibility

Missing version or version 1 files retain their existing loader/output behavior. Version 2 loads directly without first expanding/cloning each reference. New file imports validate off-thread and write shared snapshots, so activation and draft persistence retain compact models. New imports choose shared storage internally; existing V1 sessions stay V1 unless explicitly converted. Restart/open/save/copy must preserve metadata and chosen storage format without schema migration.

The new import path must also intern incoming V1 parameters during hydration, before constructing a second complete expanded parameter graph. An explicit shared-geometry loading option can reuse unique raw parameter trees and choose shared storage while ordinary V1 loading remains unchanged. Compacting only after an expanded model has been fully cloned would retain the peak-memory bottleneck this stage is intended to address. JSON parsing still retains a complete incoming document; measure that cost honestly.

Expose explicit shared/expanded project download/save and optional build artifact format, preserving expanded defaults for existing external consumers. Browser editable download and save honor the current selected storage format: newly imported shared projects remain compact, and existing V1 sessions remain expanded. Keep an explicit expanded option for older consumers. Save a loaded V2 project in V2 by default. Keep raster/atlas/normal output unchanged; ordinary frame retrieval returns a complete bounded editable cell regardless of internal storage format. Never overwrite an imported source as a side effect of activation.

## Acceptance

- Deterministic V2 bytes, complete V1 semantic round trip and malformed/budget rejection.
- Shared parameter identity after load and clone; frame-local edits, copy, transforms and history isolation; imported ID reservation.
- Metadata parity for groups/timing/direction/one-shot, shape layers/surfaces/lighting, normals, reference/pivot/review and construction replay.
- Pixel-identical native rendering and atlas metadata before and after compact round trip, including partial alpha and erasure.
- New import, compact draft restart, copy, explicit download/save/build and legacy tests pass.
- Real detailed animation measurements disclose expanded versus compact bytes, parameter instances versus unique trees, peak memory, first usable frame, later frame/edit latency and browser transfer/cache/render counts. No constant-memory or all-platform claim without evidence.
- Compare minified V1 and V2 as well as gzip sizes; whitespace removal is a separate saving and must not be attributed to geometry sharing.
