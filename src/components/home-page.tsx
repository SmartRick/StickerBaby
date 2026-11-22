import { HeroBanner } from "@/components/hero-banner";
import { PreviewPanel } from "@/components/preview-panel";
import { HomeQuickPanel } from "@/components/home-quick-panel";
import type { PageKey } from "@/lib/pages";
import { useAppStore } from "@/lib/store";
import { CHARACTERS } from "@/lib/characters";
import { toast } from "@/lib/toast";

interface HomePageProps {
  onNavigate: (page: PageKey) => void;
}
function pickRandom(exclude?: string) {
  const pool = CHARACTERS.map((character) => character.defaultVariant).filter(
    (sticker) => sticker.id !== exclude
  );
  return pool[Math.floor(Math.random() * pool.length)];
}

export function HomePage({ onNavigate }: HomePageProps) {
  const previewId = useAppStore((state) => state.previewId);
  const selectSticker = useAppStore((state) => state.selectSticker);
  const addPet = useAppStore((state) => state.addPet);

  const shuffle = () => {
    const next = pickRandom(previewId);
    if (!next) return;
    selectSticker(next.id);
  };

  const adopt = () => {
    const next = pickRandom(previewId);
    if (!next) return;
    selectSticker(next.id);
    addPet(next.id);
    toast(`「${next.name}」已经贴到桌面上啦`, "success");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <HeroBanner onAdopt={adopt} onCreate={() => onNavigate("create")} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.45fr)_minmax(340px,1fr)] gap-4">
        <PreviewPanel onShuffle={shuffle} onCreateSticker={() => onNavigate("create")} />
        <HomeQuickPanel onNavigate={onNavigate} />
      </div>
    </div>
  );
}
