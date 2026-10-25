import type {BitmapFont, FontPolicy, Rect, Insets} from './ui-theme.mjs';
import type {PixelResolution, Size} from './ui-layout.mjs';
export type {BitmapFont, FontPolicy, PixelResolution};
export interface Point {readonly x:number;readonly y:number;}
export interface AtlasRect {readonly x:number;readonly y:number;readonly w:number;readonly h:number;}
export interface AtlasFrame {readonly frame:AtlasRect;readonly filename?:string;readonly spriteSourceSize?:Point;}
export interface Atlas {readonly frames:Readonly<Record<string,AtlasFrame>>|readonly (AtlasFrame & {readonly filename:string})[];}
export interface InkBounds {readonly left:number;readonly top:number;readonly right:number;readonly bottom:number;}
export interface FontReport {
  readonly kind:'font';readonly fallback:string;readonly lineHeight:number;readonly baseline?:number;
  readonly cellSize?:Size;readonly tones?:Readonly<Record<string,unknown>>;
  readonly glyphs:Readonly<Record<string,{readonly advance:number;readonly frames?:Readonly<Record<string,string>>;readonly bounds?:InkBounds|null}>>;
}
export interface PhaserFont {
  readonly kind:'font';readonly fallback:string;readonly lineHeight:number;readonly baseline?:number;readonly cell?:Size;
  readonly glyphs:string;readonly metrics?:Readonly<Record<string,{readonly advance?:number;readonly bounds?:InkBounds|null}>>;
  readonly tones:Readonly<Record<string,{readonly chars:Readonly<Record<number,{readonly x:number;readonly y:number;readonly width:number;readonly height:number;readonly xOffset:number;readonly yOffset:number;readonly xAdvance:number}>>}>>;
}
export type FontInput={readonly report:FontReport;readonly atlas:Atlas;readonly phaser?:never}|{readonly phaser:PhaserFont;readonly report?:never;readonly atlas?:never};
export const FONT_TONES:readonly string[];
export const BITMAP_TEXT_POLICY:Required<FontPolicy>;
export function fontToneNames(report:{readonly tones?:Readonly<Record<string,unknown>>}):readonly string[];
export function resolveFontText(font:{readonly glyphs:string|Readonly<Record<string,unknown>>|ReadonlySet<string>;readonly fallback:string},text:unknown):string;
export function getFrame(atlas:Atlas,name:string):AtlasRect;
export function normalizeBitmapFont(input:FontInput):BitmapFont;
export function pixelResolution(options:{readonly id:string;readonly revision:number;readonly localToPhysical:{readonly scale:number;readonly origin:Point};readonly physicalPixelsPerSourcePixel:number}):PixelResolution;
export function projectPixelPoint(resolution:PixelResolution,point:Point,direction?:'to-physical'|'to-local'):Point;
export function projectPixelRect(resolution:PixelResolution,rect:Rect,direction?:'to-physical'|'to-local'):Rect;
export function quantizePhysicalPoint(point:Point,options?:{readonly grid?:number}):Point;
export function quantizePhysicalRect(rect:Rect,options?:{readonly grid?:number;readonly mode?:'inside'|'cover'|'nearest'}):Rect;
export interface TextMetrics {readonly advanceOf:(char:string)=>number;readonly lineHeight:number;}
export interface Lines {readonly sourceLines:readonly string[];readonly resolvedLines:readonly string[];}
export interface TextMeasure {readonly sourceLines:readonly string[];readonly width:number;readonly height:number;readonly advanceWidth:number;}
export interface SourceLine {readonly sourceStart:number;readonly sourceEnd:number;readonly caretAdvances:readonly number[];}
export interface BitmapMeasure extends TextMeasure, Lines {
  readonly paintedBounds:{readonly known:boolean;readonly rect:Rect|null};readonly sourceMap?:readonly SourceLine[];
}
export interface TextOptions {readonly scale?:number;readonly maxWidth?:number;readonly policy?:FontPolicy;readonly sourceOffsets?:boolean;}
export function textMetricsLineWidth(metrics:TextMetrics,line:string):number;
export function wrapTextMetrics(metrics:TextMetrics,text:unknown,maxWidth?:number,options?:{readonly policy?:FontPolicy}):{readonly sourceLines:readonly string[]};
export function measureTextMetrics(metrics:TextMetrics,text:unknown,options?:{readonly maxWidth?:number;readonly leading?:number;readonly policy?:FontPolicy}):TextMeasure;
export function bitmapLineWidth(font:BitmapFont,line:string,options?:{readonly scale?:number;readonly trailingAdvance?:0|1}):number;
export function wrapBitmapText(font:BitmapFont,text:unknown,maxWidth:number,options?:{readonly scale?:number;readonly policy?:FontPolicy}):Lines;
export function measureBitmapText(font:BitmapFont,text:unknown,options?:TextOptions):BitmapMeasure;
export interface BitmapPlacement extends BitmapMeasure {
  readonly lines:readonly {readonly x:number;readonly y:number;readonly width:number;readonly source:string;readonly resolved:string;readonly sourceStart?:number;readonly sourceEnd?:number;readonly caretAdvances?:readonly number[]}[];
  readonly draws:readonly {readonly char:string;readonly resolvedChar:string;readonly row:number;readonly frame:string|null;readonly tone:string;readonly source:Rect;readonly destination:Rect;readonly physicalDestination?:Rect}[];
  readonly overflow:{readonly horizontal:boolean;readonly vertical:boolean;readonly painted:{readonly known:boolean;readonly horizontal:boolean|null;readonly vertical:boolean|null}};
}
export interface ContextualBitmapPlacement extends BitmapPlacement {readonly resolution:PixelResolution;readonly context:{readonly id:string;readonly revision:number};readonly physicalPaintedBounds:BitmapMeasure['paintedBounds'];readonly physicalBounds:Rect;readonly bounds:Rect;}
/** wrap:false preserves policy-normalized source lines and all spaces/advances.
 * maxWidth/maxHeight still control alignment and honest fit/paint diagnostics. */
