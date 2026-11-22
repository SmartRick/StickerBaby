/**
 * 系统错误弹窗（参考：素材/复古系统故障，桌面弹窗.webp）：
 * Windows 95 风格的错误对话框成串层叠弹出；偶尔出现“拖动窗口留下残影”的经典 bug。
 * 可交互：点 OK / × 关闭，拖动标题栏移动。全部关闭后自动结束。
 */
import type { FxContext } from "../core/fx";
import { clamp, offscreen, pick, rand, randInt } from "../core/layer";
import type { PointerInfo } from "../core/runtime";
import { PrankBase } from "./base";

const FONT = `"MS Sans Serif","Microsoft Sans Serif","Microsoft YaHei UI",Tahoma,sans-serif`;
const TITLES = ["Windows 95", "Windows 95", "Error", "System", "警告", "贴纸宝宝", "Explorer"];
const MESSAGES = [
  "Not found.",
  "Not found.",
  "Task failed successfully.",
  "内存不足，无法完成此操作。",
  "无法找到桌面。",
  "C:\\WINDOWS\\SYSTEM32 已损坏",
  "Keyboard not found. Press F1 to continue.",
  "An error occurred while displaying the previous error.",
  "您的电脑需要休息一下。",
  "错误 0x0000BABY",
  "鼠标已逃跑，请联系管理员。",
  "老板正在靠近。",
  "This program has performed an illegal operation.",
];
type Icon = "pc" | "error" | "warn" | "info";

const TITLE_H = 18;
const BTN_W = 75;
const BTN_H = 23;

interface Dlg {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  msg: string;
  icon: Icon;
  gradient: boolean;
  tex: HTMLCanvasElement;
  t: number;
  /** >0：正在关闭（0..1） */
  closing: number;
  pressed: "ok" | "x" | null;
}

// ---------------- 绘制 ----------------

/** Win95 立体边框：raised=凸起，否则凹下 */
function bevel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, raised: boolean) {
  const [lt, lt2, rb, rb2] = raised ? ["#ffffff", "#dfdfdf", "#000000", "#808080"] : ["#000000", "#808080", "#ffffff", "#dfdfdf"];
  g.fillStyle = rb;
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = lt;
  g.fillRect(x, y, w - 1, 1);
  g.fillRect(x, y, 1, h - 1);
  g.fillStyle = rb2;
  g.fillRect(x + 1, y + h - 2, w - 2, 1);
  g.fillRect(x + w - 2, y + 1, 1, h - 2);
  g.fillStyle = lt2;
  g.fillRect(x + 1, y + 1, w - 3, 1);
  g.fillRect(x + 1, y + 1, 1, h - 3);
}

