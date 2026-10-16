import type {UiTheme, UiData, Rect} from './ui-theme.mjs';
import type {UiNode} from './ui-components.mjs';
import type {Context, ResolvedContext, ExtensionDefinition, LayoutRecord} from './ui-layout.mjs';
import type {NormalizedUiEvent, UiIntent, InteractionPolicy} from './ui-interaction.mjs';

/** Structural subset of installed Phaser 4.2.1; no second Phaser package is loaded. */
export interface NativeObject {
  setOrigin(x:number,y?:number):this; setPosition(x:number,y:number):this;
  setScale(x:number,y?:number):this; setVisible(visible:boolean):this; setDepth(depth:number):this;
  destroy():void;
}
export interface NativeImage extends NativeObject {
  setTint(color:number):this;
  setTexture(texture:string,frame?:string|number):this;
  setFrame(frame:string|number|NativeFrame):this; setCrop(x?:number,y?:number,width?:number,height?:number):this;
}
export interface NativeRectangle extends NativeObject {setSize(width:number,height:number):this;setFillStyle(color:number):this;}
export interface NativeTexture {
  readonly source:readonly unknown[];
  get(name:string):NativeFrame;
}
/** Native Frame clones are never registered in the borrowed Texture frame map. */
export interface NativeFrame {
  name:string;sourceIndex:number;source:unknown;
  clone():NativeFrame;
  setSize(width:number,height:number,x?:number,y?:number):this;
  destroy():void;
}
/** Structural foreign-object boundary: Phaser Container.add is generic over GameObject. */
export interface NativeParent {add(object:object):unknown;}
export interface NativeScene {
  readonly add:{image(x:number,y:number,texture:string|NativeTexture,frame?:string|number):NativeImage;rectangle(x:number,y:number,width:number,height:number,color:number):NativeRectangle};
  readonly events:{on(event:'shutdown',listener:()=>void):unknown;off(event:'shutdown',listener:()=>void):unknown};
}
export interface AssetRequest {readonly kind:'font'|'skin'|'icon';readonly id:string;readonly tone?:string;}
/** Asset resolution is pure and returns immutable game-owned cache references. */
export interface BorrowedAsset {readonly ownership:'borrowed';readonly texture:NativeTexture;readonly sourceIndex?:number;}
/** Full tightly packed RGBA8 source plane. Never an output-sized/widget raster.
 * The identity must be the requested TextureSource. Bytes are copied by the host;
 * the game guarantees its borrowed source remains immutable for that identity. */
export interface SourceRGBA {readonly source:unknown;readonly width:number;readonly height:number;readonly data:Uint8Array|Uint8ClampedArray;}
export interface SourceRGBARequest extends AssetRequest {
  readonly texture:NativeTexture;readonly sourceIndex:number;readonly source:unknown;
  /** Remaining per-mount byte budget. Return null when readback is unavailable. */
  readonly maxBytes:number;
}
export type ContextAttachment = {readonly ownership:'borrowed';readonly parent:NativeParent}
  | {readonly ownership:'owned';readonly parent:NativeParent;readonly release:()=>void};
export interface OwnershipScope {
  /** Registers only explicitly owned resources; borrowed assets/parents must never be passed here. */
  own<T>(value:T,release:(value:T)=>void):T;
  onDispose(release:()=>void):void;
}
export interface ExtensionAllocation {
  readonly controlId:string;readonly enabled:boolean;readonly bounds:Rect;readonly clipBounds:Rect|null;
  readonly context:ResolvedContext;readonly contextRevisions:Readonly<Record<string,number>>;
}
export interface ExtensionRegion {
  readonly id:string;readonly bounds:Rect;readonly actionId?:string;readonly label?:string;
  readonly enabled?:boolean;readonly focusable?:boolean;readonly role?:string;
}
export interface ExtensionNativeScope<F> extends OwnershipScope {readonly native:F;}
export interface NativeExtension<F=unknown> extends ExtensionDefinition {
  /** Pure bounded regions in the allocation's semantic coordinate space. IDs are qualified by the host. */
  readonly regions?:(model:UiData,allocation:ExtensionAllocation)=>readonly ExtensionRegion[];
  readonly mount:(model:UiData,allocation:ExtensionAllocation,scope:ExtensionNativeScope<F>)=>void;
}
export interface NativePorts<F=unknown> {
  resolveAsset(request:AssetRequest):BorrowedAsset;
  /** Optional pure acquisition from immutable borrowed art. No uniformity flags
   * are accepted: the painter checks identity, dimensions, RGBA8 length and every
   * compared byte itself. SharedArrayBuffer planes reject. */
  readSourceRGBA?(request:SourceRGBARequest):SourceRGBA|null|undefined;
  /** One attachment per declared context, reused while its descriptor is compatible. Parent/camera transforms must realize that context exactly. */
  attachContext(request:{readonly context:ResolvedContext;readonly parent:NativeParent;readonly scope:string},owner:OwnershipScope):ContextAttachment;
  /** Game-declared narrow extension API. In particular this must not expand Space's seven-operation chart authority. */
  extensionFacade?(request:{readonly extensionId:string;readonly allocation:ExtensionAllocation},owner:OwnershipScope):F;
}
export interface UiSnapshot {readonly revision:number;readonly tree:UiNode;readonly context:Context;readonly additionalContexts?:readonly Context[];}
export interface NativeObservation {
  readonly scopeId:string;readonly modelRevision:number;readonly disposed:boolean;readonly focusId:string|null;readonly hoverId:string|null;readonly heldCount:number;
  readonly controls:readonly {readonly id:string;readonly kind:string;readonly role:string;readonly enabled:boolean;readonly focused:boolean;readonly hovered:boolean;readonly pressed:boolean;
    readonly state:string;readonly bounds:Rect;readonly effectiveHitBounds:Rect|null;readonly effectiveFocusBounds:Rect|null;readonly clipBounds:Rect|null;readonly paintBounds:Rect|null;readonly contextRevisions:Readonly<Record<string,number>>}[];
  readonly nextAfterId:string|null;
  readonly native:{readonly lifecycle:'mounted'|'retired'|'disposed';readonly objects:number;readonly fragments:number;readonly attachments:number;readonly extensions:number;readonly created:number;readonly destroyed:number;readonly cleanupFailures:readonly string[]};
}
export interface MountedPhaserUi {
  update(snapshot:UiSnapshot):void;
  handle(input:NormalizedUiEvent):readonly UiIntent[];
  inspect(options:{readonly limit:number;readonly afterId?:string}):NativeObservation;
  dispose():void;
}
export interface PhaserUi<F=unknown> {
  mount(snapshot:UiSnapshot,options:{readonly parent:NativeParent;readonly scope:string;readonly policy?:InteractionPolicy}):MountedPhaserUi;
  registerExtension(id:`${string}:${string}`,definition:NativeExtension<F>):()=>void;
  dispose():void;
}
export function createPhaserUi<F=unknown>(options:{readonly scene:NativeScene;readonly theme:UiTheme;readonly ports:NativePorts<F>;readonly limits?:{readonly objects?:number;readonly fragments?:number;readonly extensionRegions?:number;readonly sourceBytes?:number}}):PhaserUi<F>;