export type PlacementOptions=Omit<TextOptions,'scale'> & {readonly wrap?:boolean;readonly tone?:string;readonly maxHeight?:number;readonly align?:'left'|'center'|'right'} & ({readonly scale?:number;readonly resolution?:never}|{readonly resolution:PixelResolution;readonly scale?:never});
export function placeBitmapText(font:BitmapFont,text:unknown,x:number,y:number,options:PlacementOptions & {readonly resolution:PixelResolution}):ContextualBitmapPlacement;
export function placeBitmapText(font:BitmapFont,text:unknown,x:number,y:number,options?:PlacementOptions):BitmapPlacement;
export interface NineSliceRegion {readonly row:number;readonly column:number;readonly source:Rect;readonly destination:Rect;readonly tile:boolean;readonly period:Size;}
export interface NineSlicePlan {readonly format:'agent-sprites/nine-slice@1';readonly scale:number;readonly bounds:Rect;readonly regions:readonly NineSliceRegion[];}
export interface ContextualNineSlicePlan extends NineSlicePlan {readonly resolution:PixelResolution;readonly context:{readonly id:string;readonly revision:number};readonly physicalPlan:NineSlicePlan;readonly physicalBounds:Rect;readonly paintedBounds:{readonly known:boolean;readonly rect:Rect|null};readonly physicalPaintedBounds:{readonly known:boolean;readonly rect:Rect|null};}
export function planNineSlice(skin:{readonly frame:AtlasRect;readonly insets:Insets},bounds:Rect,options:{readonly resolution:PixelResolution;readonly scale?:never}):ContextualNineSlicePlan;
export function planNineSlice(skin:{readonly frame:AtlasRect;readonly insets:Insets},bounds:Rect,options?:{readonly scale?:number;readonly resolution?:never}):NineSlicePlan;
export function iterateNineSliceTiles(plan:NineSlicePlan):Generator<{readonly source:Rect;readonly destination:Rect;readonly physicalDestination?:Rect},void,unknown>;
export interface CanvasDrawPort {imageSmoothingEnabled:boolean;drawImage(image:unknown,sx:number,sy:number,sw:number,sh:number,dx:number,dy:number,dw:number,dh:number):void;}
export interface BitmapPainter {
  measure(text:unknown,options?:{readonly scale?:number;readonly maxWidth?:number}):{readonly width:number;readonly height:number;readonly lines:readonly string[]};
  wrap(text:unknown,maxWidth:number,options?:{readonly scale?:number}):readonly string[];
  draw(ctx:CanvasDrawPort,text:unknown,x:number,y:number,options?:{readonly scale?:number;readonly tone?:string;readonly maxWidth?:number;readonly align?:'left'|'center'|'right'}):{readonly width:number;readonly height:number;readonly lines:readonly string[]};
  missingGlyphs(text:unknown):readonly string[];
}
export function createBitmapFont(input:{readonly image:unknown;readonly atlas:Atlas;readonly report:FontReport}):BitmapPainter;
export function drawNineSlice(ctx:CanvasDrawPort,assets:{readonly image:unknown;readonly atlas:Atlas;readonly report:{readonly skins:Readonly<Record<string,{readonly insets:Insets}>>}},name:string,x:number,y:number,width:number,height:number,options?:{readonly scale?:number}):void;
export function getOpaqueBounds(image:{readonly data:ArrayLike<number>;readonly width:number;readonly height:number}):Rect|null;
export function pixelFit(bounds:Rect|null,destination:Rect,options?:{readonly padding?:number}):(Rect & {readonly scale:number})|null;
export function drawPixelFit(ctx:CanvasDrawPort,image:unknown,bounds:Rect|null,destination:Rect,options?:{readonly padding?:number}):(Rect & {readonly scale:number})|null;
