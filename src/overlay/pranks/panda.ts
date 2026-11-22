/**
 * 熊猫烧香：致敬 2006 年的同名病毒。
 *
 * 1. 触发时如果用户不在桌面（前台是其他程序），屏幕中央先出现一只大熊猫举香“拜三拜”
 *    （panda 图集 9 帧本身就是一套鞠躬序列：0 端坐 -> 4 拜到底 -> 8 起身）
 * 2. 随后隐藏系统真实桌面图标（Rust: desktop_icons），换成一组预设的“被感染”图标：
 *    从屏幕一角像波一样扩散感染，香头冒烟
 * 3. 预设图标只在用户看着桌面时显示（轮询前台窗口），表现得像真正的桌面图标
 * 4. 点击图标 = 杀毒清除；全部清除 / 停止 / 一键清场 / 退出程序时恢复真实桌面图标
 */
import { invoke } from "@tauri-apps/api/core";
import type { FxContext } from "../core/fx";
import { atlas } from "../core/assets";
import { clamp, easeOutCubic, offscreen, rand, randInt } from "../core/layer";
import type { PointerInfo } from "../core/runtime";
import { PrankBase } from "./base";

const CELL_W = 84;
const CELL_H = 96;
const ICON = 54;
const LABELS = [
  "熊猫烧香.exe", "我的电脑", "QQ.exe", "回收站", "Photoshop.exe", "暴风影音.exe", "毕业论文.doc",
  "千千静听.exe", "IE浏览器", "Winamp.exe", "传奇.exe", "网吧计费.exe", "照片.jpg", "setup.exe",
  "迅雷.exe", "CS1.6.exe", "Foxmail.exe", "WPS.exe", "备份.rar", "说明.txt",
];

/** 鞠躬序列：低头 -> 拜到底停一下 -> 起身 */
const BOW = [0, 1, 2, 3, 4, 4, 4, 5, 6, 7, 8, 0];
const BOW_TIME = 1.15;
const BOWS = 3;
const INTRO = BOW_TIME * BOWS + 0.6;

interface Icon {
  x: number;
  y: number;
  frame: number;
  label: HTMLCanvasElement;
  /** 感染时刻（秒，相对感染开始） */
  at: number;
  /** 清除动画进度 0..1，-1 = 未清除 */
  kill: number;
  phase: number;
}

interface Smoke {
  x: number;
  y: number;
  vx: number;
  age: number;
  life: number;
  r: number;
}

function labelCanvas(text: string) {
  const w = CELL_W;
  const { canvas, ctx } = offscreen(w, 30);
  ctx.font = '12px "Microsoft YaHei UI", "SimSun", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  // 桌面图标文字：白字 + 黑色描边阴影，保证在任意壁纸上可读
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineJoin = "round";
  const lines = text.length > 9 ? [text.slice(0, 9), text.slice(9, 18)] : [text];
  lines.forEach((l, i) => {
    ctx.strokeText(l, w / 2, 2 + i * 14);
    ctx.fillStyle = "#fff";
    ctx.fillText(l, w / 2, 2 + i * 14);
  });
  return canvas;
}

class PandaVirus extends PrankBase {
  private icons: Icon[] = [];
  private smoke: Smoke[] = [];
  private target: Icon | null = null;
  /** 大熊猫拜三拜：null = 不播放（触发时就在桌面上）；数字 = 已播放时长 */
  private intro: number | null = null;
  /** 感染开始的时刻（age），-1 = 尚未开始 */
  private infectAt = -1;
  private onDesktop = true;
  /** 预设图标整体可见度（跟随是否在桌面渐变） */
  private gridAlpha = 1;
  private poll = 0;
  private disposed = false;

