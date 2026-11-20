import tabby from "@/assets/greeting/tabby.webp";
import shiba from "@/assets/greeting/shiba.webp";
import panda from "@/assets/greeting/panda.webp";
import rabbit from "@/assets/greeting/rabbit.webp";
import penguin from "@/assets/greeting/penguin.webp";
import otter from "@/assets/greeting/otter.webp";

export interface Greeting {
  id: string;
  src: string;
  text: string;
}

export const GREETINGS: Greeting[] = [
  { id: "tabby", src: tabby, text: "陪我玩～" },
  { id: "shiba", src: shiba, text: "今天也要开心呀" },
  { id: "panda", src: panda, text: "抱抱，充电中" },
  { id: "rabbit", src: rabbit, text: "胡萝卜分你一半" },
  { id: "penguin", src: penguin, text: "记得喝口水哦" },
  { id: "otter", src: otter, text: "我在这儿陪你" },
];
