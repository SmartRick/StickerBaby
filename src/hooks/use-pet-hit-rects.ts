import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/lib/tauri";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
}

const MENU = "[data-radix-popper-content-wrapper], [data-pet-menu]";
const HIT_TARGET = `[data-pet-hit], [data-pet-visual], ${MENU}`;
const MOTION_SAMPLE_MS = 1000 / 30 - 1;

/** Keep transparent space click-through using a cached set of interactive elements. */
export function usePetHitRects(enabled: boolean) {
  useEffect(() => {
    if (!inTauri) return;
    const sendRects = (rects: Rect[], scale = window.devicePixelRatio || 1) =>
      invoke("set_overlay_rects", { rects, scale });
    const clear = () => void sendRects([]).catch(() => {});
    if (!enabled) {
      clear();
      return;
    }

    let frame = 0;
    let timer = 0;
    let measuredAt = -Infinity;
    let dirty = true;
    let targets: { element: HTMLElement; pad: number }[] = [];
    let lastKey = "";
    let pending: { rects: Rect[]; scale: number } | undefined;
    let sending = false;
    let disposed = false;

    const flush = async () => {
      if (sending) return;
      sending = true;
      try {
        while (pending && !disposed) {
          const { rects, scale } = pending;
          pending = undefined;
          await sendRects(rects, scale);
        }
      } catch {
        // Retry the latest geometry on the next measurement or heartbeat.
        pending = undefined;
        lastKey = "";
      } finally {
        sending = false;
      }
    };

    const measure = (now: number) => {
      frame = 0;
      measuredAt = now;
      if (dirty) {
        targets = [];
        for (const element of document.querySelectorAll<HTMLElement>(HIT_TARGET)) {
          if (element.closest('[data-pet-passthrough="true"]')) continue;
          const explicit = Number(element.dataset.petPad);
          const pad = explicit > 0 ? explicit : element.matches(MENU) ? 64 : element.hasAttribute("data-pet-visual") ? 46 : 40;
          targets.push({ element, pad });
        }
        dirty = false;
      }

      const rects: Rect[] = [];
      for (const { element, pad } of targets) {
        const { x, y, width, height } = element.getBoundingClientRect();
        if (width <= 0 || height <= 0 || element.checkVisibility?.({ visibilityProperty: true }) === false) continue;
        rects.push({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height), pad });
      }
      const scale = window.devicePixelRatio || 1;
      const key = JSON.stringify([scale, rects]);
      if (key !== lastKey) {
        lastKey = key;
        pending = { rects, scale };
        void flush();
      }
    };

    const schedule = (immediate = false) => {
      if (frame) return;
      if (immediate && timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      if (timer) return;
      const wait = MOTION_SAMPLE_MS - (performance.now() - measuredAt);
      if (immediate || wait <= 0) {
        frame = requestAnimationFrame(measure);
      } else {
        timer = window.setTimeout(() => {
          timer = 0;
          frame = requestAnimationFrame(measure);
        }, wait);
      }
    };

    const mutations = new MutationObserver((records) => {
      let moved = false;
      for (const record of records) {
        if (record.type === "childList" || record.attributeName === "data-pet-passthrough" || record.attributeName === "data-pet-pad") {
          dirty = true;
        } else if (record.target instanceof Element && record.target.matches(HIT_TARGET)) {
          moved = true;
        }
      }
      if (dirty || moved) schedule(dirty);
    });
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden", "data-state", "data-pet-passthrough", "data-pet-pad"],
    });
    const resize = () => schedule(true);
    window.addEventListener("resize", resize);
    const heartbeat = window.setInterval(() => schedule(true), 1500);
    schedule(true);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearInterval(heartbeat);
      mutations.disconnect();
      window.removeEventListener("resize", resize);
      clear();
    };
  }, [enabled]);
}
