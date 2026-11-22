import { useEffect, useRef, useState } from "react";
import { Clapperboard, CloudUpload, Pipette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChromaEditor } from "@/components/desktop-page";
import { saveCreatedVideo } from "@/lib/created-stickers";
import { inTauri } from "@/lib/tauri";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ChromaVideo } from "@/overlay/stickers/chroma";
import type { ChromaKey } from "@/shared/protocol";

const VIDEO_LIMIT = 200 * 1024 * 1024;
const GREEN: ChromaKey = { color: [0.01, 0.96, 0.01], similarity: 0.4, smoothness: 0.08, spill: 0.1 };

/**
 * 视频贴纸：导入本地视频，绿幕视频实时抠像（与桌面上同一套 WebGL 抠像），
 * 点原视频画面可以吸取背景色。保存后进入“我的创作”，桌面上可以继续微调抠像参数。
 */
export function VideoStickerForm({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string>();
  const [name, setName] = useState("");
  const [chroma, setChroma] = useState<ChromaKey | null>(GREEN);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const register = useAppStore((state) => state.registerCreatedSticker);
  const addPet = useAppStore((state) => state.addPet);
  const raw = useRef<HTMLVideoElement>(null);
  const keyed = useRef<HTMLDivElement>(null);
  const chromaRef = useRef<ChromaVideo | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const keying = chroma !== null;

  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  // 抠像预览：原视频元素直接喂给 WebGL；参数变化走 setParams，不重建
  useEffect(() => {
    const video = raw.current;
    const host = keyed.current;
    if (!video || !host || !url || !keying) return;
    const view = new ChromaVideo(video, GREEN);
    view.canvas.className = "absolute inset-0 h-full w-full object-contain";
    host.appendChild(view.canvas);
    chromaRef.current = view;
    return () => {
      view.dispose();
      view.canvas.remove();
      chromaRef.current = null;
    };
  }, [url, keying]);

  useEffect(() => {
    if (chroma) chromaRef.current?.setParams(chroma);
  }, [chroma, url]);

  const choose = (next: File | undefined) => {
    if (!next) return;
    if (!/\.(mp4|webm|mov)$/i.test(next.name)) {
      toast("仅支持 MP4、WebM 和 MOV 视频", "warn");
      return;
    }
    if (next.size > VIDEO_LIMIT) {
      toast("请选择不超过 200 MB 的视频", "warn");
      return;
    }
    setFile(next);
    setName((current) => current || next.name.replace(/\.[^.]+$/, "").slice(0, 30));
  };

  /** 在原视频上点一下，取该点颜色作为抠像键色 */
  const pickColor = (event: React.MouseEvent<HTMLVideoElement>) => {
    if (!picking) return;
    const video = event.currentTarget;
    const rect = video.getBoundingClientRect();
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const ox = (rect.width - video.videoWidth * scale) / 2;
    const oy = (rect.height - video.videoHeight * scale) / 2;
    const x = Math.floor((event.clientX - rect.left - ox) / scale);
    const y = Math.floor((event.clientY - rect.top - oy) / scale);
    if (x < 0 || y < 0 || x >= video.videoWidth || y >= video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, x, y, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    setChroma({ ...(chroma ?? GREEN), color: [r / 255, g / 255, b / 255] });
    setPicking(false);
  };

  const save = async (place: boolean) => {
    if (!file || !name.trim()) return;
    setSaving(true);
    try {
      const created = await saveCreatedVideo(name.trim(), file, chroma);
      register(created);
      toast(place ? `「${created.name}」已经贴到桌面上啦` : "已保存到我的贴纸", "success");
      if (place) addPet(created.id);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "warn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] gap-4">
      <section className="glass flex min-h-0 flex-col rounded-[25px] p-4 shadow-soft">
        {!url ? (
          <button
            type="button"
            onClick={() => picker.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              choose(event.dataTransfer.files[0]);
            }}
            className="grid flex-1 place-items-center rounded-[20px] border-2 border-dashed border-[#cfe0f6] bg-white/50 hover:bg-white/80"
          >
            <span className="text-center">
              <CloudUpload className="mx-auto h-8 w-8 text-[#7aa7e6]" />
              <span className="mt-2 block text-[13px] font-bold text-ink">选择或拖入视频</span>
              <span className="mt-1 block text-[10.5px] text-ink-soft">MP4 / WebM / MOV，绿幕视频可以自动抠像</span>
            </span>
          </button>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
            <figure className="relative m-0 min-h-0 overflow-hidden rounded-[18px] bg-[#1d2533]">
              <video
                ref={raw}
                src={url}
                muted
                loop
                autoPlay
                playsInline
                onClick={pickColor}
                className={cn("absolute inset-0 h-full w-full object-contain", picking && "cursor-crosshair")}
              />
              <figcaption className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[9.5px] font-semibold text-white">
                {picking ? "点击背景取色" : "原视频"}
              </figcaption>
            </figure>
            <figure className="sticker-editor-checker relative m-0 min-h-0 overflow-hidden rounded-[18px]">
              <div ref={keyed} className="absolute inset-0" />
              {!keying && <video src={url} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" />}
              <figcaption className="absolute left-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[9.5px] font-semibold text-ink-soft">桌面效果</figcaption>
            </figure>
          </div>
        )}
        <input
          ref={picker}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mov"
          hidden
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </section>

      <section className="glass flex min-h-0 flex-col gap-3 overflow-y-auto rounded-[25px] p-4 shadow-soft">
        <div className="flex items-center gap-2 text-[13px] font-bold text-ink">
          <Clapperboard className="h-4 w-4 text-[#548be1]" /> 视频贴纸
        </div>
        <label className="grid gap-1.5 text-[11px] font-semibold text-ink-soft">
          名称
          <Input value={name} maxLength={30} onChange={(event) => setName(event.target.value)} placeholder="给它起个名字" />
        </label>
        <ChromaEditor value={chroma} onChange={setChroma} />
        <button
          type="button"
          disabled={!url || !keying}
          onClick={() => setPicking((value) => !value)}
          className={cn(
            "pressable inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold disabled:opacity-40",
            picking ? "border-[#8eb6ed] bg-[#eaf3ff] text-[#3d6fae]" : "border-[#dce7f5] bg-white text-[#466c98] hover:bg-[#eff6ff]"
          )}
        >
          <Pipette className="h-3.5 w-3.5" />
          {picking ? "点击左侧原视频取色…" : "从画面吸取背景色"}
          {chroma && (
            <span
              className="ml-1 h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
              style={{ background: `rgb(${chroma.color.map((c) => Math.round(c * 255)).join(",")})` }}
            />
          )}
        </button>
        {url && (
          <button type="button" onClick={() => picker.current?.click()} className="text-[10.5px] font-semibold text-[#4a8df8] hover:underline">
            换一个视频
          </button>
        )}
        <div className="mt-auto grid gap-2">
          {!inTauri && <p className="text-[10px] text-ink-faint">视频贴纸需要在桌面端保存。</p>}
          <button
            type="button"
            disabled={!file || !name.trim() || saving || !inTauri}
            onClick={() => void save(true)}
            className="pressable inline-flex items-center justify-center gap-2 rounded-xl bg-[#437ecb] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#366fb9] disabled:opacity-45"
          >
            保存并贴到桌面
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!file || !name.trim() || saving || !inTauri}
              onClick={() => void save(false)}
              className="pressable flex-1 rounded-xl border border-[#dce7f5] bg-white px-3 py-2 text-[11px] font-bold text-[#466c98] hover:bg-[#eff6ff] disabled:opacity-45"
            >
              只保存
            </button>
            <button
              type="button"
              onClick={onOpenLibrary}
              className="pressable flex-1 rounded-xl border border-[#dce7f5] bg-white px-3 py-2 text-[11px] font-bold text-[#466c98] hover:bg-[#eff6ff]"
            >
              去贴纸库
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
