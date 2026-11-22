import type { PrankKind } from "../../shared/protocol";
import type { FxFactory } from "../core/fx";
import { crawler } from "./crawlers";
import { createCrack, createShatter } from "./glass";
import { createBlood, createEyes, createGhost, createHands } from "./horror";
import { createPandaVirus } from "./panda";
import { createErrorPopups } from "./popups";
import { createButterfly, createGoldfish } from "./pretty";
import { createScrawl } from "./scrawl";
import { createGlitchScreen, createGraffiti, createStain, createTape } from "./surface";

/** 恶作剧 / 全屏桌面层注册表 */
export const PRANK_FACTORIES: Partial<Record<PrankKind, FxFactory>> = {
  crack: createCrack,
  shatter: createShatter,
  stain: createStain,
  "glitch-screen": createGlitchScreen,
  graffiti: createGraffiti,
  tape: createTape,
  "horror-blood": createBlood,
  "horror-eyes": createEyes,
  "horror-hands": createHands,
  "horror-ghost": createGhost,
  "horror-scrawl": createScrawl,
  "error-popups": createErrorPopups,
  "panda-virus": createPandaVirus,
  centipede: crawler("centipede"),
  millipede: crawler("millipede"),
  cockroach: crawler("cockroach"),
  maggot: crawler("maggot"),
  gecko: crawler("gecko"),
  fly: crawler("fly"),
  ant: crawler("ant"),
  goldfish: createGoldfish,
  butterfly: createButterfly,
};
