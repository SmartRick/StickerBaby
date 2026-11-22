import room1 from "@/assets/rooms/room-1.webp";
import room2 from "@/assets/rooms/room-2.webp";
import room3 from "@/assets/rooms/room-3.webp";

export const ROOMS = [room1, room2, room3];

// 启动即预热全部房间图：展台首次进入和换房间都不再等解码
for (const src of ROOMS) new Image().src = src;

// 记住上次展示的房间：首页随页面切换重建时沿用同一张，避免重挂载时闪一下默认背景
let lastRoomIndex = Math.floor(Math.random() * ROOMS.length);

export function initialRoomIndex(): number {
  return lastRoomIndex;
}

export function rememberRoomIndex(index: number): void {
  lastRoomIndex = index;
}
