# Shared native components

The producer independently owns and verifies this reusable component contract.
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

## Grid rows and pagination

Grid `layout.gap` separates columns; `layout.rowGap` separates rows and defaults
to `gap` when omitted. Explicit zero keeps adjacent rows together. Measurement,
placement and whole-row pagination use the same row gap. Each row advances by
its tallest allocated child, including fixed child heights converted from their
semantic contexts into the parent context. The gap stays in parent-local units.
Action-bar whole-row pagination likewise preserves its declared row gap.

## Wrapping rows, prelaid labels and final capacity

`Layout.wrap` is the single row/text policy. A row opts into variable-width flow
with `wrap: true`; omitted or false preserves its existing one-line allocation.
Labels wrap by default; `wrap: false` preserves their already laid-out source
lines, including leading, repeated and trailing spaces. On a labelled row the
same property governs both its child flow and its label. Use a separate text
child when their policies differ. Skin, semantic, and label contexts stay
independent; widths/heights cross contexts through physical space exactly once.

```js
row({id: 'choices', layout: {width: 100, gap: 8, rowGap: 4, wrap: true},
  children: [60, 48, 36].map((width, index) => button({id: `choice:${index}`,
    layout: {width, height: 22}}))});
text({id: 'prelaid', label: ' A    B ', layout: {wrap: false, width: 32}});
```

Rows group ordered children using fixed widths, natural widths, or minimum grow
reservations. Each line then distributes growth within declared maxima and
remeasures at those widths. Fixed widths and minimum constraints may overflow;
they are never silently clipped to fit. Each line advances by its tallest child
plus `rowGap` (default `gap`, including explicit zero). Measurement, placement,
scroll extent and pagination share that topology. Vertical alignment cannot
split a visual line across pages. Defaults for nonwrapping rows stay unchanged.

Low-level `placeBitmapText` also accepts a strictly boolean `wrap: false`.
`maxWidth` and `maxHeight` retain alignment and fit/paint diagnostics while source
lines and full advances remain intact. Text normalization, fallback glyphs,
trailing-advance/line-spacing policies and optional UTF-16 caret mapping still
apply. A fractional anchor can lose a physical fit pixel through inward bounds
quantization and honestly report overflow; it never reflows an explicitly
unwrapped line. A seven-character label at zoom 1.5 can retain its 33-pixel
advance against the 32-pixel physical fit box. Native clipping remains separate.

For `overflow: 'paginate'`, `Layout.lastPageHeight` declares the final outer
height in that node's semantic units. Padding and any preceding label consume
it. Values are finite nonnegative numbers; omission preserves ordinary capacity.
A capacity larger than ordinary height never enlarges a page. A smaller capacity
repacks only the ordinary tail, with every replacement tail page using the smaller
capacity. Five ordered 20-unit blocks at ordinary height 60 and final height 30
produce three pages: `[0,1,2]`, `[3]`, `[4]`. Grids, action bars and wrapping rows
keep visual rows indivisible. Text-only pages with an explicit final capacity
keep source lines whole. Legacy horizontal row pagination retains its width-based
topology and uses final height as its vertical clip.

An oversize indivisible row/run is retained on its own page with overflow.
Explicit final-capacity pages honor controlled `scrollX`/`scrollY` within the
selected page's extent, so a host can reveal its actions without enlarging the
allocation. Zero capacity retains content and reports overflow; it creates no
paint room. The host still owns reveal intents, page controls and input routing.

The same common owner exports `paginateUiBlocks` directly from `ui-layout.mjs`
for an adapter that already measures paragraph/card atoms:

```js
import {paginateUiBlocks} from './ui-layout.mjs';
const pages = paginateUiBlocks([
  {height: 20, breakBefore: true},
  {height: 80, wholeFirst: true,
    flow: {count: 8, heightOf: (from, to) => (to - from) * 10,
      keep: index => index === 2}},
], {pageHeight: 60, lastPageHeight: 30, gap: 4, minSplit: 10});
// pages contain {block, from?, to?}; ranges are half-open source atom offsets.
```

`breakBefore` starts a new page without adding an empty page. `wholeFirst` moves
a fitting block whole; blocks taller than a page may split at declared atom
boundaries. `keep(i)` keeps an atom with its successor, including an oversize
heading chain. `minSplit` is the minimum residual room before splitting into a
partly occupied page. Pure stable `heightOf(from,to)` callbacks measure the actual
wrapper, including first-run headers and padding; no character-count estimate is
substituted. Output ranges preserve source block/atom identity through tail
repacking and are deeply frozen. The helper does not freeze caller data.

