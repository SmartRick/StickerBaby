import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { WindowBar } from "@/components/window-bar";
import { HomePage } from "@/components/home-page";
import { LibraryPage } from "@/components/library-page";
import { SettingsPage } from "@/components/settings-page";
import { ToastHost } from "@/components/toast-host";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useOverlayEffects } from "@/hooks/use-overlay-effects";
import { invokeSafe, onAppEvent } from "@/lib/tauri";
import type { PageKey } from "@/lib/pages";
import { cn } from "@/lib/utils";

const CreateStickerPage = lazy(() => import("@/components/create-sticker-page").then(
  ({ CreateStickerPage }) => ({ default: CreateStickerPage })
));
const InteractionsPage = lazy(() => import("@/components/interactions-page").then(
  ({ InteractionsPage }) => ({ default: InteractionsPage })
));

function AmbientBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -right-16 top-[8%] h-64 w-64 rounded-full bg-[#dbeaff]/60 blur-3xl" />
      <div className="absolute right-[28%] top-[42%] h-40 w-40 rounded-full bg-[#fff1d6]/70 blur-3xl" />
      <div className="absolute -left-10 bottom-[12%] h-56 w-56 rounded-full bg-[#e7f1ff]/70 blur-3xl" />
      <div className="absolute right-[8%] bottom-[6%] h-44 w-44 rounded-full bg-[#f0e9ff]/50 blur-3xl" />
      <span className="absolute right-[18%] top-[16%] h-1.5 w-1.5 rounded-full bg-white/80" />
      <span className="absolute right-[12%] top-[30%] h-1 w-1 rounded-full bg-white/70" />
      <span className="absolute left-[42%] bottom-[9%] h-1.5 w-1.5 rounded-full bg-white/60" />
    </div>
  );
}

export function MainWindow() {
  const [page, setPage] = useState<PageKey>(() => {
    const hash = window.location.hash;
    if (hash === "#library" || hash === "#packs") return "library";
    if (hash === "#create") return "create";
    if (hash === "#interactions") return "interactions";
    return hash === "#settings" ? "settings" : "home";
  });
  const [openPackPickerInitially, setOpenPackPickerInitially] = useState(() => window.location.hash === "#packs");
  useOverlayEffects({ events: true });

  const navigate = useCallback((next: PageKey) => {
    setOpenPackPickerInitially(false);
    setPage(next);
    window.history.replaceState(null, "", `#${next}`);
  }, []);

  useEffect(() => onAppEvent<PageKey>("tray:navigate", (next) => {
    if (next === "library" || next === "settings") navigate(next);
  }), [navigate]);

  useEffect(() => {
    if (window.location.hash === "#packs") window.history.replaceState(null, "", "#library");
    document.title = "贴纸宝宝";
    const timer = window.setTimeout(() => void invokeSafe("main_ready"), 140);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <TooltipProvider delayDuration={220}>
      <div className="h-full w-full select-none p-4">
        <div className="app-canvas relative flex h-full w-full overflow-hidden rounded-[28px] border border-b-0 border-white/80 shadow-panel">
          <AmbientBackdrop />
          <Sidebar page={page} onNavigate={navigate} />

          <div className="relative flex min-w-0 flex-1 flex-col">
            <WindowBar />
            <main className={cn("relative min-h-0 flex-1 px-5", page === "home" ? "pb-3 pt-0" : "pb-0 pt-1")}>
              <div key={page} className="h-full animate-[rise_0.45s_cubic-bezier(0.22,1,0.36,1)_both]">
                {page === "home" && <HomePage onOpenLibrary={() => navigate("library")} onCreateSticker={() => navigate("create")} />}
                {page === "library" && <LibraryPage openPackPickerInitially={openPackPickerInitially} />}
                {page === "create" && (
                  <Suspense fallback={<p role="status" className="p-3 text-sm text-ink-soft">正在打开创建页…</p>}>
                    <CreateStickerPage onOpenLibrary={() => navigate("library")} />
                  </Suspense>
                )}
                {page === "interactions" && (
                  <Suspense fallback={<p role="status" className="p-3 text-sm text-ink-soft">正在打开互动页…</p>}>
                    <InteractionsPage onOpenLibrary={() => navigate("library")} />
                  </Suspense>
                )}
                {page === "settings" && <SettingsPage />}
              </div>
            </main>
          </div>

          <ToastHost />
        </div>
      </div>
    </TooltipProvider>
  );
}
