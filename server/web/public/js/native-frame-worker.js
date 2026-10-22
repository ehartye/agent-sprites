import { rasterNativeFrame } from './native-frame-raster.js';

self.onmessage = ({ data: { id, task } }) => {
  try {
    const canvas = rasterNativeFrame(task, (width, height) => new OffscreenCanvas(width, height));
    const image = canvas.transferToImageBitmap();
    self.postMessage({ id, image }, [image]);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
