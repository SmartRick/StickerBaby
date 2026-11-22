/**
 * 通用粒子系统（PRD 4.3.3）：可配置资源、数量、方向、速度、生命周期、重力等。
 * 触摸粒子和全屏特效共用，挂在 fx 图层上，粒子全部消亡后自动从图层移除。
 */
import type { ParticleKind } from "../../shared/protocol";
import { type CanvasLayer, type Entity, rand } from "./layer";
import { randomSprite, sprite } from "./sprites";

type Range = number | [number, number];
const val = (r: Range) => (Array.isArray(r) ? rand(r[0], r[1]) : r);

export interface EmitOptions {
  kind: ParticleKind | ParticleKind[];
  color?: string;
  count?: number;
  /** 发射方向（弧度），默认向上 */
  angle?: Range;
  /** 速度 px/s */
  speed?: Range;
  /** 生命周期 s */
  life?: Range;
  /** 尺寸 px */
  size?: Range;
  /** 结束尺寸倍率 */
  sizeEnd?: number;
  /** 重力 px/s² */
  gravity?: number;
  /** 速度阻尼（每秒保留比例） */
  drag?: number;
  /** 自转速度 rad/s */
  spin?: Range;
  /** 横向摆动幅度（飘落效果） */
  sway?: number;
  /** 发射区域半径 */
  spread?: number;
  blend?: GlobalCompositeOperation;
  /** 3D 翻转（彩纸、钞票） */
  flip?: boolean;
  /** 前 x 比例生命内淡入 */
  fadeIn?: number;
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  sizeEnd: number;
  rot: number;
  vr: number;
  g: number;
  drag: number;
  sway: number;
  phase: number;
  img: HTMLCanvasElement;
  blend: GlobalCompositeOperation;
  flip: boolean;
  fadeIn: number;
}

export class ParticleSystem implements Entity {
  z = 100;
  private ps: P[] = [];
  /** 粒子上限，防止误操作把性能打爆 */
  max = 3000;

  constructor(private layer: CanvasLayer) {}

  get size() {
    return this.ps.length;
  }

  emit(x: number, y: number, o: EmitOptions) {
    const kinds = Array.isArray(o.kind) ? o.kind : [o.kind];
    const n = Math.min(o.count ?? 10, this.max - this.ps.length);
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % kinds.length];
      const a = val(o.angle ?? [-Math.PI * 0.9, -Math.PI * 0.1]);
      const s = val(o.speed ?? [120, 320]);
      const r = o.spread ? Math.sqrt(Math.random()) * o.spread : 0;
      const ra = Math.random() * Math.PI * 2;
      this.ps.push({
        x: x + Math.cos(ra) * r,
        y: y + Math.sin(ra) * r,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        age: 0,
        life: val(o.life ?? [0.7, 1.3]),
        size: val(o.size ?? [16, 28]),
        sizeEnd: o.sizeEnd ?? 0.6,
        rot: rand(-0.4, 0.4),
        vr: val(o.spin ?? [-3, 3]),
        g: o.gravity ?? 500,
        drag: o.drag ?? 0.9,
        sway: o.sway ?? 0,
        phase: rand(0, Math.PI * 2),
        img: o.color ? sprite(kind, o.color) : randomSprite(kind),
        blend: o.blend ?? "source-over",
        flip: o.flip ?? false,
        fadeIn: o.fadeIn ?? 0,
      });
    }
    if (!this.layer.has(this)) this.layer.add(this);
    else this.layer.invalidate();
  }

  /** 预设：贴纸被摸 / 被点时的小爆发 */
  burst(x: number, y: number, kinds: ParticleKind[], strength = 1) {
    this.emit(x, y, {
      kind: kinds,
      count: Math.round(8 * strength),
      angle: [-Math.PI * 0.95, -Math.PI * 0.05],
      speed: [140 * strength, 340 * strength],
      life: [0.7, 1.2],
      size: [16, 30],
      gravity: 420,
      spread: 10,
    });
  }

  clear() {
    this.ps = [];
  }

  update(dt: number) {
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.pow(p.drag, dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt + (p.sway ? Math.sin(p.age * 3 + p.phase) * p.sway * dt : 0);
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ps[w++] = p;
    }
    ps.length = w;
    return w > 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    let blend: GlobalCompositeOperation = "source-over";
    for (const p of this.ps) {
      const t = p.age / p.life;
      let alpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      if (p.fadeIn && t < p.fadeIn) alpha *= t / p.fadeIn;
      const s = p.size * (1 + (p.sizeEnd - 1) * t);
      if (p.blend !== blend) {
        blend = p.blend;
        ctx.globalCompositeOperation = blend;
      }
      ctx.globalAlpha = alpha;
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      const fx = p.flip ? Math.cos(p.age * 6 + p.phase) : 1;
      ctx.setTransform(cos * fx * this.layerDpr, sin * fx * this.layerDpr, -sin * this.layerDpr, cos * this.layerDpr, p.x * this.layerDpr, p.y * this.layerDpr);
      ctx.drawImage(p.img, -s / 2, -s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private get layerDpr() {
    return this.layer.rt.dpr;
  }
}