function drawIcon(g: CanvasRenderingContext2D, icon: Icon, x: number, y: number) {
  g.save();
  g.translate(x, y);
  if (icon === "pc") {
    // 显示器
    g.fillStyle = "#c0c0c0";
    g.fillRect(2, 0, 26, 22);
    bevel(g, 2, 0, 26, 22, true);
    g.fillStyle = "#000";
    g.fillRect(6, 3, 18, 14);
    g.fillStyle = "#008080";
    g.fillRect(7, 4, 16, 12);
    g.fillStyle = "#00c0c0";
    g.fillRect(8, 5, 6, 4);
    // 底座 + 键盘
    g.fillStyle = "#808080";
    g.fillRect(11, 22, 8, 3);
    g.fillStyle = "#c0c0c0";
    g.fillRect(0, 25, 32, 7);
    bevel(g, 0, 25, 32, 7, true);
    g.fillStyle = "#808080";
    for (let i = 0; i < 6; i++) g.fillRect(3 + i * 4.5, 28, 3, 1);
  } else if (icon === "error") {
    g.fillStyle = "#000";
    g.beginPath();
    g.arc(16, 16, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ff0000";
    g.beginPath();
    g.arc(15, 15, 14, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(9, 9);
    g.lineTo(21, 21);
    g.moveTo(21, 9);
    g.lineTo(9, 21);
    g.stroke();
  } else if (icon === "warn") {
    g.fillStyle = "#000";
    g.beginPath();
    g.moveTo(16, 1);
    g.lineTo(31, 30);
    g.lineTo(1, 30);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffff00";
    g.beginPath();
    g.moveTo(16, 4);
    g.lineTo(28.5, 28);
    g.lineTo(3.5, 28);
    g.closePath();
    g.fill();
    g.fillStyle = "#000";
    g.fillRect(14.5, 11, 3, 10);
    g.fillRect(14.5, 23, 3, 3);
  } else {
    g.fillStyle = "#000";
    g.beginPath();
    g.arc(16, 16, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(15, 15, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0000ff";
    g.fillRect(13, 12, 4, 12);
    g.fillRect(13, 6, 4, 4);
  }
  g.restore();
}

function measure(text: string, font: string) {
  const { ctx } = offscreen(1, 1, 1);
  ctx.font = font;
  return ctx.measureText(text).width;
}

function renderDialog(d: Omit<Dlg, "tex">, active: boolean): HTMLCanvasElement {
  const { canvas, ctx: g } = offscreen(d.w, d.h);
  const { w, h } = d;
  // 窗体
  g.fillStyle = "#c0c0c0";
  g.fillRect(0, 0, w, h);
  bevel(g, 0, 0, w, h, true);
  // 标题栏
  if (d.gradient) {
    const grd = g.createLinearGradient(3, 0, w - 3, 0);
    grd.addColorStop(0, active ? "#000080" : "#808080");
    grd.addColorStop(1, active ? "#1084d0" : "#b5b5b5");
    g.fillStyle = grd;
  } else {
    g.fillStyle = active ? "#0000a8" : "#808080";
  }
  g.fillRect(3, 3, w - 6, TITLE_H);
  g.fillStyle = "#fff";
  g.font = `bold 12px ${FONT}`;
  g.textBaseline = "middle";
  g.fillText(d.title, 7, 3 + TITLE_H / 2 + 1);
  // × 按钮
  const bx = w - 3 - 2 - 16;
  const by = 5;
  g.fillStyle = "#c0c0c0";
  g.fillRect(bx, by, 16, 14);
  bevel(g, bx, by, 16, 14, d.pressed !== "x");
  const px = d.pressed === "x" ? 1 : 0;
  g.strokeStyle = "#000";
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(bx + 4 + px, by + 3 + px);
  g.lineTo(bx + 11 + px, by + 10 + px);
  g.moveTo(bx + 11 + px, by + 3 + px);
  g.lineTo(bx + 4 + px, by + 10 + px);
  g.stroke();
  // 图标 + 文字
  drawIcon(g, d.icon, 16, TITLE_H + 18);
  g.fillStyle = "#000";
  g.font = `13px ${FONT}`;
  g.textBaseline = "middle";
  const textX = 62;
  const textW = w - textX - 14;
  const mw = g.measureText(d.msg).width;
  g.fillText(d.msg, textX + Math.max(0, (textW - mw) / 2), TITLE_H + 34);
  // OK 按钮
  const okx = Math.round((w - BTN_W) / 2);
  const oky = h - BTN_H - 12;
  g.fillStyle = "#c0c0c0";
  g.fillRect(okx, oky, BTN_W, BTN_H);
  if (active) {
    // 默认按钮外的黑框
    g.strokeStyle = "#000";
    g.lineWidth = 1;
    g.strokeRect(okx - 0.5, oky - 0.5, BTN_W + 1, BTN_H + 1);
  }
  bevel(g, okx, oky, BTN_W, BTN_H, d.pressed !== "ok");
  const o = d.pressed === "ok" ? 1 : 0;
  g.fillStyle = "#000";
  g.font = `13px ${FONT}`;
  g.textAlign = "center";
  g.fillText("OK", okx + BTN_W / 2 + o, oky + BTN_H / 2 + 1 + o);
  if (active) {
    // 焦点虚线框
    g.strokeStyle = "#000";
    g.setLineDash([1, 1]);
    g.strokeRect(okx + 4.5 + o, oky + 4.5 + o, BTN_W - 9, BTN_H - 9);
    g.setLineDash([]);
  }
  g.textAlign = "start";
  return canvas;
}

// ---------------- 实体 ----------------

class ErrorPopups extends PrankBase {
  z = 5;
  private dlgs: Dlg[] = [];
  private total: number;
  private spawned = 0;
  private nextSpawn = 0.05;
  private cascade = { x: 0, y: 0 };
  private target: Dlg | null = null;
  private drag: { dx: number; dy: number } | null = null;
  // 残影 bug：一个窗口沿曲线移动并在身后留下印章
  private trail: { d: Dlg; t: number; dur: number; x0: number; y0: number; x1: number; y1: number; ax: number; ay: number } | null = null;
  private trailTex: HTMLCanvasElement | null = null;
  private trailCtx: CanvasRenderingContext2D | null = null;
  private trailPending: boolean;

  constructor(ctx: FxContext) {
    super(ctx);
    const k = ctx.options.intensity ?? 0.6;
    this.total = ctx.options.count ?? randInt(14, 18 + Math.round(k * 7));
    this.trailPending = Math.random() < 0.35;
    this.newCascade(ctx.options.x, ctx.options.y);
  }

  private newCascade(x?: number, y?: number) {
    this.cascade.x = x ?? rand(40, Math.max(60, this.W * 0.45));
    this.cascade.y = y ?? rand(30, Math.max(40, this.H * 0.3));
  }

  private makeDialog(x: number, y: number): Dlg {
    const msg = pick(MESSAGES);
    const title = pick(TITLES);
    const w = Math.round(clamp(measure(msg, `13px ${FONT}`) + 62 + 40, 280, 520));
    const h = 124;
    const base = {
      x,
      y,
      w,
      h,
      title,
      msg,
      icon: (msg === "Not found." ? "pc" : pick(["pc", "error", "error", "warn", "info"])) as Icon,
      gradient: Math.random() < 0.3,
      t: 0,
      closing: 0,
      pressed: null,
    };
    return { ...base, tex: renderDialog(base, true) };
  }

  private refresh(d: Dlg, active: boolean) {
    d.tex = renderDialog(d, active);
  }

  private spawn() {
    if (this.cascade.x + 300 > this.W || this.cascade.y + 140 > this.H) this.newCascade();
    const d = this.makeDialog(Math.round(this.cascade.x), Math.round(this.cascade.y));
    this.cascade.x += 22;
    this.cascade.y += 22;
    const prev = this.dlgs[this.dlgs.length - 1];
    if (prev) this.refresh(prev, false);
    this.dlgs.push(d);
    this.spawned++;
    this.ctx.rt.hit.reevaluate();
  }

  private startTrail() {
    this.trailPending = false;
    const W = this.W;
    const H = this.H;
    const d = this.makeDialog(0, 0);
    const { canvas, ctx } = offscreen(W, H);
    this.trailTex = canvas;
    this.trailCtx = ctx;
    this.trail = {
      d,
      t: 0,
      dur: rand(2.2, 3.2),
      x0: rand(0, W * 0.2),
      y0: rand(H * 0.1, H * 0.6),
      x1: rand(W * 0.55, W - d.w),
      y1: rand(H * 0.1, H - d.h - 20),
      ax: rand(60, 160),
      ay: rand(40, 120),
    };
  }

  protected step(dt: number) {
    if (this.spawned < this.total) {
      this.nextSpawn -= dt;
      while (this.nextSpawn <= 0 && this.spawned < this.total) {
        this.spawn();
        this.nextSpawn += rand(0.12, 0.28);
      }
    } else if (this.trailPending) {
      this.startTrail();
    }
    for (const d of this.dlgs) {
      d.t += dt;
      if (d.closing > 0) d.closing += dt / 0.12;
    }
    const before = this.dlgs.length;
    this.dlgs = this.dlgs.filter((d) => d.closing < 1);
    if (this.dlgs.length !== before) {
      const top = this.dlgs[this.dlgs.length - 1];
      if (top) this.refresh(top, true);
      this.ctx.rt.hit.reevaluate();
    }
    const tr = this.trail;
    if (tr && this.trailCtx) {
      tr.t += dt;
      const p = clamp(tr.t / tr.dur, 0, 1);
      const x = tr.x0 + (tr.x1 - tr.x0) * p + Math.sin(p * Math.PI * 3) * tr.ax;
      const y = tr.y0 + (tr.y1 - tr.y0) * p + Math.sin(p * Math.PI * 2) * tr.ay;
      tr.d.x = x;
      tr.d.y = y;
      // 在身后留下“没被擦除”的印章
      this.trailCtx.drawImage(tr.d.tex, x, y, tr.d.w, tr.d.h);
      if (p >= 1) {
        // 最终停下的窗口变成可关闭的普通弹窗
        const prev = this.dlgs[this.dlgs.length - 1];
        if (prev) this.refresh(prev, false);
        this.dlgs.push(tr.d);
        this.trail = null;
        this.ctx.rt.hit.reevaluate();
      }
    }
    // 用户关完所有窗口后：残影淡出并结束
    if (this.spawned >= this.total && !this.trailPending && !this.trail && this.dlgs.length === 0) this.stop();
    return true;
  }

  protected animating() {
    return (
      this.spawned < this.total ||
      this.trailPending ||
      this.trail !== null ||
      this.drag !== null ||
      this.dlgs.some((d) => d.closing > 0 || d.t < 0.12)
    );
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const base = ctx.globalAlpha;
    if (this.trailTex) ctx.drawImage(this.trailTex, 0, 0, this.W, this.H);
    for (const d of this.dlgs) {
      ctx.save();
      // 弹出：瞬间出现（Win95 没有动画），仅关闭时有一点缩小淡出
      if (d.closing > 0) {
        const k = 1 - d.closing;
        ctx.globalAlpha = base * k;
        ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
        ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k);
        ctx.translate(-d.x - d.w / 2, -d.y - d.h / 2);
      }
      // 硬阴影
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(d.x + 3, d.y + 3, d.w, d.h);
      ctx.drawImage(d.tex, d.x, d.y, d.w, d.h);
      ctx.restore();
    }
    if (this.trail) ctx.drawImage(this.trail.d.tex, this.trail.d.x, this.trail.d.y, this.trail.d.w, this.trail.d.h);
  }

  // ---------------- 交互 ----------------

  private at(x: number, y: number) {
    for (let i = this.dlgs.length - 1; i >= 0; i--) {
      const d = this.dlgs[i];
      if (d.closing === 0 && x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
    }
    return null;
  }

  private region(d: Dlg, x: number, y: number): "ok" | "x" | "title" | "body" {
    const lx = x - d.x;
    const ly = y - d.y;
    const bx = d.w - 3 - 2 - 16;
    if (lx >= bx && lx < bx + 16 && ly >= 5 && ly < 19) return "x";
    const okx = (d.w - BTN_W) / 2;
    const oky = d.h - BTN_H - 12;
    if (lx >= okx && lx < okx + BTN_W && ly >= oky && ly < oky + BTN_H) return "ok";
    if (ly >= 3 && ly < 3 + TITLE_H) return "title";
    return "body";
  }

  hitTest(x: number, y: number) {
    if (this.stopping) return false;
    return this.at(x, y) !== null;
  }

  pointerDown(p: PointerInfo) {
    const d = this.at(p.x, p.y);
    if (!d) return;
    // 点到的窗口置顶并激活
    const top = this.dlgs[this.dlgs.length - 1];
    if (top !== d) {
      this.dlgs.splice(this.dlgs.indexOf(d), 1);
      this.dlgs.push(d);
      if (top) this.refresh(top, false);
    }
    this.target = d;
    const r = this.region(d, p.x, p.y);
    d.pressed = r === "ok" || r === "x" ? r : null;
    if (r === "title" || r === "body") this.drag = { dx: p.x - d.x, dy: p.y - d.y };
    this.refresh(d, true);
    this.ctx.layer.invalidate();
  }

  pointerMove(p: PointerInfo) {
    const d = this.target;
    if (!d) return;
    if (this.drag) {
      d.x = Math.round(p.x - this.drag.dx);
      d.y = Math.round(p.y - this.drag.dy);
      this.ctx.layer.invalidate();
    } else if (d.pressed) {
      // 按住按钮移出去：按钮弹起（松开不触发），移回来再按下
      const inside = this.region(d, p.x, p.y);
      const want = inside === d.pressed ? d.pressed : null;
      if ((want === null) !== (d.pressed === null) || this.pressedRegion !== inside) {
        this.pressedRegion = inside;
        const keep = d.pressed;
        d.pressed = want;
        this.refresh(d, true);
        d.pressed = keep;
        this.ctx.layer.invalidate();
      }
    }
  }

  private pressedRegion: string | null = null;

  pointerUp(p: PointerInfo) {
    const d = this.target;
    this.target = null;
    this.drag = null;
    this.pressedRegion = null;
    if (!d) return;
    const pressed = d.pressed;
    d.pressed = null;
    if (pressed && this.region(d, p.x, p.y) === pressed) {
      d.closing = 0.0001;
    } else {
      this.refresh(d, true);
    }
    this.ctx.layer.invalidate();
  }
}

export const createErrorPopups = (ctx: FxContext) => new ErrorPopups(ctx);
