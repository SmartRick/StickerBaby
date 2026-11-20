import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowRight,
  Check,
  CloudUpload,
  ImagePlus,
  LoaderCircle,
  Replace,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { Segmented } from "@/components/segmented";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { removeBackground } from "@/lib/cutout";
import { saveCreatedSticker } from "@/lib/created-stickers";
import { StickerProcessor, type CutoutMask, type ImageInfo } from "@/lib/sticker-processor";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const TABS = ["贴纸制作", "AI 生成"] as const;
const PREVIEWS = ["贴纸效果", "原图"] as const;
type Mode = "cutout" | "original";
const OUTLINE_COLORS = [
  { name: "白色", hex: "#ffffff" },
  { name: "奶油色", hex: "#ffefce" },
  { name: "浅蓝色", hex: "#c9e3ff" },
  { name: "深灰色", hex: "#343d4c" },
];
const FILE_LIMIT = 25 * 1024 * 1024;
const FILE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const EXAMPLE = "一只拿草莓的刺猬，用柔和的蜡笔画风，圆润轮廓，浅色白边。";

const primaryButton = "pressable inline-flex items-center justify-center gap-2 rounded-xl bg-[#437ecb] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#366fb9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#77a8ee] disabled:cursor-not-allowed disabled:opacity-45";
const secondaryButton = "pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#dce7f5] bg-white px-3 py-2 text-[11px] font-bold text-[#466c98] hover:bg-[#eff6ff] focus-visible:outline-2 focus-visible:outline-[#77a8ee]";

function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 220);
}

