import type { EffectKind } from "../../shared/protocol";
import type { FxFactory } from "../core/fx";
import { fire, flood, freeze, ripple, sandstorm } from "./env";
import { fireworks } from "./fireworks";
import { ingotRain } from "./ingot";
import { coinRain, heartRain, moneyRain } from "./rains";
import { confetti, magic, meteorShower } from "./sky";
import { moneyBurst, moneyGun } from "./money";
import { missile, smoke } from "./smoke";
import { hacker, tvStatic, ultraman, ultramanTiga } from "./spectacle";
import { fireflies, rain, sakura, snow, thunderstorm } from "./weather";

/** 全屏特效注册表 */
export const EFFECT_FACTORIES: Partial<Record<EffectKind, FxFactory>> = {
  fireworks,
  "coin-rain": coinRain,
  "money-rain": moneyRain,
  "meteor-shower": meteorShower,
  "heart-rain": heartRain,
  magic,
  smoke,
  confetti,
  missile,
  snow,
  rain,
  thunderstorm,
  sakura,
  fireflies,
  "ingot-rain": ingotRain,
  "money-burst": moneyBurst,
  "money-gun": moneyGun,
  ultraman,
  "ultraman-tiga": ultramanTiga,
  hacker,
  "tv-static": tvStatic,
  fire,
  flood,
  freeze,
  sandstorm,
  ripple,
};