This replaces generic local packing/splitting decisions. Adapter-authored models,
speaker breaks, atom/wrapper composition, measured footer reservations and native
resource lifetimes stay with their existing owners. The producer checks establish
source calculations and actual Phaser declaration compatibility. Independent
review/export and generic native backend pixels are producer release gates.
Host device behavior, assets and adoption remain independent consumer checks.

## Declared logical spatial focus and reveal

With `navigation: 'spatial'` and an explicit root `focus.order`, directional
navigation ranks declared controls using their measured raw `focusBounds`,
projected from each semantic context into physical space. This includes clipped
controls awaiting host reveal. Every chosen target emits the existing
`{kind: 'focus', controlId, modelRevision}` intent; it never activates an action.
The host reveals that logical control and republishes the current plan before
activation can use its visible effective hit region. No synthetic geometry or
local directional solver is needed. Explicit `defaultId`/`cancelId` authority,
event identity and model/context revision barriers remain unchanged.

Missing IDs, hidden controls, nonfocusable decorations and zero-area raw focus
rectangles are excluded from directional geometry. Disabled focusable controls
remain readable without becoming activatable. Equal spatial scores and edge-wrap
ties follow declared order. Directional wrap retains the existing physical-edge
and nearest-cross-axis rule. Omitted `focus.order` retains visible effective-bound
spatial navigation; next/previous and ordered logical reveal retain their existing
contract. A clipped list can request its next logical item before the host scrolls,
with activation blocked until the host republishes the revealed item.

## Assets, contexts and the single game router

Nodes can declare `regions: {hit, focus}` independently of their ordinary visual
`layout`. Each optional rectangle has finite `x`, `y`, `width`, `height` in the
node's semantic-local units, relative to its allocated origin. Negative offsets
are valid; dimensions are nonnegative. Omission keeps the existing allocation.
For a 27-by-15 face inside a 44-by-31 touch target, use the small visual layout
and `regions.hit: {x: -8, y: -8, width: 44, height: 31}`. A small skill button can
likewise declare the larger surrounding card as `regions.focus` without making
the rest of that card clickable. Labels, children and artwork keep their existing
visual layout; density still belongs to the declared contexts.

Both regions stay continuous and inherit clipping independently. Focus may
remain visible/readable when its hit target is clipped, but activation still
requires an enabled control and a nonempty effective hit region. Explicit hit
regions satisfy the theme's minimum target policy directly rather than enlarging
the painted face. Native feedback uses the focus frame; borrowed art, keyed
objects, input authority and disposal rules are unchanged. Native observations
include raw/effective hit and focus bounds plus `semanticContextId` for their units.

For steppers, pagers and tabs, an explicit hit region is divided into equal
horizontal cells in choice order (decrement/increment or tab order). Those
semantic cells inherit the effective hit clip; their artwork and text retain
the original visual allocation. Disabled choices, value limits and held-input
revision checks still apply. Omitting the hit region preserves existing parts.

The native port can opt into exact source-axis compression with
`readSourceRGBA({kind,id,tone,texture,sourceIndex,source,maxBytes})`. Return
`{source,width,height,data}` for a full, tightly packed immutable RGBA8 source,
or `null` when unavailable. `source` must be the requested native TextureSource;
width and height must equal that source's dimensions. Data must be a Uint8Array
or Uint8ClampedArray of exactly `width * height * 4` bytes, backed by an ordinary
ArrayBuffer. A port may opt in only for skin requests. It must honor the remaining
`maxBytes` before acquiring bytes. No output surface or borrowed atlas mutation
is needed. Readback/acquisition belongs to the existing immutable asset owner.

The host validates identity, source/frame bounds and byte length, copies admitted
bytes into a private per-mount cache (default `limits.sourceBytes = 4194304`),
and compares every RGBA byte of each nine-slice source region. Only an identical
column or row along an actually repeated axis may become a one-source-pixel
stock Image strip. Two proven axes allow one Image fill. Other axes retain their
original repeat period and partial-tail crops. Shorter patterns such as ABAB
never authorize a one-pixel stretch. Unavailable data keeps exact existing tiling
and its existing budgets. Source offsets, alpha, paint/clip geometry and physical
origin remain unchanged. These calculations and seam sampling are source proof;
the native fixture separately proves representative WebGL2/Canvas pixels.

