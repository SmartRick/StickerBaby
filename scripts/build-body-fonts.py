"""Build the rounded body font from the licensed source fonts.

The old 400-character subset broke whenever new UI copy was added, so this
script uses the GB2312 common set plus every character currently in the source.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(r"H:\百度网盘下载\免费可商用字体大全\资源圆体")
OUT = ROOT / "src" / "assets" / "fonts"
CHARS_FILE = ROOT / "scripts" / "font-chars.txt"

CJK_RANGES = [
    (0x3400, 0x4DBF),
    (0x4E00, 0x9FFF),
    (0xF900, 0xFAFF),
    (0x3000, 0x303F),
    (0xFF00, 0xFFEF),
]
EXTRA = set(
    "，。！？；：“”‘’（）《》【】…—·、,.!?;:'\"()[]{}<>/\\|@#$%^&*+-=_~`"
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)


def source_text() -> str:
    parts: list[str] = []
    for pattern in ("src/**/*.ts", "src/**/*.tsx", "src/**/*.css", "index.html"):
        for path in ROOT.glob(pattern):
            try:
                parts.append(path.read_text(encoding="utf-8"))
            except UnicodeDecodeError:
                parts.append(path.read_text(encoding="utf-8", errors="ignore"))
    return "\n".join(parts)


def gb2312_chars() -> set[str]:
    chars: set[str] = set()
    for high in range(0xA1, 0xF8):
        for low in range(0xA1, 0xFF):
            try:
                char = bytes((high, low)).decode("gb2312")
            except UnicodeDecodeError:
                continue
            chars.add(char)
    return chars


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"source font directory not found: {SOURCE}")
    OUT.mkdir(parents=True, exist_ok=True)

    chars: set[str] = set(EXTRA)
    chars.update(gb2312_chars())
    text = source_text()
    for char in text:
        code = ord(char)
        if (
            any(start <= code <= end for start, end in CJK_RANGES)
            or 0x20 <= code <= 0x7E
        ):
            chars.add(char)

    # Keep the file readable for future debugging.
    ordered = "".join(sorted(chars))
    CHARS_FILE.write_text(ordered, encoding="utf-8")
    print(f"characters: {len(chars)} -> {CHARS_FILE}")

    for weight, source_name in (
        ("regular", "ResourceHanRoundedCN-Regular.ttf"),
        ("bold", "ResourceHanRoundedCN-Bold.ttf"),
    ):
        source = SOURCE / source_name
        target = OUT / f"body-{weight}.woff2"
        if not source.exists():
            raise SystemExit(f"missing source font: {source}")
        subprocess.run(
            [
                sys.executable,
                "-m",
                "fontTools.subset",
                str(source),
                f"--text-file={CHARS_FILE}",
                "--flavor=woff2",
                f"--output-file={target}",
                "--no-hinting",
                "--desubroutinize",
                "--layout-features=*",
            ],
            check=True,
        )
        print(f"{target.name}: {target.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
