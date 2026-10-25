/** Browser-safe public closure: no Node or Phaser package imports. */
export * from './ui-theme.mjs';
export * from './ui-components.mjs';
export * from './ui-layout.mjs';
export * from './ui-interaction.mjs';
export * from './ui-phaser-runtime.mjs';
export * from './ui-action-group.mjs';
export {FONT_TONES,BITMAP_TEXT_POLICY,fontToneNames,resolveFontText,getFrame,normalizeBitmapFont,pixelResolution,projectPixelPoint,projectPixelRect,quantizePhysicalPoint,quantizePhysicalRect,textMetricsLineWidth,wrapTextMetrics,measureTextMetrics,bitmapLineWidth,wrapBitmapText,measureBitmapText,placeBitmapText,createBitmapFont,planNineSlice,iterateNineSliceTiles,drawNineSlice,getOpaqueBounds,pixelFit,drawPixelFit} from './ui-runtime.mjs';
