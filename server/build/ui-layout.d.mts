import type {UiData, Rect, UiTheme, DeepReadonly, BitmapFont, FontPolicy, Appearance, PreparedSkin} from './ui-theme.mjs';
import type {UiNode, NodeKind, FocusRoles, Overflow} from './ui-components.mjs';
export interface Context {
  readonly id: string; readonly revision: number; readonly localToPhysical: {readonly scale: number; readonly x: number; readonly y: number};
  readonly sourcePixelPhysicalSize: number; readonly viewport: Rect;
}
export interface PixelResolution {
  readonly format: 'agent-sprites/pixel-resolution@1'; readonly id: string; readonly revision: number;
  readonly localToPhysical: {readonly scale: number; readonly origin: {readonly x: number; readonly y: number}};
  readonly physicalPixelsPerSourcePixel: number; readonly sourceToLocalScale: number;
}
export interface ResolvedContext extends PixelResolution {readonly viewport: Rect}
export interface Size {readonly width: number; readonly height: number}
export interface Measure {readonly min: Size; readonly preferred: Size}
export interface ExtensionMeasure extends Measure {readonly overflow: Overflow}
export interface ExtensionEnvironment {readonly theme: UiTheme; readonly context: ResolvedContext; readonly contexts: readonly ResolvedContext[]; readonly revision: number}
export interface ExtensionDefinition {
  readonly version: 1;
  /** Called twice during preparation to reject unstable results; no native resources belong here. */
  readonly measure: (model: UiData, environment: ExtensionEnvironment) => ExtensionMeasure;
}
export interface LayoutEnvironment {
  readonly theme: UiTheme; readonly revision: number; readonly context: Context; readonly additionalContexts?: readonly Context[];
  /** Per-call, explicitly admitted portable measurements; no global extension registry. */
  readonly extensions?: Readonly<Record<string, ExtensionDefinition>>;
}
export interface TextPlacement {
  readonly width: number; readonly height: number; readonly advanceWidth: number;
  readonly context: {readonly id: string; readonly revision: number}; readonly resolution: PixelResolution;
  readonly lines: readonly {readonly x: number; readonly y: number; readonly width: number; readonly source: string; readonly resolved: string;
    /** Fields request ui-runtime's UTF-16 mapping. Advances are in this placement's coordinate space. */
    readonly sourceStart?: number; readonly sourceEnd?: number; readonly caretAdvances?: readonly number[]}[];
  readonly sourceMap?: readonly {readonly sourceStart: number; readonly sourceEnd: number; readonly caretAdvances: readonly number[]}[];
  readonly draws: readonly {readonly char: string; readonly resolvedChar: string; readonly row: number; readonly frame: string | null; readonly tone: string; readonly source: Rect; readonly destination: Rect; readonly physicalDestination: Rect}[];
  readonly paintedBounds: {readonly known: boolean; readonly rect: Rect | null};
  readonly overflow: {readonly horizontal: boolean; readonly vertical: boolean; readonly painted: {readonly known: boolean; readonly horizontal: boolean | null; readonly vertical: boolean | null}};
}
export interface NineSliceRegion {readonly row: number; readonly column: number; readonly source: Rect; readonly destination: Rect; readonly physicalDestination: Rect; readonly tile: boolean; readonly period: Size}
export interface NineSlicePlan {
  readonly format: 'agent-sprites/nine-slice@1'; readonly bounds: Rect; readonly scale: number;
  readonly regions: readonly NineSliceRegion[]; readonly paintedBounds: {readonly known: boolean; readonly rect: Rect | null};
  readonly physicalPaintedBounds: {readonly known: boolean; readonly rect: Rect | null};
  readonly physicalPlan: {readonly format: 'agent-sprites/nine-slice@1'; readonly bounds: Rect; readonly scale: number;
    readonly regions: readonly Omit<NineSliceRegion, 'physicalDestination'>[]; readonly paintedBounds: {readonly known: boolean; readonly rect: Rect | null}};
}
export type PaintPart = {readonly clipBounds: Rect | null} & (
  | {readonly kind: 'skin'; readonly appearance: Appearance; readonly plan: NineSlicePlan; readonly contextId: string}
  | {readonly kind: 'text' | 'composition'; readonly placement: TextPlacement; readonly contextId: string}
  | {readonly kind: 'flat'; readonly color: string; readonly bounds: Rect; readonly contextId: string}
  | {readonly kind: 'meter' | 'progress'; readonly fraction: number; readonly track: Rect; readonly fill: Rect; readonly caps: PreparedSkin['caps'] | null; readonly contextId: string}
  | {readonly kind: 'indicator'; readonly checked: boolean; readonly bounds: Rect; readonly contextId: string}
  | {readonly kind: 'separator' | 'caret'; readonly bounds: Rect; readonly contextId: string}
  | {readonly kind: 'selection'; readonly bounds: Rect; readonly direction: 'none' | 'forward' | 'backward'; readonly contextId: string}
  | {readonly kind: 'icon'; readonly asset: string; readonly metadata: UiData; readonly bounds: Rect; readonly contextId: string}
  | {readonly kind: 'tab'; readonly value: string; readonly selected: boolean; readonly enabled: boolean; readonly bounds: Rect; readonly hitBounds: Rect | null; readonly placement: TextPlacement; readonly contextId: string}
  | {readonly kind: 'adjust'; readonly delta: -1 | 1; readonly enabled: boolean; readonly bounds: Rect; readonly hitBounds: Rect | null; readonly contextId: string});
