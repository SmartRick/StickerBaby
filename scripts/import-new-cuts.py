"""Import the user's hand-cut sticker sheets into src/assets/stickers.

The user owns cutting; this script only copies/renames final WebP files and
replaces the three original packs that were re-cut. It never crops images.
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "new-cut"
OUT = ROOT / "src" / "assets" / "stickers"

# New packs: folder name -> pack id. Each folder is a 6-character sheet.
NEW_PACKS = {
    "俏皮萌宠贴纸六联图": "playful-pets",
    "可爱宠物欢乐贴纸集": "happy-pets",
    "可爱宠物涂鸦贴纸合集": "doodle-pets",
    "彩铅萌宠贴纸六宫格": "colored-pencil-pets",
    "可爱动物贴纸乐园": "crayon-pets",
    "可爱手绘动物贴纸合集": "hand-drawn-forest",
    "六只可爱动物水彩贴纸": "watercolor-animals",
    "可爱粉彩动物贴纸合集": "pastel-animals",
    "粉彩蜡笔风可爱动物贴纸合集": "pastel-crayon",
    "搞怪动物表情贴纸合集": "funny-animals",
    "可爱动物乐园贴纸合集": "zoo-friends",
    "可爱动物贴纸合集 (1)": "forest-picnic",
    "打工人六格情绪贴纸__end__": "office-emotions",
    "职场日常可爱贴纸合集": "office-daily",
    "萌系职场日常贴纸合集": "office-cute",
}

# Re-cut versions of the three original packs. Keep the stable sticker ids so
# stored pets, effects and previews keep working.
RECUT_PACKS = {
    "萌趣动物贴纸合集": [
        "tabby-cat",
        "shiba",
        "panda",
        "rabbit",
        "penguin",
        "otter",
    ],
    "可爱森林动物贴纸合集": [
        "fox",
        "deer",
        "raccoon",
        "hedgehog",
        "squirrel",
        "owl",
    ],
    "可爱海洋动物贴纸合集": [
        "whale",
        "clownfish",
        "octopus",
        "dolphin",
        "crab",
        "starfish",
    ],
}


def six_files(folder: Path) -> list[Path]:
    files = sorted(folder.glob("*.webp"))
    if len(files) != 6:
        raise SystemExit(f"{folder.name}: expected 6 files, found {len(files)}")
    return files


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    copied = 0
    for folder_name, pack_id in NEW_PACKS.items():
        folder = SRC / folder_name
        for index, path in enumerate(six_files(folder), start=1):
            target = OUT / f"{pack_id}-{index}.webp"
            shutil.copy2(path, target)
            copied += 1
        print(f"[new] {pack_id}: 6")

    replaced = 0
    for folder_name, ids in RECUT_PACKS.items():
        folder = SRC / folder_name
        for sticker_id, path in zip(ids, six_files(folder)):
            shutil.copy2(path, OUT / f"{sticker_id}.webp")
            replaced += 1
        print(f"[recut] {folder_name}: 6 -> {', '.join(ids)}")

    print(f"copied {copied} new files, replaced {replaced} original files")
    print(f"assets now: {len(list(OUT.glob('*.webp')))}")


if __name__ == "__main__":
    main()
