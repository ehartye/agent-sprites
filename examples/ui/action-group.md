# Measured action-group allocation

This reference covers the historical independent low-level planner. For common
dialogs, themes and extensions, use the
[shared native component contract](native-components.md). Its
release (0.96.0) includes this planner in a complete 16-file software closure plus
manifest, alongside stock components/families, layout, interaction and native
Phaser painting and owned resource lifetimes. Games retain authored models, action authority, assets,
resolution mappings and application-specific extension renderers. Each game accepts
its own pin through its own native checks.

`planActionGroup` is a pure browser-safe export from the independent
`server/build/ui-action-group.mjs`. UI builds copy that file unchanged and name it
in `sprite-manifest.json` as `files.uiActionGroup: "ui-action-group.mjs"`; the owned
build marker lists it too. It has no imports and is not part of `ui-runtime.mjs`.

Used independently, the planner shares allocation calculations in caller units.
Games keep semantic models, labels and payload references, widgets, text wrapping, appearance, focus,
input routing, save authorization and resource lifecycle. It supplies no body
grammar, theme engine, paint, camera mapping or minimum touch-target default.

## Independent software pin

This single-file pin applies to independent planner use. Shared framework consumers
pin the complete bundle and verify its software manifest as described in the
[UI software pin guidance](README.md#shared-native-components).

For bundled code, copy the complete canonical Git blob from a clean producer
revision to `src/vendor/agent-sprites/ui-action-group.mjs`, outside `public/`.
Record its producer version, repository, commit, source path, `artifact: "git-blob"`
and SHA-256 in a separate receipt such as `ACTION_GROUP_VERSION.json`. Preserve the
blob bytes with the exact `.gitattributes` entry
`src/vendor/agent-sprites/ui-action-group.mjs -text`.

Default game builds verify the committed module and receipt without a producer
installation. An explicit upgrade validates the clean source and canonical blob
before replacing the new pair. Preserve the old `ui-runtime.mjs`, its receipt and
historical font/skin artifacts byte-for-byte; do not re-export this capability
through the core or regenerate art to upgrade software. See the existing
[bundler and pin convention](README.md#bundlers-and-public-assets).

```js
import {planActionGroup} from './vendor/agent-sprites/ui-action-group.mjs';
```

## Input and validation

Every field below is explicit. Measurements, group width, gaps and insets are
finite nonnegative numbers in the caller's units.

```ts
type ActionMeasure = {
  id: string;
  preferredWidth: number;
  minWidth: number;
  minHeight: number;
  fixedHeight?: number;
};
type ActionGroupInput = {
  actions: readonly ActionMeasure[]; // original semantic/controller order
  visualOrder: readonly string[];
  fallbackOrder: readonly string[];
  width: number;
  insets: {top:number; right:number; bottom:number; left:number};
  gap: number;
  rowGap: number;
  policy: 'equal-max-fit' | 'authored-width-end';
};
```

Objects must be ordinary or null-prototype records; arrays must be ordinary dense
arrays. Missing required fields, unsupported own keys (including symbols), class
instances, duplicate/empty IDs and nonfinite derived arithmetic are rejected.
Each order must be an exact permutation of all IDs, including actions the game
marks disabled. Empty arrays with empty orders are valid; independently valid
padding is retained, but allocation, occupied height and overflow are zero.

`equal-max-fit` requires `minWidth === 0`. `authored-width-end` requires
`fixedHeight` and `preferredWidth >= minWidth`. Unsupported positive native
minima and below-minimum authored reservations are refused rather than silently
clamped. The API accepts no labels, enabled state, payload, appearance or body.

## Result

```ts
type ActionGroupPlan = {
  format: 'agent-sprites/action-group@1';
  semanticIds: readonly string[];
  paintIds: readonly string[];
  width: number;
  insets: {top:number; right:number; bottom:number; left:number};
  gap: number;
  rowGap: number;
  allocation:
    | {kind:'empty'}
    | {kind:'native-equal'; arrangement:'row'|'grid'|'stack'; columns:number;
       rows:readonly (readonly string[])[]}
    | {kind:'authored'; arrangement:'row';
       slots:readonly {id:string;x:number;y:number;width:number;height:number}[]};
  occupiedHeight:
    | {known:false;minimum:number}
    | {known:true;value:number};
  overflow:
    | {known:false;reason:'native-measurement-required';insetDeficit:number}
    | {known:true;left:number;right:number};
};
```

`semanticIds` preserves input action order. `paintIds` follows the selected visual
or fallback order. Output envelopes, arrays, rows and slots are owned copies and
frozen; the planner does not freeze caller records. No game payload is copied.

## Native equal-width policy

Let `inner = width - left - right`. A row fits only when every preferred width is
at most `floor((inner - gap * (count - 1)) / count)`. Otherwise select the largest
fitting column count greater than one, or stack. A fitting row uses `visualOrder`;
grid/stack uses `fallbackOrder`. An incomplete grid row retains its configured
columns. A negative inner budget selects stack and reports the inset deficit.

```js
const plan = planActionGroup({
  actions: ['export','accept','cancel'].map(id => ({
    id, preferredWidth:50, minWidth:0, minHeight:22,
  })),
  visualOrder:['export','accept','cancel'],
  fallbackOrder:['cancel','export','accept'],
  width:175, insets:{top:11,right:8,bottom:8,left:8},
  gap:8, rowGap:8, policy:'equal-max-fit',
});
// allocation: {kind:'native-equal', arrangement:'grid', columns:2,
//              rows:[['cancel','export'],['accept']]}
// occupiedHeight: {known:false, minimum:71}
```

Width182 admits a three-action row; width181.5 still selects grid because the
equal-share floor is49. Width73 selects stack. These results choose topology,
not child rectangles. Native layout retains final assigned widths, integer
remainders and label wrapping; do not stretch the incomplete grid row manually.

The minimum height is vertical insets plus each row's maximum `minHeight` and
inter-row gaps. Actual height and overflow remain unknown even if an action
declares `fixedHeight`. Build and measure the selected native tree at its actual
width before allocating dialog body/footer space. Replan when that width changes.

## Authored widths at the end

Starting at `width - right`, walk visual IDs backwards, subtract each preferred
width for its x and then subtract gap. Slot y is top; height is
`max(fixedHeight, minHeight)`. Return slots in visual order. Occupied height is
top plus maximum slot height plus bottom. Left inset remains explicit metadata;
it is not another cursor term.

```js
const plan = planActionGroup({
  actions:[
    {id:'overwrite',preferredWidth:140,minWidth:22,minHeight:22,fixedHeight:22},
    {id:'cancel',preferredWidth:64,minWidth:22,minHeight:22,fixedHeight:22},
  ],
  visualOrder:['cancel','overwrite'], fallbackOrder:['cancel','overwrite'],
  width:372, insets:{top:0,right:8,bottom:2,left:8},
  gap:6, rowGap:6, policy:'authored-width-end',
});
// semanticIds: ['overwrite','cancel']
// slots: [{id:'cancel',x:154,y:0,width:64,height:22},
//         {id:'overwrite',x:224,y:0,width:140,height:22}]
// occupiedHeight: {known:true,value:24}
// overflow: {known:true,left:0,right:0}
```

At width100, x positions remain -118 and -48, with left overflow118. The planner
does not shrink, wrap or clip authored controls. Overflow compares actual slot
boxes against outer `[0,width]`, not the inset or body area; x4 with left inset8
has zero outer overflow. `rowGap` is retained metadata and does not affect this row.

## Native binding and verification

Consume the returned topology or slot positions in the existing native owner;
feeding the plan into an unchanged local fit/end allocator repeats ownership.
Keep cancel/initial focus, disabled actions, exact payload references and local
appearance roles intact. Theme changes cannot sort actions or alter authorization.

Producer tests live in the existing `tests/engine/ui.test.js` and
`tests/cli/ui-build.test.js`. Consumers need their own native measurement, ordinary
input, clipping, focus/cancel and current-save transaction witnesses. This module
does not itself prove a game's native adoption of the shared components, extension
lifecycle or faster CI.