Cache identity includes the borrowed texture, source index and source object;
source replacement invalidates compiled appearance rather than reusing a stale
frame. The game must replace the source identity when immutable source art changes.
Disposal/retirement clears copied planes and compiled commands. State changes
reuse stock Images and unregistered Frame clones without texture registration.

Immutable theme roles may reserve `placement.nativeStates` for `hover`, `focus`,
`pressed` and `disabled`. Each override accepts only `skin`, `tone`, `glyphTint`,
`paintOffset: {x,y}`, `visible` and `opacity`. A skin override selects another prepared skin;
tone selects authored glyph frames in the same font, retaining glyph geometry.
Offsets translate paint in each part's local coordinates, leaving semantic bounds
and clips fixed; each offset must map to whole physical pixels in that context.
Precedence is **disabled, pressed, hover, focus, base**. The selected
override merges only with base appearance, never with another transient override.
Source-plane reservations are transactional: rejected preparation leaves the
published cache and input state intact; successful replacement retains only the
sources referenced by its prepared variants.

Variants and their assets, minimum geometry and worst-case object budgets validate
before native mutation. Transient input selects prepared commands; it does not
republish the model or cancel the existing interaction engine's held token.
Fragment preflight reserves a conservative bound across independent state owners:
the sum of each owner's largest simultaneous set, capped by the global frame
union. Linked label/shadow records share their owner's state. This avoids an
exponential search; unusually tight custom limits may reject conservatively.
Shared frames count once, and one control can switch skins at its exact limit.

```js
// These IDs must name the consumer's already-authored skins and font tones.
const controlPlacement = {nativeStates: {
  hover: {skin: 'btn_hover'}, focus: {skin: 'btn_hover'},
  pressed: {skin: 'btn_down'}, disabled: {skin: 'btn_disabled'}
}};
const labelPlacement = {nativeStates: {
  hover: {tone: 'hover'}, focus: {tone: 'hover'},
  pressed: {tone: 'down', paintOffset: {x: 0, y: 1}},
  disabled: {tone: 'faint'}
}};
// Ordinary node metadata; validated at layout and interaction publication.
const label = text({id: 'confirm:label', label: 'Confirm',
  appearanceRole: 'controlLabel', metadata: {'ui:stateOwner': 'confirm'}});
```

The decoration and its button or itemSlot owner must be siblings in one mounted
tree. Text/icon consumers and leaf flat panels without independent focus/action
authority qualify. A linked panel has no label or descendants, including nested
controls; a skinned panel or arbitrary layout node cannot be a wash. Dangling, chained,
cyclic, cross-mount references and focus-role/order targets reject. The link is
part of immutable semantic identity, so rebinding requires a model revision and
cancels held activation. Omission preserves existing control IDs and snapshots.
Each mount continues to own one portable interaction engine and no input listeners.
Flattened records retain `parentId` for independent interaction validation; it is
part of semantic identity. Legacy text/icon plans may omit it. New panel links
require explicit parent identity and remain outside focus order/default/cancel roles.

Theme-role `opacity` and state override `opacity` accept finite numbers in `0..1`.
The role default is `1`; a selected state inherits its role when it omits opacity.
The host calls the public Image/Rectangle `setAlpha` for every stock command and
every keyed reconciliation, including restoring `1`. This preserves source alpha
and applies to flat faces, skins, glyphs, icons and feedback without changing color.
Opacity does not hide semantic controls or grant input authority. Use `visible:false`
when paint visibility, rather than zero alpha, is the intended state policy.

`edge.width` is a positive finite dimension in the control's **semantic local**
context. Native preflight requires `width * localToPhysical.scale` to be a positive
whole number of physical pixels. Skin and label densities do not determine it.
Omission retains exactly one physical pixel. Other edge metadata is preserved.
Feedback fits inside quantized paint bounds and partitions corners and tiny bounds
without overlapping strips, so translucent feedback paints each covered pixel once.
Hit/focus bounds and clipping remain independent and continuous.

For readable disabled cards, opt in with `edge: {focusWhenDisabled: true}`.
An authoritatively focused disabled control then uses its explicit `colors.focus`
for the edge, while its base skin, tone and other appearance stay disabled. The
edge disappears or returns to `colors.disabled` when focus leaves. Omitted/false
retains the original disabled-feedback precedence; a missing focus color also
retains that precedence. This option cannot grant focus or enable activation.