export interface ActionPlan {
  readonly format: 'agent-sprites/action-group@1'; readonly semanticIds: readonly string[]; readonly paintIds: readonly string[];
  readonly allocation: {readonly kind: 'empty'} | {readonly kind: 'native-equal'; readonly arrangement: 'row' | 'grid' | 'stack'; readonly columns: number; readonly rows: readonly (readonly string[])[]} | {readonly kind: 'authored'; readonly arrangement: 'row'; readonly slots: readonly (Rect & {readonly id: string})[]};
}
export type LayoutRecord<K extends NodeKind = NodeKind> = K extends NodeKind ? Readonly<Omit<UiNode<K>, 'children'> & {
  /** Flattened topology for independent state-owner sibling/leaf validation.
   * New layout publications always supply it; legacy non-panel plans may omit it. */
  parentId?: string | null;
  bounds: Rect; hitBounds: Rect; focusBounds: Rect; effectiveHitBounds: Rect | null; effectiveFocusBounds: Rect | null;
  clipBounds: Rect | null; contentClipBounds: Rect | null; contentBounds: Rect; paintBounds: Rect | null; effectivePaintBounds: Rect | null; semanticContextId: string; contextRevisions: Record<string, number>;
  paneId: string; state: 'visible' | 'clipped' | 'hidden'; measure: Measure; parts: readonly PaintPart[];
  text?: TextPlacement; actionPlan?: ActionPlan;
  extension?: {id: string; version: 1; model?: UiData; allocation: Rect; clipBounds: Rect | null; contextRevisions: Record<string, number>};
  overflow: {mode: Overflow; contentBounds: Rect; horizontal: boolean; vertical: boolean; maxScrollX: number; maxScrollY: number; scrollX: number; scrollY: number; page?: number; pageCount?: number};
}> : never;
export interface UiLayoutPlan {
  readonly format: 'agent-sprites/ui-layout@1'; readonly revision: number; readonly themeId: string;
  readonly contexts: readonly ResolvedContext[]; readonly focus: FocusRoles; readonly records: readonly LayoutRecord[];
}
/** Semantic records retain input order. actionPlan/slot geometry describes independently supplied paint order. */
export function layoutUi(tree: UiNode, environment: LayoutEnvironment): UiLayoutPlan;

/** Heights are measured by the existing source adapter in one semantic space.
 * heightOf/keep must be stable pure callbacks. No native resources belong here. */
export interface UiPageBlock {
  readonly height:number; readonly breakBefore?:boolean; readonly wholeFirst?:boolean;
  readonly flow?:{readonly count:number;readonly heightOf:(from:number,to:number)=>number;readonly keep?:(index:number)=>boolean};
}
export interface UiPageRun {readonly block:number;readonly from?:number;readonly to?:number;}
/** Greedy ordered whole blocks/atom runs. A smaller lastPageHeight repacks only
 * the ordinary tail at that capacity. Oversize indivisible runs get their own
 * page and remain available to the native owner's clipped scrolling policy. */
export function paginateUiBlocks(blocks:readonly UiPageBlock[],options:{readonly pageHeight:number;readonly lastPageHeight?:number;readonly gap?:number;readonly minSplit?:number}):readonly (readonly UiPageRun[])[];
