import type {UiData} from './ui-theme.mjs';
import type {Selection} from './ui-components.mjs';
import type {UiLayoutPlan, LayoutRecord} from './ui-layout.mjs';
export interface InteractionScope {readonly id: string; readonly plan: UiLayoutPlan}
export interface InteractionPolicy {readonly navigation?: 'ordered' | 'spatial' | 'pane'; readonly wrap?: boolean; readonly restoreId?: string}
export interface InputBinding {
  /** One-shot activation/edit identity, or the matched identity for one press/release pair. Never reuse a one-shot ID in a mount. */
  readonly inputId: string;
  /** Native adapters bind queued events to these revisions. Omission addresses the current synchronous scope. */
  readonly modelRevision?: number; readonly scopeId?: string; readonly contextRevisions?: Readonly<Record<string, number>>;
}
export type Point = {readonly x: number; readonly y: number};
/** Physical backbuffer coordinates, or coordinates in one explicitly revision-bound local context. */
export type PointSpace = 'physical' | {readonly contextId:string;readonly revision:number};
export type NormalizedUiEvent =
  | (Partial<InputBinding> & {readonly type: 'navigate'; readonly direction: 'next' | 'previous' | 'left' | 'right' | 'up' | 'down'})
  | (Partial<InputBinding> & {readonly type: 'focus'; readonly controlId: string})
  | (Partial<InputBinding> & {readonly type: 'pane'; readonly paneId: string})
  | (Partial<InputBinding> & {readonly type: 'hover'; readonly point: Point;readonly pointSpace?:PointSpace})
  | (Partial<InputBinding> & {readonly type: 'blur'})
  | (InputBinding & {readonly type: 'press' | 'release'; readonly controlId?: string; readonly point?: Point;readonly pointSpace?:PointSpace})
  | (InputBinding & {readonly type: 'activate' | 'default' | 'cancel'; readonly controlId?: string})
  | (InputBinding & {readonly type: 'adjust'; readonly controlId?: string; readonly delta: number})
  | (InputBinding & {readonly type: 'select'; readonly controlId?: string; readonly value: string})
  | (InputBinding & {readonly type: 'edit' | 'composition'; readonly controlId?: string; readonly text: string})
  | (InputBinding & Selection & {readonly type: 'selection'; readonly controlId?: string})
  | (InputBinding & {readonly type: 'caret'; readonly controlId?: string; readonly direction: 'left' | 'right' | 'home' | 'end'; readonly extend?: boolean})
  | (InputBinding & {readonly type: 'delete'; readonly controlId?: string; readonly direction: 'forward' | 'backward'});
export type UiIntent =
  | {readonly kind: 'activate'; readonly controlId: string; readonly actionId: string; readonly modelRevision: number; readonly activationId: string}
  | {readonly kind: 'change'; readonly controlId: string; readonly value: UiData; readonly modelRevision: number; readonly selection?: Selection; readonly composition?: string | null}
  | {readonly kind: 'cancel'; readonly scopeId: string; readonly modelRevision: number};
export interface Observation {
  readonly scopeId: string; readonly modelRevision: number; readonly disposed: boolean; readonly focusId: string | null;
  readonly hoverId: string | null; readonly heldCount: number;
  readonly controls: readonly (LayoutRecord & {readonly focused: boolean; readonly hovered: boolean; readonly pressed: boolean; readonly disposed: boolean})[];
  readonly nextAfterId: string | null;
}
export interface UiInteraction {
  /** Returns at most one intent. The caller validates it and invokes the original game action binding once. */
  handle(input: NormalizedUiEvent): readonly UiIntent[];
  /** Prepare/validate before replacement; failures preserve the published state. */
  update(scope: InteractionScope): void;
  inspect(options: {readonly limit: number; readonly afterId?: string}): Observation;
  dispose(): void;
}
export function createUiInteraction(scope: InteractionScope, policy?: InteractionPolicy): UiInteraction;
