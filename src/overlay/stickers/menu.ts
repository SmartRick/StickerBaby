/**
 * 悬浮层右键菜单（纯 DOM）。菜单自身注册为可交互区域：打开时拦截点击，
 * 在菜单以外任意位置按下鼠标（哪怕在其他应用里）即关闭。支持一级子菜单。
 */
import type { Interactive, Runtime } from "../core/runtime";

const ICONS: Record<string, string> = {
  pin: '<path d="M5 3h14"/><path d="m18 13-6-6-6 6"/><path d="M12 7v14"/>',
  flip: '<path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
  lock: '<circle cx="12" cy="16" r="1"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  blend: '<circle cx="9" cy="9" r="7"/><circle cx="15" cy="15" r="7"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  pose: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-7.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  window: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor"/>',
};

export function icon(name: string, size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ""}</svg>`;
}

export interface MenuItem {
  label: string;
  icon?: string;
  /** 图片图标（如手势贴图） */
  image?: string;
  /** 勾选项：显示 ✓ */
  checked?: boolean;
  /** 单选项：显示 ● */
  radio?: boolean;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** 选中后不关闭菜单 */
  keepOpen?: boolean;
  onSelect?: () => void;
  submenu?: MenuEntry[];
}
export type MenuEntry = MenuItem | "separator" | { caption: string };

export interface MenuHeader {
  image: string;
  title: string;
  subtitle: string;
}

export class ContextMenu implements Interactive {
  private el: HTMLDivElement;
  private sub: HTMLDivElement | null = null;
  private subOwner: HTMLElement | null = null;
  private open_ = false;
  private onClose: (() => void) | null = null;

  constructor(
    private rt: Runtime,
    private root: HTMLElement,
  ) {
    this.el = this.panel();
    rt.hit.register(1000, this);
    rt.onCursor((c) => {
      if (c.down && this.open_ && !this.hitTest(c.x, c.y)) this.close();
    });
  }

  get isOpen() {
    return this.open_;
  }

  private panel() {
    const el = document.createElement("div");
    el.className = "sb-menu";
    el.hidden = true;
    this.root.appendChild(el);
    return el;
  }

  open(x: number, y: number, header: MenuHeader | null, entries: MenuEntry[], onClose?: () => void) {
    this.closeSub();
    this.onClose?.();
    this.onClose = onClose ?? null;
    this.el.replaceChildren();
    if (header) {
      const h = document.createElement("div");
      h.className = "sb-menu-header";
      h.innerHTML = `<span class="sb-menu-thumb"><img draggable="false"></span><span class="sb-menu-titles"><b></b><small></small></span>`;
      const thumb = h.querySelector("img")!;
      if (header.image) thumb.src = header.image;
      else thumb.remove();
      h.querySelector("b")!.textContent = header.title;
      h.querySelector("small")!.textContent = header.subtitle;
      this.el.append(h, this.separator());
    }
    this.fill(this.el, entries, true);
    this.el.hidden = false;
    this.open_ = true;
    this.position(this.el, x, y);
    this.rt.hit.reevaluate();
  }

  close() {
    if (!this.open_) return;
    this.closeSub();
    this.el.hidden = true;
    this.open_ = false;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
    this.rt.hit.reevaluate();
  }

  private separator() {
    const s = document.createElement("div");
    s.className = "sb-menu-sep";
    return s;
  }

  private fill(panel: HTMLElement, entries: MenuEntry[], top: boolean) {
    for (const entry of entries) {
      if (entry === "separator") {
        panel.appendChild(this.separator());
        continue;
      }
      if ("caption" in entry) {
        const c = document.createElement("div");
        c.className = "sb-menu-caption";
        c.textContent = entry.caption;
        panel.appendChild(c);
        continue;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sb-menu-item";
      if (entry.danger) b.classList.add("danger");
      b.disabled = !!entry.disabled;
      const lead = entry.checked !== undefined || entry.radio !== undefined
        ? `<span class="sb-menu-mark">${(entry.checked ?? entry.radio) ? icon(entry.radio !== undefined ? "dot" : "check", 12) : ""}</span>`
        : "";
      const glyph = entry.image
        ? `<img class="sb-menu-img" draggable="false" src="${entry.image}">`
        : entry.icon
          ? `<span class="sb-menu-icon">${icon(entry.icon)}</span>`
          : "";
      b.innerHTML = `${lead}${glyph}<span class="sb-menu-label"></span>${
        entry.hint ? `<span class="sb-menu-hint"></span>` : ""
      }${entry.submenu ? `<span class="sb-menu-chevron">${icon("chevron", 12)}</span>` : ""}`;
      b.querySelector(".sb-menu-label")!.textContent = entry.label;
      if (entry.hint) b.querySelector(".sb-menu-hint")!.textContent = entry.hint;
      if (entry.submenu) {
        const sub = entry.submenu;
        b.onmouseenter = () => this.openSub(b, sub);
        b.onclick = () => this.openSub(b, sub);
      } else {
        if (top) b.onmouseenter = () => this.closeSub();
        b.onclick = () => {
          entry.onSelect?.();
          if (!entry.keepOpen) this.close();
        };
      }
      panel.appendChild(b);
    }
  }

  private openSub(owner: HTMLElement, entries: MenuEntry[]) {
    if (this.subOwner === owner) return;
    this.closeSub();
    const sub = this.panel();
    sub.classList.add("sb-submenu");
    this.fill(sub, entries, false);
    sub.hidden = false;
    this.sub = sub;
    this.subOwner = owner;
    owner.classList.add("open");
    const r = owner.getBoundingClientRect();
    const m = this.el.getBoundingClientRect();
    const sr = sub.getBoundingClientRect();
    const right = m.right + 4 + sr.width <= this.rt.width - 8;
    this.position(sub, right ? m.right + 4 : m.left - 4 - sr.width, r.top - 6);
    this.rt.hit.reevaluate();
  }

  private closeSub() {
    this.subOwner?.classList.remove("open");
    this.sub?.remove();
    this.sub = this.subOwner = null;
  }

  private position(el: HTMLElement, x: number, y: number) {
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(x, this.rt.width - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, this.rt.height - r.height - 8))}px`;
  }

  hitTest(x: number, y: number) {
    if (!this.open_) return false;
    const inside = (el: HTMLElement | null) => {
      if (!el || el.hidden) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    return inside(this.el) || inside(this.sub);
  }
}
