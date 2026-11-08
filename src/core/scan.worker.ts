/// <reference lib="webworker" />
import { scanImage } from './detect';

/** Analisa páginas fora da linha principal, para a interface não travar ao importar. */
self.onmessage = async (e: MessageEvent<{ id: number; blob: Blob; rtl: boolean }>) => {
  const { id, blob, rtl } = e.data;
  try {
    const bmp = await createImageBitmap(blob);
    const scan = scanImage(bmp, rtl, (w, h) => new OffscreenCanvas(w, h));
    bmp.close();
    self.postMessage({ id, scan });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