  constructor(ctx: FxContext) {
    super(ctx);
    const rows = Math.max(1, Math.floor((this.H - 40) / CELL_H));
    const intensity = ctx.options.intensity ?? 0.6;
    const count = ctx.options.count ?? Math.round(18 + intensity * 50);
    const cols = Math.ceil(count / rows);
    // 起点：左上角或右上角；感染时间 = 到起点的网格距离（带抖动）形成扩散波
    const fromRight = Math.random() < 0.3;
    const names = LABELS.slice(1).sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const c = Math.floor(i / rows);
      const r = i % rows;
      const col = fromRight ? cols - 1 - c : c;
      const x = fromRight ? this.W - 16 - CELL_W / 2 - c * CELL_W : 16 + CELL_W / 2 + col * CELL_W;
      if (x < CELL_W / 2 || x > this.W - CELL_W / 2) continue;
      this.icons.push({
        x,
        y: 16 + r * CELL_H + ICON / 2,
        frame: randInt(0, 8),
        label: labelCanvas(i === 0 ? LABELS[0] : names[(i - 1) % names.length]),
        at: 0.15 + Math.hypot(c, r * 0.8) * 0.12 + rand(0, 0.08),
        kill: -1,
        phase: rand(0, Math.PI * 2),
      });
    }
    // 判断触发时用户是否在桌面：不在桌面先拜三拜，在桌面直接开始感染
    invoke<boolean>("desktop_foreground")
      .then((desk) => {
        this.onDesktop = desk;
        this.gridAlpha = desk ? 1 : 0;
        if (desk) this.startInfection();
        else this.intro = 0;
        this.ctx.layer.invalidate();
      })
      .catch(() => this.startInfection());
    this.poll = window.setInterval(() => {
      invoke<boolean>("desktop_foreground")
        .then((d) => (this.onDesktop = d))
        .catch(() => {});
    }, 400);
  }

  private startInfection() {
    if (this.infectAt >= 0) return;
    this.infectAt = this.age;
    // 隐藏真实桌面图标，由预设的“感染图标”顶替
    invoke<boolean>("desktop_icons", { visible: false })
      .then(() => {
        // 极端情况：隐藏请求返回前恶作剧已结束，立即恢复
        if (this.disposed) invoke("desktop_icons", { visible: true }).catch(() => {});
      })
      .catch(() => {});
  }

  protected step(dt: number) {
    if (this.intro !== null) {
      this.intro += dt;
      if (this.intro >= INTRO) {
        this.intro = null;
        this.startInfection();
      }
      // 拜的过程中也冒烟（大熊猫手里的香）
      if (Math.random() < dt * 12) {
        const s = this.bigSize();
        this.smoke.push({
          x: this.W / 2 + s * 0.06 + rand(-6, 6),
          y: this.H / 2 - s * 0.02,
          vx: rand(-10, 10),
          age: 0,
          life: rand(1.5, 2.5),
          r: rand(5, 9),
        });
      }
    }
    // 预设图标只在桌面可见时显示
    const target = this.onDesktop ? 1 : 0;
    this.gridAlpha += (target - this.gridAlpha) * Math.min(1, dt * 6);

    const t = this.infectAt >= 0 ? this.age - this.infectAt : -1;
    for (const ic of this.icons) {
      if (ic.kill >= 0) ic.kill = Math.min(1, ic.kill + dt / 0.45);
      if (ic.kill < 0 && t > ic.at && this.gridAlpha > 0.5 && Math.random() < dt * 3) {
        this.smoke.push({ x: ic.x + 15, y: ic.y - ICON / 2 + 2, vx: rand(-6, 6), age: 0, life: rand(1.2, 2), r: rand(2, 4) });
      }
    }
    for (const s of this.smoke) {
      s.age += dt;
      s.y -= 16 * dt * (s.r > 4 ? 2 : 1);
      s.x += (s.vx + Math.sin(s.age * 3) * 6) * dt;
    }
    this.smoke = this.smoke.filter((s) => s.age < s.life);
    if (this.infectAt >= 0 && this.icons.length && this.icons.every((i) => i.kill >= 1)) return false;
    return true;
  }

  private bigSize() {
    return Math.min(this.H * 0.55, this.W * 0.4);
  }

  private renderIntro(ctx: CanvasRenderingContext2D, a: NonNullable<ReturnType<typeof atlas>>) {
    const t = this.intro!;
    const base = ctx.globalAlpha;
    const fade = Math.min(clamp(t / 0.35, 0, 1), clamp((INTRO - t) / 0.5, 0, 1));
    const size = this.bigSize() * (0.85 + 0.15 * easeOutCubic(clamp(t / 0.5, 0, 1)));
    const k = clamp(t / (BOW_TIME * BOWS), 0, 0.9999);
    const frame = BOW[Math.floor(((k * BOWS) % 1) * BOW.length)];
    ctx.globalAlpha = base * fade;
    // 像素风放大：关闭平滑保持清晰的像素边
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    a.draw(ctx, frame, this.W / 2, this.H / 2, size, size);
    ctx.imageSmoothingEnabled = smooth;
    ctx.globalAlpha = base;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const a = atlas("panda");
    if (!a) return;
    const base = ctx.globalAlpha;
    if (this.intro !== null) this.renderIntro(ctx, a);

    if (this.infectAt >= 0 && this.gridAlpha > 0.01) {
      const t = this.age - this.infectAt;
      const ga = base * this.gridAlpha;
      for (const ic of this.icons) {
        const p = clamp((t - ic.at) / 0.35, 0, 1);
        if (p <= 0 || ic.kill >= 1) continue;
        // 感染瞬间：白闪 + 弹出
        const pop = p < 1 ? 0.4 + 0.6 * easeOutCubic(p) + Math.sin(p * Math.PI) * 0.25 : 1 + Math.sin(this.age * 2 + ic.phase) * 0.02;
        const k = ic.kill >= 0 ? 1 - easeOutCubic(ic.kill) : 1;
        ctx.save();
        ctx.globalAlpha = ga * k;
        ctx.translate(ic.x, ic.y);
        if (ic.kill >= 0) ctx.rotate(ic.kill * Math.PI * 2);
        ctx.scale(pop * k, pop * k);
        a.draw(ctx, ic.frame, 0, 0, ICON, ICON);
        if (p < 0.5) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = ga * (0.5 - p) * 1.6;
          a.draw(ctx, ic.frame, 0, 0, ICON, ICON);
        }
        ctx.restore();
        if (k > 0.5) {
          ctx.globalAlpha = ga * k;
          ctx.drawImage(ic.label, ic.x - CELL_W / 2, ic.y + ICON / 2 + 2, CELL_W, 30);
        }
      }
    }
    for (const s of this.smoke) {
      const f = s.age / s.life;
      ctx.globalAlpha = base * 0.35 * (1 - f);
      ctx.fillStyle = "#ddd";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (1 + f * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = base;
  }

  hitTest(x: number, y: number) {
    if (this.infectAt < 0 || this.gridAlpha < 0.5) return false;
    const t = this.age - this.infectAt;
    this.target =
      this.icons.find((i) => i.kill < 0 && t > i.at && Math.abs(x - i.x) < ICON / 2 + 4 && Math.abs(y - i.y) < ICON / 2 + 4) ?? null;
    return !!this.target;
  }

  pointerDown(p: PointerInfo) {
    const ic = this.target;
    if (!ic) return;
    ic.kill = 0;
    this.ctx.particles.emit(p.x, p.y, {
      kind: ["sparkle", "star"],
      count: 10,
      angle: [0, Math.PI * 2],
      speed: [80, 220],
      gravity: 0,
      life: [0.4, 0.8],
      size: [12, 22],
    });
    this.ctx.layer.invalidate();
  }

  dispose() {
    this.disposed = true;
    window.clearInterval(this.poll);
    // 恢复真实桌面图标（即使尚未确认隐藏成功也调用一次，保证不残留）
    invoke("desktop_icons", { visible: true }).catch(() => {});
  }
}

export const createPandaVirus = (ctx: FxContext) => new PandaVirus(ctx);
