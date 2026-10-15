# Shared native components: producer candidate

This unreleased producer candidate implements the approved shared component contract.
Import `ui-index.mjs` in the game; import `ui-software.mjs` only in Node build/sync code.
The browser closure consists of eight `.mjs` files and eight matching `.d.mts` files.
It imports neither Node nor a Phaser package. The game continues to provide its installed
Phaser 4.2.1 scene. Historical `ui-runtime.mjs` and `ui-action-group.mjs` APIs are unchanged.

```js
// Node only; works without Canvas, SQLite, image export, or the art build pipeline.
import {publishUiSoftware} from '../../server/build/ui-software.mjs';
const {manifest, receipt} = publishUiSoftware({output: 'src/vendor/agent-sprites-ui'});
// Verify every manifest filename, length and hash during consumer synchronization.
// The producer identity hashes the version and complete ordered file-integrity map.
```

The publisher refuses modified/missing previously owned software, unowned filename
collisions, malformed ownership manifests and linked outputs. It preserves unrelated
artwork and never rewrites its provenance. It validates old ownership before writing,
publishes the new manifest last, and does not retry failed filesystem writes. A failed
write needs reconciliation before another publication. The manifest is an integrity
receipt; authenticity still requires the coordinator's accepted producer source identity.
Existing UI art builds additionally emit this bundle, with `uiRuntime`, `uiActionGroup`
and all historical art/metadata aliases preserved. New aliases use camel case (for
example `uiPhaserRuntime`, `uiIndexTypes`, `uiSoftwareManifest`). Build ownership and
integrity receipts include every software file.

## Assets, contexts and the single game router

```js
import {createPhaserUi, defineTheme, button} from './vendor/agent-sprites-ui/ui-index.mjs';

const colors = {
  focus: '#ffffff', hover: '#ffff00', pressed: '#ff0000', disabled: '#777777',
  selection: '#444444', caret: '#ffffff', selected: '#333333',
  track: '#111111', fill: '#00ff00', indicator: '#00ff00',
  separator: '#777777', adjust: '#ffffff'
};
const theme = defineTheme({version: 1, id: 'app:theme',
  fonts: {body: {font: loadedNormalizedFont}},
  roles: {button: {font: 'body', tone: 'cream', colors,
    alternatives: [{kind: 'flat', color: '#123456'}]}}
});
const ui = createPhaserUi({scene, theme, ports: {
  resolveAsset({kind, id, tone}) {
    // Pure lookup in the game's existing immutable asset cache.
    return {ownership: 'borrowed', texture: assetCache.lookup(kind, id, tone), sourceIndex: 0};
  },
  attachContext({context, parent}, scope) {
    // Reuse the game's camera/container mapping. This parent must realize exactly
    // context.localToPhysical, including origin, viewport and Canvas rounding policy.
    return {ownership: 'borrowed', parent: contextOwners.parentFor(context, parent)};
    // For a newly requested pane: register partial allocations with scope immediately,
    // then return {ownership:'owned', parent:pane.parent, release:()=>pane.release()}.
    // Register each allocation once, either via scope or the returned lease.
  }
}});
const context = {id: 'app:menu', revision: 1,
  localToPhysical: {scale: 1.5, x: 0.25, y: 0.5}, sourcePixelPhysicalSize: 2,
  viewport: {x: 0, y: 0, width: 100, height: 60}};
const model = {revision: 1, context,
  tree: button({id: 'confirm', label: 'Confirm', actionId: 'app:confirm',
    layout: {width: 40, height: 16}})};
const mounted = ui.mount(model, {parent, scope: 'app:dialog', policy: {navigation: 'spatial'}});

// Called by the existing native input/session owner, never a second listener/poller.
function onNormalizedInput(event) {
  const intents = mounted.handle(event);
  gameRouter.validateAndDeliverOriginalBindingsOnce(intents);
}
onNormalizedInput({type: 'press', inputId: 'pointer:1', point: {x: 10, y: 10}, pointSpace: 'physical'});
onNormalizedInput({type: 'release', inputId: 'pointer:1', point: {x: 10, y: 10}, pointSpace: 'physical'});
// Another supported pointSpace is {contextId:'app:menu', revision:1} for local input.
mounted.inspect({limit: 32}); // bounded controls plus native lifecycle/resource counters
mounted.update({...model, revision: 2});
mounted.dispose(); // idempotent
ui.dispose();
```

Convert CSS/client input to physical backbuffer pixels once in the game's existing
viewport owner. Native `handle` requires an explicit point space. The portable engine
projects a physical point independently into each record's semantic context, including
subpart hits. Spatial navigation compares physical centers. The portable seam accepts
omitted space only for one valid mapped context, where it means that context's local
coordinates. There is no mapping-free synthetic-context compatibility path.

