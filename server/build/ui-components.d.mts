import type {UiData, DeepReadonly, Padding} from './ui-theme.mjs';
export type NodeKind = 'panel' | 'header' | 'card' | 'text' | 'button' | 'actionBar' | 'listRow' | 'itemSlot' | 'field' | 'toggle' | 'stepper' | 'tabs' | 'fold' | 'pager' | 'progress' | 'meter' | 'separator' | 'icon' | 'notice' | 'tooltip' | 'extension' | 'stack' | 'row' | 'grid' | 'absolute';
export const UI_NODE_KINDS: readonly NodeKind[];
export type Overflow = 'visible' | 'clip' | 'scroll' | 'paginate';
export interface Layout {
  readonly x?: number; readonly y?: number; readonly width?: number; readonly height?: number;
  readonly minWidth?: number; readonly minHeight?: number; readonly maxWidth?: number; readonly maxHeight?: number;
  readonly preferredWidth?: number; readonly preferredHeight?: number; readonly grow?: number;
  readonly gap?: number; readonly rowGap?: number; readonly padding?: Padding; readonly columns?: number;
  readonly overflow?: Overflow; readonly scrollX?: number; readonly scrollY?: number; readonly page?: number;
  readonly align?: 'start' | 'center' | 'end' | 'stretch'; readonly justify?: 'start' | 'center' | 'end' | 'space-between';
}
/** Initial focus requires focusability or a declared semantic order target. Default/cancel require a declared painted node. */
export interface FocusRoles {
  readonly initialId?: string; readonly defaultId?: string; readonly cancelId?: string;
  /** Authoritative semantic traversal order. Absent/clipped targets emit a focus intent for host reveal, never an activation. */
  readonly order?: readonly string[];
}
export interface Selection {readonly start: number; readonly end: number; readonly direction: 'none' | 'forward' | 'backward'}
export interface BaseProps {
  readonly id: string; readonly role?: string; readonly appearanceRole?: string; readonly variant?: string;
  readonly label?: string; readonly children?: readonly UiNode[]; readonly layout?: Layout; readonly enabled?: boolean;
  readonly focusable?: boolean; readonly selected?: boolean; readonly actionId?: string; readonly paneId?: string;
  readonly contextId?: string; readonly labelContextId?: string; readonly skinContextId?: string;
  readonly focus?: FocusRoles; readonly metadata?: Readonly<Record<`${string}:${string}`, UiData>>; readonly hidden?: boolean;
}
export interface TabOption {readonly id: string; readonly label: string; readonly enabled?: boolean}
export interface NumericProps {readonly value: number; readonly min?: number; readonly max?: number; readonly step?: number}
export interface NodeValues {
  panel: {}; header: {}; card: {}; text: {}; button: {}; listRow: {}; separator: {}; notice: {}; tooltip: {}; stack: {}; row: {}; grid: {}; absolute: {};
  actionBar: {readonly visualOrder?: readonly string[]; readonly fallbackOrder?: readonly string[]; readonly allocationPolicy?: 'equal-max-fit' | 'authored-width-end'};
  itemSlot: {readonly asset?: string; readonly quantity?: number}; icon: {readonly asset: string};
  field: {readonly value: string; readonly selection?: Selection; readonly composition?: string | null; readonly maxLength?: number};
  toggle: {readonly value: boolean}; fold: {readonly value: boolean}; stepper: NumericProps; progress: NumericProps; meter: NumericProps;
  tabs: {readonly value: string; readonly options: readonly TabOption[]}; pager: {readonly value: number; readonly pageCount: number};
  extension: {readonly extensionId: `${string}:${string}`; readonly extensionVersion?: 1; readonly model?: UiData};
}
export type UiNodeProps<K extends NodeKind> = BaseProps & NodeValues[K];
/** Keep recursion behind an interface boundary so ordinary strict consumers can instantiate trees. */
export interface PreparedNodeBase extends Omit<BaseProps, 'children' | 'layout' | 'role' | 'appearanceRole' | 'enabled' | 'focusable'> {
  readonly role:string;readonly appearanceRole:string;readonly enabled:boolean;readonly focusable:boolean;
  readonly children:readonly UiNode[];readonly layout:Layout;
}
export type UiNode<K extends NodeKind = NodeKind> = K extends NodeKind ? PreparedNodeBase & NodeValues[K] & {readonly kind:K} : never;
/** Constructors validate/copy the complete tree and reject duplicate IDs and undeclared properties. */
export function node<K extends NodeKind>(kind: K, props: UiNodeProps<K>): UiNode<K>;
export function validateUiTree(tree: unknown): UiNode;
export function panel(props: UiNodeProps<'panel'>): UiNode<'panel'>;
export function header(props: UiNodeProps<'header'>): UiNode<'header'>;
export function card(props: UiNodeProps<'card'>): UiNode<'card'>;
export function text(props: UiNodeProps<'text'>): UiNode<'text'>;
export function button(props: UiNodeProps<'button'>): UiNode<'button'>;
export function actionBar(props: UiNodeProps<'actionBar'>): UiNode<'actionBar'>;
export function listRow(props: UiNodeProps<'listRow'>): UiNode<'listRow'>;
export function itemSlot(props: UiNodeProps<'itemSlot'>): UiNode<'itemSlot'>;
export function field(props: UiNodeProps<'field'>): UiNode<'field'>;
export function toggle(props: UiNodeProps<'toggle'>): UiNode<'toggle'>;
export function stepper(props: UiNodeProps<'stepper'>): UiNode<'stepper'>;
export function tabs(props: UiNodeProps<'tabs'>): UiNode<'tabs'>;
export function fold(props: UiNodeProps<'fold'>): UiNode<'fold'>;
export function pager(props: UiNodeProps<'pager'>): UiNode<'pager'>;
export function progress(props: UiNodeProps<'progress'>): UiNode<'progress'>;
export function meter(props: UiNodeProps<'meter'>): UiNode<'meter'>;
export function separator(props: UiNodeProps<'separator'>): UiNode<'separator'>;
export function icon(props: UiNodeProps<'icon'>): UiNode<'icon'>;
export function notice(props: UiNodeProps<'notice'>): UiNode<'notice'>;
export function tooltip(props: UiNodeProps<'tooltip'>): UiNode<'tooltip'>;
export function extension(props: UiNodeProps<'extension'>): UiNode<'extension'>;
export function stack(props: UiNodeProps<'stack'>): UiNode<'stack'>;
export function row(props: UiNodeProps<'row'>): UiNode<'row'>;
export function grid(props: UiNodeProps<'grid'>): UiNode<'grid'>;
export function absolute(props: UiNodeProps<'absolute'>): UiNode<'absolute'>;
export interface FamilyProps {
  readonly id: string; readonly title?: string; readonly message?: string; readonly actions?: readonly UiNodeProps<'button'>[];
  readonly visualOrder?: readonly string[]; readonly fallbackOrder?: readonly string[];
  readonly initialId?: string; readonly defaultId?: string; readonly cancelId?: string;
  readonly layout?: Layout; readonly appearanceRole?: string;
}
export function confirmationFamily(props: FamilyProps): UiNode<'panel'>;
export function menuFamily(props: FamilyProps): UiNode<'panel'>;
export function formFamily(props: FamilyProps & {readonly fields: readonly UiNode[]}): UiNode<'panel'>;
export function listFamily(props: FamilyProps & {readonly items: readonly UiNode[]}): UiNode<'panel'>;
export interface ReadingFamilyProps extends FamilyProps {
  readonly speaker?: string; readonly paragraphs?: readonly string[];
  readonly bodyLayout?: Layout; readonly page?: {readonly value: number; readonly pageCount: number};
}
/** Conversation/reading composition: optional speaker, scrolling stock text, controlled pager and supplied choices. */
export function readingFamily(props: ReadingFamilyProps): UiNode<'panel'>;
export interface NoticeFamilyProps extends FamilyProps {readonly message: string; readonly visible?: boolean; readonly announcementRole?: 'status' | 'alert'}
/** Notice/toast composition. The game controls visibility/timing; supplied actions retain ordinary action authority. */
export function noticeFamily(props: NoticeFamilyProps): UiNode<'notice'>;
export interface HudFamilyProps {
  readonly id: string; readonly items: readonly UiNode[]; readonly arrangement?: 'row' | 'stack' | 'absolute';
  readonly layout?: Layout; readonly appearanceRole?: string; readonly contextId?: string; readonly paneId?: string;
}
export function hudFamily(props: HudFamilyProps): UiNode<'row' | 'stack' | 'absolute'>;
