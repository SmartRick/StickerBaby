"""开发调试：截屏 / 模拟鼠标。
python scripts/desk.py shot out.png [scale]
python scripts/desk.py move x y | click x y | drag x1 y1 x2 y2 | rub x y
坐标为物理像素。
"""
import ctypes
import sys
import time

from PIL import ImageGrab

user32 = ctypes.windll.user32
user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
DOWN, UP = 0x0002, 0x0004


def move(x, y):
    user32.SetCursorPos(int(x), int(y))


def press(down):
    user32.mouse_event(DOWN if down else UP, 0, 0, 0, 0)


def main():
    cmd, *a = sys.argv[1:]
    if cmd == "shot":
        im = ImageGrab.grab(all_screens=False)
        s = float(a[1]) if len(a) > 1 else 0.5
        im = im.resize((int(im.width * s), int(im.height * s)))
        im.save(a[0])
        print(im.size)
    elif cmd == "move":
        move(a[0], a[1])
    elif cmd == "click":
        move(a[0], a[1]); time.sleep(0.15); press(True); time.sleep(0.05); press(False)
    elif cmd == "drag":
        x1, y1, x2, y2 = map(float, a)
        move(x1, y1); time.sleep(0.15); press(True)
        for i in range(1, 21):
            move(x1 + (x2 - x1) * i / 20, y1 + (y2 - y1) * i / 20); time.sleep(0.015)
        press(False)
    elif cmd == "rub":
        x, y = map(float, a)
        for i in range(40):
            move(x + (40 if i % 2 else -40), y); time.sleep(0.03)


main()
