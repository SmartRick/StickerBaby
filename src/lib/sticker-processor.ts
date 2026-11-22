export interface CutoutMask {
  size: 512 | 1024;
  alpha: Uint8Array<ArrayBuffer>;
}

export interface ImageInfo {
  width: number;
  height: number;
  transparent: boolean;
}

export interface Outline {
  width: number;
  color: string;
}

interface Jobs {
  inspect: { input: { file: Blob }; output: ImageInfo };
  gpuAvailable: { input: object; output: boolean };
  cutoutGpu: { input: { file: Blob; modelUrl: string }; output: CutoutMask };
  cpuInput: { input: { file: Blob }; output: ArrayBuffer };
  render: { input: { file: Blob; mask: CutoutMask | null; outline: Outline; threshold: number }; output: Blob };
}

export type JobType = keyof Jobs;
export type JobRequest = {
  [Type in JobType]: { id: number; type: Type; input: Jobs[Type]["input"] }
}[JobType];
export type JobReply =
  | { id: number; output: Jobs[JobType]["output"] }
  | { id: number; error: string };

export class StickerProcessor {
  private worker = new Worker(new URL("./sticker-processor.worker.ts", import.meta.url), { type: "module" });
  private nextId = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<JobReply>) => {
      const job = this.pending.get(data.id);
      this.pending.delete(data.id);
      if ("error" in data) job?.reject(new Error(data.error));
      else job?.resolve(data.output);
    };
    this.worker.onerror = () => this.close("图片处理暂时不可用，请重新打开创建页面。");
  }

  run<Type extends JobType>(type: Type, input: Jobs[Type]["input"]): Promise<Jobs[Type]["output"]> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve: (value) => resolve(value as Jobs[Type]["output"]), reject });
      this.worker.postMessage({ id, type, input });
    });
  }

  close(message = "图片处理已结束。") {
    this.worker.terminate();
    for (const request of this.pending.values()) request.reject(new Error(message));
    this.pending.clear();
  }
}
