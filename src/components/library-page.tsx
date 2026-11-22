import { useId, useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import {
  ChevronRight,
  Layers,
  MonitorUp,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StickerImage } from "@/components/sticker-image";
import { PackPicker } from "@/components/pack-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStickerCatalog } from "@/hooks/use-sticker-catalog";
import { useAppStore } from "@/lib/store";
import { deleteCreatedSticker } from "@/lib/created-stickers";
import { CHARACTERS, characterHasAnimated, type StickerCharacter } from "@/lib/characters";
import { packOf } from "@/lib/packs";
import { STICKERS, STATE_LABEL } from "@/lib/stickers";
import {
  FORMAT_FILTER_OPTIONS,
  MOOD_FILTER_OPTIONS,
  MOOD_LABEL,
  STYLE_FILTER_OPTIONS,
  STYLE_LABEL,
  SUBJECT_FILTER_OPTIONS,
  SUBJECT_LABEL,
  type FilterOption,
  type FormatFilter,
  type MoodFilter,
  type StyleFilter,
  type SubjectFilter,
} from "@/lib/taxonomy";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Only offer facets that actually exist in the current catalog. */
const AVAILABLE_SUBJECTS = new Set(CHARACTERS.map((character) => character.subject));
const AVAILABLE_STYLES = new Set(CHARACTERS.map((character) => character.style));
const AVAILABLE_MOODS = new Set(CHARACTERS.map((character) => character.mood));

const SUBJECT_OPTIONS = SUBJECT_FILTER_OPTIONS.filter(
  (option) => option.value === "all" || AVAILABLE_SUBJECTS.has(option.value)
);
const STYLE_OPTIONS = STYLE_FILTER_OPTIONS.filter(
  (option) => option.value === "all" || AVAILABLE_STYLES.has(option.value)
);
const MOOD_OPTIONS = MOOD_FILTER_OPTIONS.filter(
  (option) => option.value === "all" || AVAILABLE_MOODS.has(option.value)
);

function FacetSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "shrink-0 gap-1.5 rounded-xl border-[#dce7f5] bg-white/80 px-3 text-[11px] font-semibold text-ink-soft shadow-none",
          "data-[size=default]:h-9 data-[state=open]:border-[#9fc4f7] [&_svg:not([class*='size-'])]:size-3.5",
          value !== "all" && "border-[#b6d1f6] bg-[#edf5ff] text-[#3d6698]",
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        sideOffset={5}
        className="max-h-[320px] rounded-xl border-white/80 bg-[#fbfdff] p-1 shadow-[0_18px_40px_-22px_rgba(42,78,128,0.45)]"
      >
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="rounded-lg text-[11px]">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterOptions<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[11px] font-bold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="inline-flex rounded-lg border border-[#e4ecf7] bg-white px-2.5 py-1.5 text-[11px] leading-4 text-ink-soft hover:border-[#b6d1f6] peer-checked:border-[#aacaf5] peer-checked:bg-[#eaf3ff] peer-checked:font-bold peer-checked:text-[#365f91] peer-focus-visible:outline-2 peer-focus-visible:outline-[#7eaff6]">
              {option.value === "all" ? "全部" : option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LibraryCard({ character }: { character: StickerCharacter }) {
  const pets = useAppStore((state) => state.pets);
  const selectSticker = useAppStore((state) => state.selectSticker);
  const addPet = useAppStore((state) => state.addPet);
  const reduceMotion = useAppStore((state) => state.settings.reduceMotion);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const removeCreated = useAppStore((state) => state.removeCreatedSticker);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const sticker = character.defaultVariant;
  const { variants } = character;
  const pose = variants[poseIndex] ?? sticker;
  const pack = packOf(character);
  const summary = sticker.created ? ["我的创作", "纯静态"] : [pack?.title, STYLE_LABEL[character.style]];
  const hasAnimated = characterHasAnimated(character);
  const stateCount = variants.length;
  const hasStates = stateCount > 1;
  const quickStates = stateCount <= 3
    ? variants.map((_, index) => index)
    : [0, Math.floor(stateCount / 2), stateCount - 1];
  const onDesktop = pets.filter((pet) => variants.some((variant) => variant.id === pet.stickerId)).length;
  const artwork = { background: `radial-gradient(120% 110% at 50% 0%, #fff 0%, ${sticker.accent} 100%)` };

  const chooseState = (index: number) => {
    setPoseIndex(index);
    selectSticker(variants[index].id);
  };

  const openPreview = (trigger: HTMLButtonElement) => {
    previewTrigger.current = trigger;
    selectSticker(pose.id);
    setPreviewOpen(true);
  };

  const addToDesktop = () => {
    addPet(sticker.id);
    selectSticker(pose.id);
    setPreviewOpen(false);
    toast(`「${character.name}」已经在桌面上啦`, "success");
  };

  const deleteCreation = async () => {
    if (!sticker.created) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    try {
      await deleteCreatedSticker(sticker.id);
      removeCreated(sticker.id);
      setPreviewOpen(false);
      toast(`已删除创作「${character.name}」`, "success");
    } catch (error) {
      setDeleteArmed(false);
      toast(`删除失败：${error instanceof Error ? error.message : String(error)}`, "warn");
    }
  };

  return (
    <article
      aria-labelledby={`library-sticker-${character.id}`}
      className="group/card min-w-0 rounded-[20px] border border-white/85 bg-white/55 p-1.5 shadow-[0_7px_18px_-16px_rgba(42,78,128,0.5)] transition-colors hover:bg-white/80"
    >
      <div className="relative aspect-[1.08] overflow-hidden rounded-[15px]" style={artwork}>
        <button
          type="button"
          aria-label={`预览${character.name}`}
          aria-haspopup="dialog"
          onClick={(event) => openPreview(event.currentTarget)}
          className="absolute inset-0 grid place-items-center outline-none focus-visible:ring-2 focus-visible:ring-[#7eaff6] focus-visible:ring-inset"
        >
          <StickerImage
            sticker={pose}
            className="absolute inset-0 m-auto h-[92%] w-[90%] transition-transform duration-200 group-hover/card:scale-[1.03] motion-reduce:transition-none"
          />
        </button>

        <div className={cn(
          "pointer-events-none absolute top-2 left-2 flex flex-wrap items-center gap-1",
          onDesktop > 0 ? "right-12" : "right-2"
        )}>
          {hasStates && (
            <button
              type="button"
              aria-label={`查看${character.name}的全部 ${stateCount} 个状态`}
              aria-haspopup="dialog"
              onClick={(event) => openPreview(event.currentTarget)}
              className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/92 px-2 py-1 text-[10px] leading-3 font-bold text-[#486989] shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-[#7eaff6]"
            >
              <Layers className="size-3" aria-hidden />
              {stateCount} 状态
              <ChevronRight className="size-2.5" aria-hidden />
            </button>
          )}
          {hasAnimated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/92 px-2 py-1 text-[10px] leading-3 font-bold text-[#446da0]">
              <span className="size-1.5 rounded-full bg-[#5199ed]" />
              动态
            </span>
          )}
        </div>
        {onDesktop > 0 && (
          <span
            title={`桌面上有 ${onDesktop} 张`}
            className="pointer-events-none absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#e8f7ed] px-1.5 py-1 text-[10px] leading-3 font-bold text-[#367653]"
          >
            <MonitorUp className="size-3" aria-hidden /> ×{onDesktop}
          </span>
        )}

        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-1.5 transition-opacity duration-150 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 motion-reduce:transition-none">
          {hasStates && (
            <div role="group" aria-label="快速预览状态" className="pointer-events-auto flex items-center gap-0.5 rounded-[11px] bg-white/96 p-0.5 shadow-sm">
              {quickStates.map((index) => {
                const variant = variants[index];
                return (
                  <button
                    key={variant.id}
                    type="button"
                    title={STATE_LABEL[variant.state]}
                    aria-label={`预览${STATE_LABEL[variant.state]}`}
                    aria-pressed={pose.id === variant.id}
                    onClick={() => chooseState(index)}
                    className={cn(
                      "grid size-7 place-items-center rounded-lg border focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
                      pose.id === variant.id ? "border-[#a6c9f6] bg-[#eaf4ff]" : "border-transparent hover:bg-[#eef4fc]"
                    )}
                  >
                    <StickerImage sticker={variant} className="size-6" />
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            title="放到桌面"
            aria-label={`把${character.name}放到桌面`}
            onClick={addToDesktop}
            className="pressable pointer-events-auto ml-auto grid size-8 shrink-0 place-items-center rounded-full bg-[#477fca] text-white shadow-sm hover:bg-[#3874be] focus-visible:outline-2 focus-visible:outline-[#7eaff6]"
          >
            <MonitorUp className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-w-0 px-1.5 pt-2 pb-1">
        <h3 id={`library-sticker-${character.id}`} title={character.name} className="truncate text-[13px] leading-5 font-bold text-ink">
          {character.name}
        </h3>
        <p className="truncate text-[10px] leading-4 text-ink-soft">
          {summary.filter(Boolean).join(" · ")}
        </p>
      </div>

      {previewOpen && (
        <Dialog
          open
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setDeleteArmed(false);
          }}
        >
          <DialogContent
            className={cn(
              "max-h-[min(90vh,660px)] overflow-y-auto rounded-[24px] border-white/85 bg-[#f9fbff]",
              hasStates ? "sm:max-w-[690px]" : "sm:max-w-[420px]"
            )}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              previewTrigger.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle className="font-display text-xl">{character.name}</DialogTitle>
              <DialogDescription>
                {[...summary, !sticker.created && MOOD_LABEL[character.mood], hasStates && `${stateCount} 个状态`].filter(Boolean).join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <div className={cn("grid items-start gap-3", hasStates && "sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]")}>
              <div className="relative grid aspect-[1.15] place-items-center rounded-[17px]" style={artwork}>
                <StickerImage sticker={pose} animated={!reduceMotion} className="absolute inset-0 m-auto h-[88%] w-[88%]" />
                {hasStates && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-[#486989]">
                    {STATE_LABEL[pose.state]}
                  </span>
                )}
              </div>
              {hasStates && (
                <div className="grid grid-cols-4 gap-1.5">
                  {variants.map((variant, index) => (
                    <button
                      key={variant.id}
                      type="button"
                      aria-label={STATE_LABEL[variant.state]}
                      aria-pressed={index === poseIndex}
                      onClick={() => chooseState(index)}
                      className={cn(
                        "min-w-0 rounded-xl border px-1 pb-1 text-center text-[10px] font-semibold text-ink-soft focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
                        index === poseIndex ? "border-[#8bbcff] bg-[#eaf4ff]" : "border-[#e4ecf6] bg-white hover:border-[#b8d8fa]"
                      )}
                    >
                      <StickerImage sticker={variant} className="aspect-square w-full" />
                      <span className="block truncate">{STATE_LABEL[variant.state]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-[12px] text-ink-soft">{pose.phrase}</p>
              <div className="flex shrink-0 items-center gap-2">
                {sticker.created && (
                  <button
                    type="button"
                    aria-label={deleteArmed ? "确认删除这张创作" : "删除这张创作"}
                    className={cn(
                      "pressable inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold",
                      deleteArmed
                        ? "border-[#e7a3ad] bg-[#fff1f3] text-[#c2495c]"
                        : "border-[#e2e9f3] bg-white text-[#7086a0] hover:border-[#e7a3ad] hover:text-[#c2495c]"
                    )}
                    onClick={() => void deleteCreation()}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    {deleteArmed ? "确认删除" : "删除创作"}
                  </button>
                )}
                <button
                  type="button"
                  className="pressable inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#477fca] px-3.5 py-2 text-[11px] font-bold text-white hover:bg-[#3874be]"
                  onClick={addToDesktop}
                >
                  <MonitorUp className="size-3.5" aria-hidden /> 放到桌面
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}

export function LibraryPage({ openPackPickerInitially }: { openPackPickerInitially?: boolean }) {
  const catalog = useStickerCatalog();
  const createdCount = catalog.length - CHARACTERS.length;
  const [query, setQuery] = useState("");
  const [packId, setPackId] = useState("all");
  const [subject, setSubject] = useState<SubjectFilter>("all");
  const [style, setStyle] = useState<StyleFilter>("all");
  const [mood, setMood] = useState<MoodFilter>("all");
  const [format, setFormat] = useState<FormatFilter>("all");
  const [multiStateOnly, setMultiStateOnly] = useState(false);
  const [createdOnly, setCreatedOnly] = useState(false);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const results = useRef<HTMLDivElement | null>(null);
  const activeDetails = [
    { key: "subject", label: subject === "all" ? "" : `内容 · ${SUBJECT_LABEL[subject]}`, remove: () => setSubject("all") },
    { key: "style", label: style === "all" ? "" : `画风 · ${STYLE_LABEL[style]}`, remove: () => setStyle("all") },
    { key: "mood", label: mood === "all" ? "" : `情绪 · ${MOOD_LABEL[mood]}`, remove: () => setMood("all") },
  ].filter(({ label }) => label);

  const hasFilters =
    query.trim() !== "" ||
    packId !== "all" ||
    activeDetails.length > 0 ||
    format !== "all" ||
    multiStateOnly ||
    createdOnly;

  const choosePack = (next: string) => {
    setPackId(next);
    results.current?.scrollTo({ top: 0 });
  };

  const clearFilters = () => {
    setQuery("");
    choosePack("all");
    setSubject("all");
    setStyle("all");
    setMood("all");
    setFormat("all");
    setMultiStateOnly(false);
    setCreatedOnly(false);
  };

  const list = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return catalog.filter((character) => {
      if (packId !== "all" && character.packId !== packId) return false;
      if (createdOnly && !character.defaultVariant.created) return false;
      if (character.defaultVariant.created && (subject !== "all" || style !== "all" || mood !== "all")) return false;
      if (subject !== "all" && character.subject !== subject) return false;
      if (style !== "all" && character.style !== style) return false;
      if (mood !== "all" && character.mood !== mood) return false;
      if (multiStateOnly && character.variants.length <= 1) return false;

      const hasAnimated = characterHasAnimated(character);
      if (format === "static" && hasAnimated) return false;
      if (format === "animated" && !hasAnimated) return false;

      if (tokens.length === 0) return true;

      const pack = packOf(character);
      const haystack = [
        character.name,
        character.en,
        pack?.title,
        pack?.short,
        pack?.tagline,
        SUBJECT_LABEL[character.subject],
        STYLE_LABEL[character.style],
        MOOD_LABEL[character.mood],
        ...character.tags,
        character.variants.length > 1 ? "多状态 套图" : "",
        ...character.variants.flatMap((variant) => [
          variant.name,
          variant.phrase,
          STATE_LABEL[variant.state],
          variant.kind === "animated" ? "动态" : "静态",
        ]),
      ]
        .join(" ")
        .toLowerCase();

      return tokens.every((token) => haystack.includes(token));
    });
  }, [catalog, createdOnly, format, mood, multiStateOnly, packId, query, style, subject]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-0.5 pt-2 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-[22px] leading-8 font-semibold tracking-tight text-ink">我的贴纸</h2>
          <div className="flex items-center gap-3">
            <span role="status" className="text-[11px] font-medium text-ink-soft">
              {list.length} 个角色{!hasFilters && ` · ${STICKERS.length + createdCount} 张图`}
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-[11px] font-semibold text-[#456f9f] hover:bg-[#e6f1ff]"
              >
                <RotateCcw className="size-3" aria-hidden />
                清除筛选
              </button>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2" role="group" aria-label="筛选贴纸">
          <div className="relative min-w-40 flex-[1_1_12rem]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <Input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索贴纸"
              placeholder="搜索角色、标签或状态"
              className="h-9 w-full rounded-xl border-[#dce7f5] bg-white/85 pr-8 pl-9 text-[12px] shadow-none placeholder:text-ink-faint"
            />
            {query && (
              <button
                type="button"
                aria-label="清除搜索"
                className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-soft hover:bg-[#edf4fc]"
                onClick={() => {
                  setQuery("");
                  searchInput.current?.focus();
                }}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
          <PackPicker value={packId} onChange={choosePack} openInitially={openPackPickerInitially} createdCount={createdCount} />
          <FacetSelect label="格式" value={format} onChange={(value) => setFormat(value as FormatFilter)} options={FORMAT_FILTER_OPTIONS} className="w-[96px]" />
          <button
            type="button"
            aria-pressed={multiStateOnly}
            onClick={() => setMultiStateOnly((selected) => !selected)}
            className={cn(
              "pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
              multiStateOnly
                ? "border-[#a9cdf9] bg-[#e8f2ff] text-[#365f91]"
                : "border-[#dce7f5] bg-white/80 text-ink-soft hover:bg-white"
            )}
          >
            <Layers className="size-3.5" aria-hidden />
            多状态
          </button>
          <button
            type="button"
            aria-pressed={createdOnly}
            onClick={() => setCreatedOnly((selected) => !selected)}
            className={cn(
              "pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
              createdOnly
                ? "border-[#a9cdf9] bg-[#e8f2ff] text-[#365f91]"
                : "border-[#dce7f5] bg-white/80 text-ink-soft hover:bg-white"
            )}
          >
            <Pencil className="size-3.5" aria-hidden />
            我的创作
            {createdCount > 0 && (
              <span className="rounded-md bg-white/80 px-1 text-[10px] tabular-nums text-[#4c719d]">
                {createdCount}
              </span>
            )}
          </button>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className={cn(
                  "pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold data-[state=open]:border-[#9fc4f7] focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
                  activeDetails.length ? "border-[#b6d1f6] bg-[#edf5ff] text-[#365f91]" : "border-[#dce7f5] bg-white/80 text-ink-soft hover:bg-white"
                )}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                更多筛选
                {activeDetails.length > 0 && <span className="rounded-md bg-[#dcecff] px-1 font-bold">{activeDetails.length}</span>}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                aria-label="更多筛选"
                align="end"
                sideOffset={7}
                collisionPadding={12}
                className="z-50 grid max-h-[var(--radix-popover-content-available-height)] w-[min(350px,calc(100vw-24px))] gap-3 overflow-y-auto rounded-[18px] border border-[#dae8f8] bg-[#f9fbff] p-3.5 shadow-[0_18px_45px_-23px_rgba(42,78,128,0.58)] outline-none"
              >
                <FilterOptions label="内容" options={SUBJECT_OPTIONS} value={subject} onChange={setSubject} />
                <FilterOptions label="画风" options={STYLE_OPTIONS} value={style} onChange={setStyle} />
                <FilterOptions label="情绪" options={MOOD_OPTIONS} value={mood} onChange={setMood} />
                <Popover.Close asChild>
                  <button type="button" className="justify-self-end rounded-lg bg-[#eaf3ff] px-3 py-1.5 text-[11px] font-bold text-[#416da5] hover:bg-[#dfedff]">
                    完成
                  </button>
                </Popover.Close>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        {activeDetails.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="已选筛选条件">
            {activeDetails.map(({ key, label, remove }) => (
              <button
                key={key}
                type="button"
                aria-label={`移除${label}筛选`}
                onClick={remove}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#eaf3ff] px-2 py-1 text-[10.5px] font-semibold text-[#416da5] hover:bg-[#dfedff]"
              >
                {label}<X className="size-3" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </header>

      <div ref={results} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {list.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10.75rem),1fr))] gap-3 pb-1">
            {list.map((character) => (
              <LibraryCard key={character.id} character={character} />
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/70 text-ink-faint">
                <Search className="h-5 w-5" />
              </span>
              <p className="text-[12px] font-semibold text-ink-soft">没有找到匹配的贴纸</p>
              <p className="text-[10.5px] text-ink-faint">换个关键词，或者少选几个筛选条件</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