```js
// Normal stock composition for authored item focus: opaque edge, 30% wash.
// Use these roles with the consumer's actual contexts and immutable asset ports.
const focusTheme = defineTheme({version: 1, id: 'app:item-focus', roles: {
  absolute: {},
  itemSlot: {edge: {width: 2}, colors: {focus: '#ff2bd6', hover: '#ff2bd6', pressed: '#ff2bd6'}},
  wash: {opacity: 0, alternatives: [{kind: 'flat', color: '#ff2bd6'}],
    placement: {nativeStates: {focus: {opacity: .3}, hover: {opacity: .3},
      pressed: {opacity: .3}, disabled: {opacity: 0}}}}
}});
const itemFocusTree = absolute({id: 'items', children: [
  itemSlot({id: 'item', actionId: 'game:item', layout: {width: 34, height: 22}}),
  panel({id: 'item:wash', appearanceRole: 'wash', metadata: {'ui:stateOwner': 'item'},
    layout: {width: 34, height: 22}})
]});
// Place item art in the itemSlot or earlier stock siblings, below the wash.
// The same-magenta wash leaves the independently opaque border unchanged.
```

The example is a stock construction, not native pixel acceptance. The coordinator
must still verify actual WebGL/Canvas compositing and input with the installed
Phaser 4.2.1 and the consumer's camera/depth/clip owners.

An authored theme can select primary, secondary and ordinary control skins, then
apply the state overrides above. Canvas requires corresponding source-art tone
frames because its Image renderer ignores tint. Give label and shadow siblings
the same owner link and pressed offset `{x:0,y:1}`; the shadow's disabled override
can be `{visible:false}`. Geometry and action routing remain host-owned.

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

The root's optional `focus.order` lists the game's current eligible semantic IDs,
including controls on other pages or outside the painted clip. Ordered navigation
may retain such an ID as `initialId` and logical focus without a painted control.
Activation of logical-only focus is refused until the host reveals a live control.
Navigation
uses that order and the mount's `wrap` policy, returning a revision-bound `focus`
intent. The game routes it through its existing semantic focus/reveal owner, then
publishes the newly visible snapshot. Unpainted targets gain no fake geometry or
activation authority; activation still requires a live enabled hit region. Omit
the order to retain native visible-control traversal. Keep disabled-but-readable
IDs only when the game's existing focus policy includes them.

With `navigation: 'spatial'`, directional ranking uses physical centers across
declared contexts. Opt-in `wrap: true` moves from a boundary to the opposite edge,
then chooses the nearest cross-axis center; ties retain semantic record order.
Hidden, clipped and nonfocusable controls do not become wrap targets. Default
`wrap: false` leaves focus at the boundary. This does not change action eligibility.

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
An existing extension facade retains its declared bounded operations during adoption.

## Verification and host obligations

`npm run test:ui` runs the existing CPU owners, software export and real Phaser
declaration checks with one worker. `npm run test:ui:native` starts one owned
ephemeral server and Chromium instance, then four fresh contexts covering two
authored themes on WebGL2 and Canvas. It evaluates exact font and skin pixels,
clipping, nonzero viewport origins, mixed resolution contexts, normalized input,
stale-event cancellation, scrolling, bounded extensions and owned-resource cleanup.
Software WebGL proves behavior, not hardware performance. Failure screenshots,
timings and results remain in a new attempt directory under `.tmp/ui-native/`;
failures are preserved and retries are zero.

Tiny checked assets live in `tests/native-ui/assets/`. Their manifest authenticates
the source recipe, generator, build configurations and output bytes. Ordinary tests
only read them. Run `npm run build:ui-fixture` when their recipe changes; it uses
the normal manifest build pipeline. Browser installation is explicit with
`npx playwright install chromium`; no test downloads or replaces tools.

The host must keep borrowed assets immutable and replace source identity when
their bytes change; realize every declared mapping through its actual parent and
camera; increment context revisions for mapping, viewport or source-footprint
changes; normalize input through one input/action authority; and register owned
resources before native work that can fail. Borrowed textures, caches, cameras
and parents must never be registered as owned. A consumer verifies its chosen
released export, real assets, adapters, actions, transactions and extensions
independently. Producer release does not wait for consumer inventories or campaigns.

For a shared implementation edit, run the affected CPU owner and the native fixture
when rendering, interaction or lifecycle changes. Producer release runs both UI
commands and established package/plugin release checks. Stop on passing unchanged
inputs; widen only for a named changed dependency, observed failure or unresolved risk.
