/// <reference lib="webworker" />

import type { CutoutMask, JobReply, JobRequest, Outline } from "./sticker-processor";

const worker = self as DedicatedWorkerGlobalScope;
const MAX_EXPORT_SIDE = 1800;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

function surface(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前系统无法读取图片像素。");
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

async function withBitmap<T>(file: Blob, work: (bitmap: ImageBitmap) => T | Promise<T>): Promise<T> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("无法打开这张图片，请选择有效的 PNG、JPG 或 WebP。");
  }
  try {
    if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 32_000_000) {
      throw new Error("图片尺寸过大，请缩小后再试。");
    }
    return await work(bitmap);
  } finally {
    bitmap.close();
  }
}

function inspect(bitmap: ImageBitmap) {
  const { width, height } = bitmap;
  const scale = Math.min(1, 128 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const { context } = surface(w, h);
  context.drawImage(bitmap, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, w, h).data;
  let transparent = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 250) {
      transparent = true;
      break;
    }
  }
  return { width, height, transparent };
}

function normalizedInput(bitmap: ImageBitmap, size: number, isnet = false) {
  const { context } = surface(size, size);
  context.drawImage(bitmap, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  const area = size * size;
  const tensor = new Float32Array(area * 3);
  let max = 1;
  if (isnet) {
    for (let i = 0; i < data.length; i += 4) max = Math.max(max, data[i], data[i + 1], data[i + 2]);
  }
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < area; i++) {
      const value = data[i * 4 + c];
      tensor[c * area + i] = isnet ? value / max - 0.5 : (value / 255 - MEAN[c]) / STD[c];
    }
  }
  return tensor;
}

async function gpuAvailable() {
  const navigator = worker.navigator as WorkerNavigator & {
    gpu?: { requestAdapter(): Promise<{ features: ReadonlySet<string> } | null> };
  };
  const adapter = await navigator.gpu?.requestAdapter();
  return adapter?.features.has("shader-f16") ?? false;
}

type OrtRuntime = typeof import("onnxruntime-web/webgpu");
type OrtSession = import("onnxruntime-web").InferenceSession;
let session: { url: string; runtime: OrtRuntime; instance: OrtSession } | undefined;

async function getSession(url: string) {
  if (session?.url === url) return session;
  if (session) {
    await session.instance.release();
    session = undefined;
  }
  const [ort, wasm, wasmModule] = await Promise.all([
    import("onnxruntime-web/webgpu"),
    import("onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url"),
    import("onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url"),
  ]);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = {
    wasm: new URL(wasm.default, worker.location.href).href,
    mjs: new URL(wasmModule.default, worker.location.href).href,
  };
  const instance = await ort.InferenceSession.create(url, { executionProviders: ["webgpu"] });
  session = { url, runtime: ort, instance };
  return session;
}