Each mount constructs exactly one existing portable interaction engine. Controlled
values (field value/selection/composition, tabs, toggles, stepper, fold, pages and scroll)
stay in snapshots; `change` intents do not dispatch game actions. Publish changed
model bytes with a new model revision. Mapping/viewport/source-footprint changes require
a context revision; affected held presses become invalid while unrelated contexts preserve
eligible presses. Parent/child measurements and slots convert through physical space;
each record keeps its own continuous semantic bounds and inherited mapping dependencies.

## Painting and ownership

Stock painting uses native Images and explicit theme-colored Rectangles. Glyph Images
consume the portable atlas source rectangles and quantized destinations; there is no
Phaser Text, DOM text, canvas upload, renderer replacement or consumer stock painter.
An optional font role `glyphTint: '#RRGGBB'` uses Phaser's native multiplicative
Image tint for lettering, composition, tab labels and item quantities. It never
tints skins or icons and resets to white when a keyed glyph changes to an untinted
role. As with existing Phaser BitmapText/Image tint, this affects WebGL only;
Canvas themes requiring exact colored lettering must declare colored source tones.
Nine-slices use the existing lazy tile iterator, including hollow centers and cropped
last tiles. Icons declare `{width,height,frame:{x,y,width,height}}` in source pixels;
native preparation rejects missing frames. Item quantities use the same bitmap placement
owner. Field selection sits under glyphs; caret/composition share the portable positions.
An optional field role `caretWidth` declares a positive width in the label context's
local units, including for empty fields. Omission preserves the one-physical-pixel
default. The normal physical-grid paint quantization still applies; this setting
does not change selection, hit bounds, text measurement or input ownership.
Tabs retain selected/disabled feedback, adjustments draw minus/plus indicators, and
toggle/fold indicators use declared colors or `role.icons.checked/unchecked` assets.
Progress/meter caps reserve authored start/end extents and quantize fill to the authored
period; cap/edge source pixels retain their planned tiling. Flat colors must be `#RRGGBB`.
Supply all needed state colors explicitly; the host invents no palette or density.

Images use unregistered native `Frame.clone()` fragments with `setSize` and `setCrop`.
This avoids Phaser 4.2.1's `Texture.add/remove` bookkeeping drift and leaves borrowed
atlas frame maps, fallback frame and counts intact. Clipping intersects native rectangle
geometry and crops each Image in its own source coordinates. It uses no GameObject masks,
filter surfaces, extra cameras or render targets. This is intended for the supported
WebGL and Canvas paths; source-region doubles do not prove their evaluated pixels.

Stable keys reuse compatible objects and source fragments. Context attachments are
reused while their descriptors match; changing a descriptor retires affected attachments
and objects. Default per-mount limits are 8,192 objects, 4,096 fragments and 256 extension
regions; callers can supply smaller explicit limits. The host owns its objects, cloned
frames, lifecycle subscription and explicitly owned leases. Borrowed textures, parents,
font caches and cameras are never destroyed. Every registered release is attempted,
including after partial attachment/fragment/extension failure. Cleanup errors are thrown
and retained as bounded inspection evidence. A shared scene-shutdown handler attempts
every mount even if one disposal throws.

Pure preparation/validation failure preserves the prior valid native mount. After a
native mutation fails, the mount retires, cancels input and drains owned resources before
throwing to the game's existing recovery owner. There is no fallback painter/backend.

## Bounded extensions

Register a namespaced extension per `ui` instance with version 1, deterministic
`measure`, pure deterministic `regions`, and `mount(model, allocation, scope)`.
Measurement returns `{min,preferred,overflow}`. Allocation includes bounds, continuous
clip, enabled state, resolved context and dependent revisions. Region IDs qualify as
`nodeId:regionId`, inherit clipping/enabled state, and participate in the same portable
focus/hit/action owner with shared feedback. Regions remain adjacent to their parent in
semantic order; ordinary later siblings retain hit precedence.

`scope` exposes only `own(value,release)`, `onDispose(release)` and the game's declared
`native` facade returned by `ports.extensionFacade`. Register partial allocations before
performing subsequent native work. Reconciliation reuses an unchanged model/allocation;
changed allocation, enabled authority, context or model disposes the previous extension
scope before mounting its replacement. Removing a registration disposes dependent mounts.
Instance disposal clears registrations. This is an ownership convention for trusted
game code, with no scene/dispatcher/raw stock-painter authority granted by the host.
Space's later chart adoption must keep its existing seven-operation game facade unchanged.

Actual native backend/pixel/input proof in Space and Cyber, the Space chart witness,
all-three-game surface migrations, independent integrated review, broad release gates,
version/catalog publication, deployments/live-byte proof and canonical wiki closeout
remain coordinator-owned mandatory later stages. Nothing in this producer checkpoint
accepts those stages or the full adoption objective.
