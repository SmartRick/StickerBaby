import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/lib/tauri";
import type { CutoutMask, StickerProcessor } from "@/lib/sticker-processor";

const WEB_MODEL = "https://huggingface.co/studioludens/birefnet-lite-512/resolve/18d56c5/onnx/model_fp16.onnx";

type ProcessingStatus = (label: string) => void;
type Model = "birefnet" | "isnet";

async function prepareModel(model: Model, update: ProcessingStatus) {
  const name = model === "birefnet" ? "抠图模型" : "兼容模型";
  update("正在准备" + name + "…");
  const progress = new Channel<{ total: number; downloaded: number }>();
  progress.onmessage = ({ total, downloaded }) => {
    update("正在下载" + name + " " + Math.floor(downloaded / total * 100) + "%");
  };
  return invoke<string>("prepare_cutout_model", { model, progress });
}

export async function removeBackground(
  file: File,
  processor: StickerProcessor,
  update: ProcessingStatus,
  active: () => boolean,
): Promise<CutoutMask> {
  try {
    if (await processor.run("gpuAvailable", {}) && active()) {
      const url = inTauri ? convertFileSrc(await prepareModel("birefnet", update)) : WEB_MODEL;
      if (!active()) throw new Error("抠图已取消。");
      update("正在自动抠图，第一次载入模型可能需要稍等…");
      return await processor.run("cutoutGpu", { file, modelUrl: url });
    }
  } catch (error) {
    if (!inTauri || !active()) throw error;
    console.info("[sticker cutout] WebGPU unavailable, trying native CPU", error);
  }

  if (!active()) throw new Error("抠图已取消。");
  if (!inTauri) throw new Error("当前浏览器不支持此模型所需的 WebGPU，可使用保留原图。");
  await prepareModel("isnet", update);
  if (!active()) throw new Error("抠图已取消。");
  update("正在使用兼容模式抠图…");
  const input = await processor.run("cpuInput", { file });
  if (!active()) throw new Error("抠图已取消。");
  const result = await invoke<ArrayBuffer>("cutout_cpu", input);
  const alpha = new Uint8Array(result);
  if (alpha.length !== 1024 * 1024) throw new Error("兼容模式返回了无效的蒙版。");
  return { size: 1024, alpha };
}