async function gpuAlpha(bitmap: ImageBitmap, url: string): Promise<CutoutMask> {
  const size = 512;
  const { runtime, instance } = await getSession(url);
  const tensor = new runtime.Tensor("float32", normalizedInput(bitmap, size), [1, 3, size, size]);
  try {
    const results = await instance.run({ [instance.inputNames[0]]: tensor });
    try {
      const values = await results[instance.outputNames[0]].getData() as Float32Array;
      if (values.length !== size * size) throw new Error("抠图模型返回了无效的蒙版。");
      const scores = new Float32Array(values.length);
      let min = 1;
      let max = 0;
      for (let i = 0; i < scores.length; i++) {
        if (!Number.isFinite(values[i])) throw new Error("显卡返回了无效的抠图结果。");
        const value = 1 / (1 + Math.exp(-values[i]));
        scores[i] = value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      const alpha = new Uint8Array(scores.length);
      for (let i = 0; i < alpha.length; i++) {
        alpha[i] = Math.round((max - min > 0.1 ? (scores[i] - min) / (max - min) : scores[i]) * 255);
      }
      return { size, alpha };
    } finally {
      for (const result of Object.values(results)) result.dispose();
    }
  } finally {
    tensor.dispose();
  }
}

function applyMask(context: OffscreenCanvasRenderingContext2D, mask: CutoutMask, w: number, h: number, threshold: number) {
  const matte = surface(mask.size, mask.size);
  const pixels = matte.context.createImageData(mask.size, mask.size);
  // A soft cutoff around the requested threshold: below it becomes fully
  // transparent, above it fully opaque, with a short ramp keeping the edge smooth.
  const low = Math.max(0, Math.min(255, threshold * 2.55));
  const high = Math.min(255, low + 24);
  for (let i = 0; i < mask.alpha.length; i++) {
    const alpha = mask.alpha[i];
    pixels.data[i * 4 + 3] = threshold <= 0
      ? alpha
      : alpha <= low
        ? 0
        : alpha >= high
          ? 255
          : Math.round(((alpha - low) / (high - low)) * 255);
  }
  matte.context.putImageData(pixels, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(matte.canvas, 0, 0, w, h);
  context.globalCompositeOperation = "source-over";
}

function foregroundBounds(data: Uint8ClampedArray, w: number, h: number) {
  let left = w;
  let right = -1;
  let top = h;
  let bottom = -1;
  for (let i = 3, pixel = 0; i < data.length; i += 4, pixel++) {
    if (data[i] < 20) continue;
    const x = pixel % w;
    const y = Math.floor(pixel / w);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error("没有找到可用的主体，可以试试保留原图。");
  left = Math.max(0, left - 2);
  top = Math.max(0, top - 2);
  right = Math.min(w - 1, right + 2);
  bottom = Math.min(h - 1, bottom + 2);
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** Squared Euclidean distance to the silhouette using a lower envelope of parabolas. */
function distances(alpha: Uint8ClampedArray, w: number, h: number) {
  const size = Math.max(w, h);
  const input = new Float64Array(size);
  const output = new Float64Array(size);
  const sites = new Int32Array(size);
  const edges = new Float64Array(size + 1);
  const grid = new Float32Array(w * h);
  const outside = w * w + h * h + 1;

  function pass(length: number) {
    let last = 0;
    sites[0] = 0;
    edges[0] = -Infinity;
    edges[1] = Infinity;
    for (let q = 1; q < length; q++) {
      let p = sites[last];
      let intersection = (input[q] + q * q - input[p] - p * p) / (2 * (q - p));
      while (intersection <= edges[last]) {
        p = sites[--last];
        intersection = (input[q] + q * q - input[p] - p * p) / (2 * (q - p));
      }
      sites[++last] = q;
      edges[last] = intersection;
      edges[last + 1] = Infinity;
    }
    let best = 0;
    for (let q = 0; q < length; q++) {
      while (edges[best + 1] < q) best++;
      const dx = q - sites[best];
      output[q] = dx * dx + input[sites[best]];
    }
  }

  for (let y = 0; y < h; y++) {
    const start = y * w;
    for (let x = 0; x < w; x++) input[x] = alpha[(start + x) * 4 + 3] >= 32 ? 0 : outside;
    pass(w);
    grid.set(output.subarray(0, w), start);
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) input[y] = grid[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = output[y];
  }
  return grid;
}

async function render(bitmap: ImageBitmap, mask: CutoutMask | null, outline: Outline, threshold: number) {
  const scale = Math.min(1, MAX_EXPORT_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const art = surface(width, height);
  art.context.drawImage(bitmap, 0, 0, width, height);
  if (mask) applyMask(art.context, mask, width, height, threshold);
  const rect = mask
    ? foregroundBounds(art.context.getImageData(0, 0, width, height).data, width, height)
    : { x: 0, y: 0, w: width, h: height };
  const pad = outline.width ? outline.width + 2 : 0;
  const w = rect.w + pad * 2;
  const h = rect.h + pad * 2;
  const output = surface(w, h);
  output.context.drawImage(art.canvas, rect.x, rect.y, rect.w, rect.h, pad, pad, rect.w, rect.h);
  if (outline.width) {
    const source = output.context.getImageData(0, 0, w, h);
    const field = distances(source.data, w, h);
    const layer = surface(w, h);
    const stroke = layer.context.createImageData(w, h);
    const rgb = Number.parseInt(outline.color.slice(1), 16);
    const red = rgb >> 16;
    const green = (rgb >> 8) & 255;
    const blue = rgb & 255;
    const limit = outline.width + 0.5;
    for (let i = 0; i < field.length; i++) {
      if (field[i] >= limit * limit) continue;
      const p = i * 4;
      stroke.data[p] = red;
      stroke.data[p + 1] = green;
      stroke.data[p + 2] = blue;
      stroke.data[p + 3] = Math.round(255 * Math.min(1, limit - Math.sqrt(field[i])));
    }
    layer.context.putImageData(stroke, 0, 0);
    output.context.globalCompositeOperation = "destination-over";
    output.context.drawImage(layer.canvas, 0, 0);
  }
  return output.canvas.convertToBlob({ type: "image/png" });
}

function post(reply: JobReply, transfer: Transferable[] = []) {
  worker.postMessage(reply, transfer);
}

worker.onmessage = ({ data: job }: MessageEvent<JobRequest>) => {
  void (async () => {
    let output: Exclude<JobReply, { error: string }>["output"];
    let transfer: Transferable[] = [];
    switch (job.type) {
      case "inspect":
        output = await withBitmap(job.input.file, inspect);
        break;
      case "gpuAvailable":
        output = await gpuAvailable();
        break;
      case "cutoutGpu": {
        const { file, modelUrl } = job.input;
        const mask = await withBitmap(file, (bitmap) => gpuAlpha(bitmap, modelUrl));
        output = mask;
        transfer = [mask.alpha.buffer];
        break;
      }
      case "cpuInput":
        output = await withBitmap(job.input.file, (bitmap) => normalizedInput(bitmap, 1024, true).buffer);
        transfer = [output];
        break;
      case "render": {
        const { file, mask, outline, threshold } = job.input;
        output = await withBitmap(file, (bitmap) => render(bitmap, mask, outline, threshold));
        break;
      }
    }
    post({ id: job.id, output }, transfer);
  })().catch((error: unknown) => post({
    id: job.id,
    error: error instanceof Error ? error.message : String(error),
  }));
};