function StickerEditor({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const processor = useRef<StickerProcessor | null>(null);
  const pending = useRef(0);
  const active = useRef(false);
  const savingRef = useRef(false);
  const register = useAppStore((state) => state.registerCreatedSticker);
  const selectSticker = useAppStore((state) => state.selectSticker);

  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("cutout");
  const [mask, setMask] = useState<CutoutMask | null>(null);
  const [width, setWidth] = useState(10);
  const [color, setColor] = useState(OUTLINE_COLORS[0].hex);
  const [preview, setPreview] = useState<(typeof PREVIEWS)[number]>("贴纸效果");
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [previewProblem, setPreviewProblem] = useState("");
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState({ blob: null as Blob | null, name: "" });
  const [rendered, setRendered] = useState<{
    file: File;
    mask: CutoutMask | null;
    width: number;
    color: string;
    blob: Blob;
  } | null>(null);

  const appliedMask = mode === "cutout" ? mask : null;
  const ready = Boolean(info && (mode === "original" || appliedMask));
  const result = ready && rendered?.file === file && rendered?.mask === appliedMask
    && rendered.width === width && rendered.color === color ? rendered.blob : null;
  const originalUrl = useObjectUrl(file);
  const resultUrl = useObjectUrl(result === file ? null : result);
  const shownUrl = preview === "原图" || result === file ? originalUrl : resultUrl ?? originalUrl;
  const alreadySaved = Boolean(result) && saved.blob === result && saved.name === name.trim();

  const getProcessor = () => (processor.current ??= new StickerProcessor());
  const stopWork = () => {
    pending.current++;
    if (active.current) {
      processor.current?.close();
      processor.current = null;
    }
    active.current = false;
    setStatus("");
  };

  useEffect(() => () => {
    pending.current++;
    processor.current?.close();
    processor.current = null;
    active.current = false;
  }, []);

  useEffect(() => {
    setPreviewProblem("");
    if (!file || !ready) return;
    if (!appliedMask && width === 0) {
      setRendered({ file, mask: null, width, color, blob: file });
      return;
    }

    let current = true;
    const timer = window.setTimeout(() => {
      void getProcessor().run("render", { file, mask: appliedMask, outline: { width, color } })
        .then((blob) => {
          if (current) setRendered({ file, mask: appliedMask, width, color, blob });
        }, (error: unknown) => {
          if (current) setPreviewProblem(errorMessage(error));
        });
    }, 85);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [file, ready, appliedMask, width, color]);

  const upload = async (next: File) => {
    if (savingRef.current) return;
    const knownExtension = /\.(png|jpe?g|webp)$/i.test(next.name);
    if (!FILE_TYPES.includes(next.type) && !(next.type === "" && knownExtension)) {
      setProblem("请选择 PNG、JPG 或 WebP 图片。");
      return;
    }
    if (!next.size || next.size > FILE_LIMIT) {
      setProblem("请选择不超过 25 MB 的图片。");
      return;
    }

    stopWork();
    const job = pending.current;
    active.current = true;
    setInfo(null);
    setFile(null);
    setMask(null);
    setRendered(null);
    setProblem("");
    setPreviewProblem("");
    setSaved({ blob: null, name: "" });
    setStatus("正在读取图片…");

    try {
      const nextInfo = await getProcessor().run("inspect", { file: next });
      if (pending.current !== job) return;
      setInfo(nextInfo);
      setFile(next);
      setName(next.name.replace(/\.[^.]+$/, "").slice(0, 60) || "新贴纸");
      setMode(nextInfo.transparent ? "original" : "cutout");
      setWidth(nextInfo.transparent ? 0 : 10);
      setPreview("贴纸效果");
    } catch (error) {
      if (pending.current === job) setProblem(errorMessage(error));
    } finally {
      if (pending.current === job) {
        active.current = false;
        setStatus("");
      }
    }
  };

  const setSourceMode = (next: Mode) => {
    if (mode === next) return;
    stopWork();
    setMode(next);
    setProblem("");
    setWidth(next === "original" ? 0 : 10);
    setPreview("贴纸效果");
  };

  const runCutout = async () => {
    if (!file || active.current || savingRef.current) return;
    const job = ++pending.current;
    active.current = true;
    setProblem("");
    setStatus("正在检测本机抠图能力…");
    const current = () => pending.current === job;
    try {
      const matte = await removeBackground(file, getProcessor(), (label) => {
        if (current()) setStatus(label);
      }, current);
      if (!current()) return;
      setMask(matte);
      setPreview("贴纸效果");
    } catch (error) {
      if (current()) setProblem(errorMessage(error));
    } finally {
      if (current()) {
        active.current = false;
        setStatus("");
      }
    }
  };

  const save = async () => {
    const label = name.trim();
    if (!result || !label || savingRef.current || alreadySaved) return;
    savingRef.current = true;
    setSaving(true);
    setProblem("");
    try {
      const sticker = await saveCreatedSticker(label, result);
      register(sticker);
      selectSticker(sticker.id);
      setSaved({ blob: result, name: label });
      toast("已保存到我的贴纸", "success");
    } catch (error) {
      setProblem("保存失败。" + errorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const next = event.dataTransfer.files[0];
    if (next) void upload(next);
  };

  return (
    <div className="grid min-h-0 gap-3.5 min-[900px]:grid-cols-[minmax(0,1.38fr)_minmax(260px,1fr)]">
      <input
        ref={picker}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        aria-label="上传贴纸图片"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const next = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (next) void upload(next);
        }}
      />
      <section
        aria-label="图片预览"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={drop}
        className="glass flex min-h-[320px] min-w-0 flex-col gap-2.5 rounded-[25px] p-3 shadow-soft"
      >
        <div className="flex items-center justify-between gap-2">
          {file ? (
            <Segmented options={PREVIEWS} value={preview} onChange={setPreview} className="w-[158px] shrink-0" itemClassName="h-7 whitespace-nowrap px-2 text-[11px]" />
          ) : (
            <h3 className="px-1.5 text-[13px] font-bold text-ink">图片预览</h3>
          )}
          {file && (
            <button type="button" className={secondaryButton} disabled={saving} onClick={() => picker.current?.click()}>
              <Replace className="size-3.5" aria-hidden /> 更换图片
            </button>
          )}
        </div>

        <div className={cn(
          "sticker-editor-checker relative grid min-h-[224px] flex-1 place-items-center overflow-hidden rounded-[17px] border border-[#e2ebf7]",
          dragging && "ring-2 ring-inset ring-[#76aaf0]",
        )}>
          {file && shownUrl ? (
            <img
              src={shownUrl}
              draggable={false}
              alt={preview === "原图" ? "上传的原图" : "贴纸效果预览"}
              className="absolute inset-0 m-auto h-[86%] max-h-[300px] w-[86%] object-contain"
            />
          ) : (
            <button
              type="button"
              aria-label="选择图片"
              onClick={() => picker.current?.click()}
              className="group flex max-w-[275px] flex-col items-center rounded-[22px] border border-dashed border-[#b4cce9] bg-white/85 px-8 py-7 text-center outline-none hover:border-[#79a6df] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#79a6df]"
            >
              <span className="mb-3 grid size-12 place-items-center rounded-[17px] bg-[#e7f1ff] text-[#4e82c0] group-hover:bg-[#dcecff]">
                <CloudUpload className="size-6" aria-hidden />
              </span>
              <span className="text-[14px] font-bold text-ink">选择或拖入图片</span>
              <span className="mt-1.5 text-[11px] text-ink-soft">PNG、JPG、WebP · 最大 25 MB</span>
            </button>
          )}
          {dragging && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#e5f0ff]/90 text-[15px] font-bold text-[#366fb9]">
              松开鼠标上传图片
            </div>
          )}
          {status && !dragging && (
            <div role="status" className="absolute inset-x-3 bottom-3 mx-auto flex w-fit max-w-[calc(100%-24px)] items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-[11px] font-semibold text-[#456489] shadow-sm">
              <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
              {status}
            </div>
          )}
        </div>

        <div className="flex min-h-6 items-center justify-between gap-2 px-1 text-[11px] text-ink-soft">
          {file && info ? (
            <>
              <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
              <span className="shrink-0 tabular-nums">{info.width} × {info.height} px</span>
            </>
          ) : <span>上传后可预览原图、透明背景和描边效果。</span>}
        </div>
      </section>

      <section aria-label="贴纸设置" className="glass flex min-w-0 flex-col gap-2.5 rounded-[25px] p-3 shadow-soft">
        <fieldset disabled={!file || saving} className="space-y-1.5 disabled:opacity-55">
          <legend className="mb-1 text-[13px] font-bold text-ink">图片处理</legend>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#e3edf9] bg-[#edf4fd] p-1">
            {([
              { key: "cutout", label: "自动抠图", icon: ScanLine },
              { key: "original", label: "保留原图", icon: ImagePlus },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                type="button"
                key={key}
                aria-pressed={key === mode}
                onClick={() => setSourceMode(key)}
                className={cn(
                  "flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-1 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-[#7aaef0]",
                  key === mode ? "bg-white text-[#3d6fae] shadow-sm" : "text-ink-soft hover:bg-white/70",
                )}
              >
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-ink-soft">
            {mode === "cutout"
              ? mask ? "背景已移除。可对照原图检查效果。" : "模型在本机运行，首次使用会下载模型。"
              : info?.transparent ? "已检测到透明背景，可以直接保存或添加描边。" : "保留上传图片，用原图制作贴纸。"}
          </p>
          {file && mode === "cutout" && !mask && (
            <button type="button" className={secondaryButton} disabled={Boolean(status)} onClick={() => void runCutout()}>
              <ScanLine className="size-3.5" aria-hidden /> {problem ? "重试自动抠图" : "开始抠图"}
            </button>
          )}
        </fieldset>

        <fieldset disabled={!file || saving} className="space-y-1.5 disabled:opacity-55">
          <legend className="mb-1 w-full text-[13px] font-bold text-ink">
            <span className="flex items-center justify-between gap-2">
              描边
              <output className="text-[11px] font-semibold tabular-nums text-ink-soft">
                {width === 0 ? "无" : width + " px"}
              </output>
            </span>
          </legend>
          <Slider
            min={0}
            max={24}
            step={1}
            value={[width]}
            disabled={!file || saving}
            aria-label="描边宽度"
            onValueChange={([value]) => setWidth(value)}
            className="h-5 cursor-pointer"
          />
          <div className="flex items-center gap-2" role="group" aria-label="描边颜色">
            {OUTLINE_COLORS.map(({ name, hex }) => (
              <button
                key={hex}
                type="button"
                aria-label={name}
                aria-pressed={color === hex}
                title={name}
                onClick={() => { setColor(hex); if (!width) setWidth(10); }}
                className={cn("grid size-7 place-items-center rounded-lg border focus-visible:outline-2 focus-visible:outline-[#7aaef0]",
                  color === hex ? "border-[#659ee6] ring-1 ring-[#8ebcf5]" : "border-[#d7e3f3]")}
                style={{ backgroundColor: hex }}
              >
                {color === hex && <Check className={cn("size-3.5", hex === "#343d4c" ? "text-white" : "text-[#426f9e]")} strokeWidth={2.6} aria-hidden />}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="grid gap-1 text-[13px] font-bold text-ink">
          贴纸名称
          <Input
            value={name}
            disabled={!file || saving}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="给贴纸起个名字"
            className="h-8 rounded-xl border-[#dce7f5] bg-white/80 text-[12px]"
          />
        </label>

        <div className="mt-auto space-y-1.5 pt-0.5">
          {(problem || previewProblem) && (
            <p role="alert" className="rounded-xl bg-[#fff0ed] px-2.5 py-2 text-[11px] leading-relaxed text-[#a43a42]">{problem || previewProblem}</p>
          )}
          {ready && !result && !previewProblem && (
            <p role="status" className="text-[11px] text-ink-soft">正在更新贴纸效果…</p>
          )}
          {alreadySaved ? (
            <button type="button" className={cn(secondaryButton, "w-full")} onClick={onOpenLibrary}>
              <Check className="size-4" aria-hidden /> 已保存 · 查看我的贴纸 <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : (
            <button type="button" className={cn(primaryButton, "w-full")} onClick={() => void save()} disabled={!result || !name.trim() || saving}>
              {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {saving ? "正在保存…" : "保存到我的贴纸"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function AiStickerForm() {
  const [prompt, setPrompt] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <form
      className="glass grid max-w-[670px] gap-3 rounded-[25px] p-5 shadow-soft"
      onSubmit={(event) => {
        event.preventDefault();
        if (prompt.trim()) setSubmitted(true);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="sticker-prompt" className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Sparkles className="size-4 text-[#548be1]" aria-hidden /> 你想生成什么贴纸？
        </label>
        <button type="button" onClick={() => { setPrompt(EXAMPLE); setSubmitted(false); }} className={secondaryButton}>填入示例</button>
      </div>
      <textarea
        id="sticker-prompt"
        placeholder="描述贴纸的主体、动作和画风"
        value={prompt}
        maxLength={600}
        onChange={(event) => { setPrompt(event.target.value); setSubmitted(false); }}
        className="min-h-40 resize-y rounded-[17px] border border-[#dce7f5] bg-white/85 p-3.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-[#8eb6ed] focus:ring-2 focus:ring-[#cfE3ff]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-[11px] leading-relaxed text-ink-soft">
          {submitted ? "提示词已提交，生成服务接入后可生成图片。" : "生成服务待接入。你可以先填写和提交提示词。"}
        </p>
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] tabular-nums text-ink-faint">{prompt.length} / 600</span>
          <button className={primaryButton} disabled={!prompt.trim()} type="submit">提交生成</button>
        </div>
      </div>
    </form>
  );
}

export function CreateStickerPage({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("贴纸制作");
  return (
    <div className="h-full overflow-y-auto px-0.5 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-2 pb-4 pt-2.5">
        <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">创建贴纸</h2>
        <Segmented options={TABS} value={tab} onChange={setTab} className="min-w-[174px]" />
      </header>
      <div hidden={tab !== "贴纸制作"}>
        <StickerEditor onOpenLibrary={onOpenLibrary} />
      </div>
      <div hidden={tab !== "AI 生成"}>
        <AiStickerForm />
      </div>
    </div>
  );
}
