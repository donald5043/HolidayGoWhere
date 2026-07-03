from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "promo" / "holidaygowhere-ig-reel.mp4"
ASSETS = ROOT / "promo" / "assets"
SCREENS = ASSETS / "screens"
FFMPEG = ROOT / ".codex-video-tools" / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"
LINK = "donald5043.github.io/HolidayGoWhere"

W, H = 1080, 1920
FPS = 18
DURATION = 24
TOTAL_FRAMES = FPS * DURATION

BG = (248, 244, 236)
SURFACE = (255, 252, 247)
TEXT = (36, 59, 55)
MUTED = (96, 115, 110)
PRIMARY = (217, 119, 95)
PRIMARY_DARK = (184, 90, 71)
GREEN = (120, 155, 141)
BLUE = (116, 197, 244)
YELLOW = (251, 211, 107)


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/msjhbd.ttc") if weight == "bold" else Path("C:/Windows/Fonts/msjh.ttc"),
        Path("C:/Windows/Fonts/NotoSansCJKtc-Regular.otf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default(size=size)


F_TITLE = font(88, "bold")
F_HERO = font(72, "bold")
F_SECTION = font(58, "bold")
F_BODY = font(38)
F_SMALL = font(29)
F_CAPTION = font(24)
F_LINK = font(34, "bold")


def ease(x: float) -> float:
    x = max(0, min(1, x))
    return 1 - (1 - x) ** 3


def text(draw: ImageDraw.ImageDraw, xy, value, font_obj, fill=TEXT, anchor=None, align="left", spacing=10):
    draw.multiline_text(xy, value, font=font_obj, fill=fill, anchor=anchor, align=align, spacing=spacing)


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def cover(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(im.convert("RGBA"), size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def contain(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = im.copy().convert("RGBA")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return canvas


def rounded_image(im: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, im.width, im.height), radius=radius, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def shadow(size: tuple[int, int], radius=55, alpha=80) -> Image.Image:
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    d.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=(50, 35, 25, alpha))
    return sh.filter(ImageFilter.GaussianBlur(26))


def gradient_bg(frame_i: int) -> Image.Image:
    img = Image.new("RGBA", (W, H), BG + (255,))
    pix = img.load()
    t = frame_i / max(1, TOTAL_FRAMES - 1)
    for y in range(H):
        yy = y / H
        r = int(248 + 8 * yy)
        g = int(244 + 7 * (1 - yy))
        b = int(236 + 13 * math.sin((yy + t) * math.pi))
        for x in range(W):
            pix[x, y] = (r, g, b, 255)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.ellipse((-180, 70, 470, 760), fill=(255, 202, 151, 90))
    d.ellipse((620, 80, 1270, 720), fill=(190, 229, 236, 105))
    d.ellipse((500, 1180, 1300, 2050), fill=(120, 155, 141, 55))
    return Image.alpha_composite(img, overlay)


def phone_mock(screen: Image.Image, w=430, y=480, x=None, zoom=1.0) -> Image.Image:
    if x is None:
        x = W - w - 80
    h = int(w * 844 / 390)
    w2, h2 = int(w * zoom), int(h * zoom)
    screen_img = cover(screen, (w2, h2))
    screen_img = rounded_image(screen_img, 48)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(shadow((w2 + 30, h2 + 30), 58, 72), (x - 15, y - 6))
    border = Image.new("RGBA", (w2 + 20, h2 + 20), SURFACE + (255,))
    border = rounded_image(border, 58)
    canvas.alpha_composite(border, (x - 10, y - 10))
    canvas.alpha_composite(screen_img, (x, y))
    return canvas


def pill(draw, x, y, label, color=GREEN, icon=None):
    pad_x = 24
    bbox = draw.textbbox((0, 0), label, font=F_SMALL)
    width = bbox[2] - bbox[0] + pad_x * 2 + (34 if icon else 0)
    rounded_rect(draw, (x, y, x + width, y + 58), 29, (255, 255, 255, 218), outline=(45, 74, 69, 24), width=2)
    if icon:
        draw.ellipse((x + 15, y + 16, x + 41, y + 42), fill=color)
        x += 38
    draw.text((x + pad_x, y + 28), label, font=F_SMALL, fill=TEXT, anchor="lm")


home = load_rgba(SCREENS / "01-home.png")
explore = load_rgba(SCREENS / "02-explore.png")
detail = load_rgba(SCREENS / "03-detail.png")
rescue = load_rgba(SCREENS / "04-rescue.png")
logo = load_rgba(ROOT / "public" / "brand" / "q-pang-app-icon-512.png")
head = load_rgba(ROOT / "public" / "brand" / "q-pang-head-transparent.png")
family = load_rgba(ROOT / "public" / "mascot" / "q-pang-family.png")
mom = load_rgba(ROOT / "public" / "mascot" / "q-mom.png")
qr = load_rgba(ASSETS / "site-qr.png")


def scene_index(sec: float):
    if sec < 4:
        return 0, sec / 4
    if sec < 8:
        return 1, (sec - 4) / 4
    if sec < 12:
        return 2, (sec - 8) / 4
    if sec < 16:
        return 3, (sec - 12) / 4
    if sec < 20:
        return 4, (sec - 16) / 4
    return 5, (sec - 20) / 4


def draw_scene(frame_i: int) -> Image.Image:
    sec = frame_i / FPS
    idx, local = scene_index(sec)
    p = ease(local)
    img = gradient_bg(frame_i)
    d = ImageDraw.Draw(img)

    # small brand bar
    icon = contain(logo, (78, 78))
    img.alpha_composite(icon, (62, 60))
    d.text((156, 72), "HolidayGoWhere", font=font(34, "bold"), fill=PRIMARY)
    d.text((156, 112), "帶孩子，去更好的地方", font=F_CAPTION, fill=MUTED)

    if idx == 0:
        mascot = contain(family, (620, 620))
        img.alpha_composite(mascot, (W - 650, 870))
        d.text((72, 285), "週末親子出遊，", font=F_HERO, fill=TEXT)
        d.text((72, 375), "不用再臨時抱佛腳。", font=F_HERO, fill=TEXT)
        d.text((76, 520), "景點、天氣、年齡、雨天備案、親子救援\n一次幫爸媽整理好。", font=F_BODY, fill=MUTED, spacing=14)
        pill(d, 76, 705, "免費打開就能用", PRIMARY, True)
        pill(d, 76, 785, "適合手機快速查看", GREEN, True)
        d.rounded_rectangle((70, 1550, 1010, 1690), radius=44, fill=PRIMARY)
        d.text((540, 1620), "假日去哪兒｜親子旅遊地圖", font=F_LINK, fill=(255, 255, 255), anchor="mm")

    elif idx == 1:
        x = int(585 - 30 * (1 - p))
        img.alpha_composite(phone_mock(home, w=430, y=405, x=x, zoom=1.0))
        d.text((72, 330), "今天去哪玩？", font=F_SECTION, fill=TEXT)
        d.text((72, 420), "Q胖先幫你想好。", font=F_SECTION, fill=PRIMARY_DARK)
        d.text((76, 560), "依照天氣與家庭需求，\n把週末靈感變成可出門方案。", font=F_BODY, fill=MUTED, spacing=14)
        pill(d, 76, 735, "今日提案", PRIMARY, True)
        pill(d, 76, 815, "附近景點", GREEN, True)

    elif idx == 2:
        img.alpha_composite(phone_mock(explore, w=440, y=380, x=570, zoom=1.02))
        d.text((72, 300), "快速篩選，", font=F_SECTION, fill=TEXT)
        d.text((72, 385), "找到適合孩子的地方。", font=F_SECTION, fill=TEXT)
        d.text((76, 535), "0–2歲、3–5歲、6–12歲\n室內外、雨天、放電、餐廳\n手機上滑一下就看懂。", font=F_BODY, fill=MUTED, spacing=12)
        pill(d, 76, 760, "互動地圖", BLUE, True)
        pill(d, 76, 840, "距離排序", GREEN, True)

    elif idx == 3:
        img.alpha_composite(phone_mock(rescue, w=445, y=370, x=560, zoom=1.02))
        mom_img = contain(mom, (280, 280))
        img.alpha_composite(mom_img, (78, 1120))
        d.text((72, 290), "出門臨時需要？", font=F_SECTION, fill=TEXT)
        d.text((72, 375), "親子救援幫你找。", font=F_SECTION, fill=PRIMARY_DARK)
        d.text((76, 520), "尿布、奶粉、母嬰用品、藥局\n還有兒童急診備援方向。", font=F_BODY, fill=MUTED, spacing=14)
        pill(d, 76, 725, "官方門市優先", GREEN, True)
        pill(d, 76, 805, "出發前確認", PRIMARY, True)

    elif idx == 4:
        img.alpha_composite(phone_mock(detail, w=455, y=370, x=560, zoom=1.02))
        q = contain(head, (250, 250))
        img.alpha_composite(q, (88, 1060))
        d.text((72, 300), "爸媽在意的，", font=F_SECTION, fill=TEXT)
        d.text((72, 385), "都放在卡片裡。", font=F_SECTION, fill=TEXT)
        d.text((76, 535), "停車、推車友善、育嬰室、\n雨天適合、附近餐廳與行程。", font=F_BODY, fill=MUTED, spacing=14)
        pill(d, 76, 760, "安心資訊", GREEN, True)
        pill(d, 76, 840, "一鍵收藏", PRIMARY, True)

    else:
        family_img = contain(family, (420, 420))
        img.alpha_composite(family_img, (W - 500, 260))
        qr_img = rounded_image(contain(qr, (360, 360)), 26)
        img.alpha_composite(shadow((400, 400), 36, 50), (94, 1055))
        qr_bg = Image.new("RGBA", (400, 400), SURFACE + (255,))
        qr_bg = rounded_image(qr_bg, 36)
        img.alpha_composite(qr_bg, (80, 1040))
        img.alpha_composite(qr_img, (100, 1060))
        d.text((72, 300), "下次放假，", font=F_HERO, fill=TEXT)
        d.text((72, 395), "先打開它。", font=F_HERO, fill=PRIMARY_DARK)
        d.text((76, 555), "分享給正在找親子景點、\n雨天備案、臨時補給的爸媽。", font=F_BODY, fill=MUTED, spacing=14)
        d.rounded_rectangle((80, 1500, 1000, 1645), radius=42, fill=PRIMARY)
        d.text((540, 1548), "立即收藏網站", font=F_LINK, fill=(255, 255, 255), anchor="mm")
        d.text((540, 1605), LINK, font=F_SMALL, fill=(255, 255, 255), anchor="mm")
        d.text((560, 1218), "掃 QR\n或點連結", font=F_BODY, fill=TEXT, spacing=10)

    # scene progress dots
    for i in range(6):
        cx = 410 + i * 52
        fill = PRIMARY if i == idx else (210, 205, 195)
        d.ellipse((cx, 1810, cx + 22, 1832), fill=fill)
    return img.convert("RGB")


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(FFMPEG),
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-s",
        f"{W}x{H}",
        "-pix_fmt",
        "rgb24",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-preset",
        "medium",
        "-crf",
        "20",
        str(OUT),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    for i in range(TOTAL_FRAMES):
        frame = draw_scene(i)
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    code = proc.wait()
    if code != 0:
        raise SystemExit(code)
    print(OUT)


if __name__ == "__main__":
    main()
