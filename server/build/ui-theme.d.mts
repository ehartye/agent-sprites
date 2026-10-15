/** Appearance and immutable source metadata; coordinates are source pixels unless stated otherwise. */
export type UiData = null | undefined | string | number | boolean | readonly UiData[] | {readonly [key: string]: UiData};
export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends object ? {readonly [K in keyof T]: DeepReadonly<T[K]>} : T;
export interface Rect {readonly x: number; readonly y: number; readonly width: number; readonly height: number}
export interface Insets {readonly top: number; readonly right: number; readonly bottom: number; readonly left: number}
export type Padding = number | Partial<Insets>;
export interface FontPolicy {
  readonly newline?: 'normalize' | 'lf-only'; readonly tab?: 'four-spaces' | 'literal'; readonly nullish?: 'stringify' | 'empty';
  readonly empty?: 'line' | 'none'; readonly trailingAdvance?: 0 | 1; readonly lastLine?: 'line' | 'cell';
  readonly lineSpacing?: number; readonly spaces?: 'trim' | 'terminal';
}
/** Output of the existing ui-runtime normalizeBitmapFont owner. */
export interface BitmapFont {
  readonly format: 'agent-sprites/bitmap-font@1'; readonly lineHeight: number; readonly baseline: number | null;
  readonly cell: {readonly width: number; readonly height: number} | null; readonly fallback: string; readonly toneNames: readonly string[];
  readonly glyphs: Readonly<Record<string, {readonly advance: number; readonly inkBounds: {readonly known: boolean; readonly rect: Rect | null}; readonly frames: Readonly<Record<string, {readonly name: string | null; readonly source: Rect; readonly offset: {readonly x: number; readonly y: number}}>>}>>;
}
export interface ThemeFont {readonly font: BitmapFont; readonly policy?: FontPolicy}
export interface Skin {
  readonly frame: Rect; readonly insets: Padding; readonly padding?: Padding; readonly minWidth?: number; readonly minHeight?: number;
  readonly center?: 'include' | 'omit'; readonly tile?: boolean; readonly trim?: Rect | null;
  readonly contentBounds?: Rect | null; readonly paintedBounds?: Rect | null;
  readonly caps?: {readonly start: number; readonly end: number; readonly period: number; readonly axis?: 'x' | 'y'};
}
export type PreparedSkin = DeepReadonly<Omit<Skin, 'insets' | 'padding' | 'minWidth' | 'minHeight' | 'center' | 'tile'> & {insets: Insets; padding: Insets; minWidth: number; minHeight: number; center: 'include' | 'omit'; tile: boolean}>;
export type AppearanceAlternative = {readonly kind: 'skin'; readonly id: string} | {readonly kind: 'flat'; readonly color: string};
export type Appearance = {readonly kind: 'skin'; readonly id: string; readonly skin: PreparedSkin} | {readonly kind: 'flat'; readonly color: string};
/** Native stock colors are explicit #RRGGBB values; no color is inferred by the host. */
export type UiColors = Readonly<Partial<Record<'focus'|'hover'|'pressed'|'disabled'|'selection'|'caret'|'indicator'|'separator'|'track'|'fill'|'selected'|'adjust',string>>>;
export interface ThemeIcon {readonly width:number;readonly height:number;readonly frame?:Rect;readonly [key:string]:UiData|Rect;}
export interface ThemeRole {
  readonly extends?: string; readonly font?: string; readonly tone?: string; readonly alternatives?: readonly AppearanceAlternative[];
  /** Optional WebGL multiplicative #RRGGBB glyph tint, matching Phaser Image/BitmapText. Canvas requires authored source tones. Does not tint skins or icons. */
  readonly glyphTint?: string;
  /** Positive field caret width in label-context local units; omitted means one physical pixel. */
  readonly caretWidth?: number;
  readonly padding?: Padding; readonly minWidth?: number; readonly minHeight?: number; readonly density?: number;
  readonly colors?: UiColors; readonly edge?: UiData; readonly icons?: Readonly<{checked?:string;unchecked?:string}>; readonly placement?: UiData;
}
export type PreparedThemeRole = DeepReadonly<Omit<ThemeRole, 'extends' | 'padding'> & {padding?: Insets; appearance?: Appearance}>;
export interface ThemeInput {
  readonly version: 1; readonly id: string; readonly fonts?: Readonly<Record<string, ThemeFont>>; readonly skins?: Readonly<Record<string, Skin>>;
  /** Aliases, including variant names such as "button.primary", resolve before publication. */
  readonly roles: Readonly<Record<string, ThemeRole | string>>;
  /** Geometry, padding and target sizes are component-local units. Skin dimensions remain source pixels. */
  readonly geometry?: {readonly gap?: number; readonly padding?: Padding; readonly minTarget?: number};
  readonly palette?: UiData; readonly placement?: UiData;
  readonly icons?: Readonly<Record<string, ThemeIcon>>;
}
export interface UiTheme {
  readonly format: 'agent-sprites/ui-theme@1'; readonly version: 1; readonly id: string;
  readonly fonts: Readonly<Record<string, {readonly font: BitmapFont; readonly policy: Required<FontPolicy>}>>;
  readonly skins: Readonly<Record<string, PreparedSkin>>; readonly roles: Readonly<Record<string, PreparedThemeRole>>;
  readonly geometry: {readonly gap: number; readonly padding: Insets; readonly minTarget: number};
  readonly palette?: UiData; readonly placement?: UiData; readonly icons?: ThemeInput['icons'];
}
export function defineTheme(input: ThemeInput): UiTheme;
export function resolveThemeRole(theme: UiTheme, id: string): PreparedThemeRole;
/** Internal cross-module data validators. No callbacks, native resources or caller references survive copying. */
export function copyUiData<T>(value: T): T;
export function freezeUiData<T>(value: T): DeepReadonly<T>;
export function uiNumber(value: number, name: string, minimum?: number): number;
export function uiKeys(value: unknown, keys: readonly string[], name: string): void;
export function uiId(value: string, name?: string, namespaced?: boolean): string;
export function uiRect(value: Rect, name?: string): Rect;
export function uiInsets(value?: Padding): Insets;
