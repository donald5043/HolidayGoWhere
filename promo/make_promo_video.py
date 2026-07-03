from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "promo"
ASSETS = PROMO / "assets"
LIVE = ASSETS / "live-screens"
LEGACY = ASSETS / "screens"
OUT = PROMO / "holidaygowhere-ig-reel.mp4"
COVER = PROMO / "holidaygowhere-ig-reel-cover.jpg"
FFMPEG = ROOT / ".codex-video-tools" / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"

W, H = 1080, 1920
FPS = 24
DURATION = 18
TOTAL = FPS * DURATION

BG = (248, 244, 236)
INK = (36, 59, 55)
MUTED = (96, 115, 110)
CREAM = (255, 252, 247)
ORANGE = (255, 111, 48)
CORAL = (217, 119, 95)
GREEN = (120, 155, 141)
BLUE = (116, 197, 244)
YELLOW = (251, 211, 107)
WHITE = (255, 255, 255)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/msjhbd.ttc") if bold else Path("C:/Windows/Fonts/msjh.ttc"),
        Path("C:/Windows/Fonts/NotoSansCJKtc-Bold.otf") if bold else Path("C:/Windows/Fonts/NotoSansCJKtc-Regular.otf"),
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for item in candidates:
        if item.exists():
            return ImageFont.truetype(str(item), size=size)
    return ImageFont.load_default(size=size)


F_HUGE = font(116, True)
F_BIG = font(88, True)
F_TITLE = font(66, True)
F_MID = font(46, True)
F_BODY = font(34)
F_BODY_B = font(34, True)
F_SMALL = font(26)
F_SMALL_B = font(26, True)
F_TINY = font(20)


def clamp(v: float, low = 0.0, high = 1.0) -> float:
    return max(low, min(high, v))


def ease(t: float) -> float:
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out(t: float) -> float:
    t = clamp(t)
    return t * t * (3 - 2 * t)


def bounce(t: float) -> float:
    t = clamp(t)
    return 1 + 0.12 * math.sin(t * math.pi) * (1 - t)


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def screen(name: str, fallback: str) -> Image.Image:
    path = LIVE / name
    if path.exists():
        return load(path)
    return load(LEGACY / fallback)


def contain(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = img.copy().convert("RGBA")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return canvas


def cover(img: Image.Image, size: tuple[int, int], center = (0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(img.convert("RGBA"), size, method=Image.Resampling.LANCZOS, centering=center)


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width, img.height), radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def paste(base: Image.Image, overlay: Image.Image, xy: tuple[int, int], opacity = 1.0) -> None:
    overlay = overlay.convert("RGBA")
    if opacity < 1:
        a = overlay.getchannel("A").point(lambda p: int(p * clamp(opacity)))
        overlay.putalpha(a)
    base.alpha_composite(overlay, xy)


def shadow_from_alpha(img: Image.Image, alpha = 80, blur = 18) -> Image.Image:
    src = img.convert("RGBA")
    mask = src.getchannel("A").filter(ImageFilter.GaussianBlur(blur))
    sh = Image.new("RGBA", src.size, (42, 36, 28, alpha))
    sh.putalpha(mask.point(lambda p: int(p * alpha / 255)))
    return sh


def soft_panel(size: tuple[int, int], radius: int, alpha = 230) -> Image.Image:
    panel = Image.new("RGBA", size, CREAM + (alpha,))
    return rounded(panel, radius)


def text_wrap(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, fnt: ImageFont.FreeTypeFont, width: int, fill = INK, spacing = 10) -> None:
    lines: list[str] = []
    current = ""
    for ch in value:
        trial = current + ch
        if draw.textbbox((0, 0), trial, font=fnt)[2] > width and current:
            lines.append(current)
            current = ch
        else:
            current = trial
    if current:
        lines.append(current)
    draw.multiline_text(xy, "\n".join(lines), font=fnt, fill=fill, spacing=spacing)


def stage_bg(frame: int, warm = 1.0) -> Image.Image:
    t = frame / max(1, TOTAL)
    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    d.ellipse((-240 + int(40 * math.sin(t * 6.28)), 110, 560, 850), fill=(255, 186, 132, int(78 * warm)))
    d.ellipse((560, -120, 1360, 650), fill=(190, 229, 236, 95))
    d.ellipse((460, 1160, 1320, 2120), fill=(120, 155, 141, 55))
    return img


def brand_pill(img: Image.Image, compact = False) -> None:
    d = ImageDraw.Draw(img)
    x, y, w, h = 54, 46, 480 if compact else 620, 94
    panel = soft_panel((w, h), 34, 238)
    paste(img, panel.filter(ImageFilter.GaussianBlur(0)), (x, y))
    icon = contain(app_icon, (62, 62))
    paste(img, icon, (x + 18, y + 16))
    d.text((x + 94, y + 18), "HolidayGoWhere", font=F_SMALL_B, fill=CORAL)
    d.text((x + 94, y + 52), "帶孩子，去更好的地方", font=F_TINY, fill=MUTED)


def big_caption(img: Image.Image, top: int, lines: list[tuple[str, tuple[int, int, int], ImageFont.FreeTypeFont]]) -> None:
    d = ImageDraw.Draw(img)
    y = top
    for text, color, fnt in lines:
        d.text((70, y), text, font=fnt, fill=color)
        y += int(fnt.size * 1.12)


def phone(img: Image.Image, shot: Image.Image, box: tuple[int, int, int, int], p: float, zoom = 1.0, pan = 0.5, tilt = 0.0) -> None:
    x, y, w, h = box
    s = 0.86 + 0.14 * ease(p)
    w2, h2 = int(w * s), int(h * s)
    x2, y2 = x + (w - w2) // 2, y + (h - h2) // 2
    content = cover(shot, (int(w2 * zoom), int(h2 * zoom)), center=(0.5, pan))
    content = cover(content, (w2, h2))
    content = rounded(content, 56)
    if tilt:
        content = content.rotate(tilt, resample=Image.Resampling.BICUBIC, expand=True)
    sh = soft_panel((w2 + 42, h2 + 42), 66, 95).filter(ImageFilter.GaussianBlur(22))
    paste(img, sh, (x2 - 21, y2 + 8), 0.42)
    frame = soft_panel((w2 + 20, h2 + 20), 68, 255)
    paste(img, frame, (x2 - 10, y2 - 10))
    paste(img, content, (x2 - (content.width - w2) // 2, y2 - (content.height - h2) // 2))


def sticker(img: Image.Image, asset: Image.Image, x: int, y: int, size: tuple[int, int], p: float, rotate = 0.0, bob = 8) -> None:
    st = contain(asset, size)
    scale = bounce(p)
    st = st.resize((int(st.width * scale), int(st.height * scale)), Image.Resampling.LANCZOS)
    if rotate:
        st = st.rotate(rotate, resample=Image.Resampling.BICUBIC, expand=True)
    y2 = y + int(math.sin(p * math.tau * 1.5) * bob)
    paste(img, shadow_from_alpha(st, 110, 16), (x + 12, y2 + 18), 0.9)
    paste(img, st, (x, y2))


def chip(img: Image.Image, x: int, y: int, label: str, color: tuple[int, int, int], p: float) -> None:
    if p <= 0:
        return
    d = ImageDraw.Draw(img)
    fnt = F_BODY_B
    bbox = d.textbbox((0, 0), label, font=fnt)
    w, h = bbox[2] - bbox[0] + 58, 68
    s = ease(p)
    panel = Image.new("RGBA", (w, h), color + (245,))
    panel = rounded(panel, 34)
    paste(img, panel, (x, y), s)
    if s > 0.55:
        d.text((x + 29, y + 34), label, font=fnt, fill=WHITE, anchor="lm")


def tap_pulse(draw: ImageDraw.ImageDraw, x: int, y: int, p: float) -> None:
    p = p % 1
    r = 18 + int(78 * ease(p))
    alpha = int(190 * (1 - p))
    draw.ellipse((x - r, y - r, x + r, y + r), outline=ORANGE + (alpha,), width=7)
    draw.ellipse((x - 15, y - 15, x + 15, y + 15), fill=ORANGE + (235,))


def progress(img: Image.Image, sec: float) -> None:
    d = ImageDraw.Draw(img)
    x, y, w, h = 72, 1810, 936, 9
    d.rounded_rectangle((x, y, x + w, y + h), radius=5, fill=(232, 218, 203, 210))
    d.rounded_rectangle((x, y, x + int(w * clamp(sec / DURATION)), y + h), radius=5, fill=ORANGE + (255,))


app_icon = load(ROOT / "public" / "brand" / "q-pang-app-icon-512.png")
q_head = load(ROOT / "public" / "brand" / "q-pang-head-transparent.png")
q_family = load(ROOT / "public" / "mascot" / "q-pang-family.png")
q_waving = load(ROOT / "public" / "mascot" / "q-pang-waving-premium.png")
q_bao = load(ROOT / "public" / "mascot" / "q-bao.png")
q_mom = load(ROOT / "public" / "mascot" / "q-mom.png")
q_running = load(ROOT / "public" / "mascot" / "q-pang-running.webp")
q_camera = load(ROOT / "public" / "mascot" / "q-pang-camera.webp")
qr = load(ASSETS / "site-qr.png")

home = screen("01-real-home.png", "01-home.png")
explore = screen("02-real-explore-map.png", "02-explore.png")
map_taipei = screen("03-real-map-expanded.png", "02-explore.png")
qmom = screen("05-real-qmom-chat.png", "01-home.png")
rescue = screen("04-real-rescue.png", "04-rescue.png")


def scene_hook(frame: int, sec: float) -> Image.Image:
    p = sec / 2.4
    img = stage_bg(frame)
    bg = cover(home, (W, H), center=(0.5, 0.15)).filter(ImageFilter.GaussianBlur(12))
    paste(img, bg, (0, 0), 0.18)
    brand_pill(img, compact=True)
    big_caption(img, 300, [
        ("週末又不知道", INK, F_BIG),
        ("帶小孩去哪？", ORANGE, F_BIG),
    ])
    d = ImageDraw.Draw(img)
    d.text((76, 560), "雨天、推車、尿布、放電需求一次來。", font=F_BODY, fill=MUTED)
    for i, label in enumerate(["下雨了", "小孩想放電", "爸媽想休息"]):
        chip(img, 82, 690 + i * 86, label, [ORANGE, GREEN, BLUE][i], clamp((p - i * 0.16) / 0.55))
    sticker(img, q_head, 690, 515, (250, 250), p, rotate=math.sin(sec * 5) * 4)
    d.text((740, 800), "救援！", font=F_MID, fill=CORAL)
    progress(img, sec)
    return img.convert("RGB")


def scene_qpang(frame: int, sec: float) -> Image.Image:
    p = (sec - 2.4) / 2.6
    img = stage_bg(frame)
    phone(img, home, (455, 270, 560, 1220), p, zoom=1.05, pan=0.34, tilt=-2.5 + 2.5 * ease(p))
    big_caption(img, 255, [
        ("讓 Q胖", INK, F_BIG),
        ("先幫你想好", CORAL, F_BIG),
    ])
    d = ImageDraw.Draw(img)
    d.text((78, 520), "不用再開十幾個分頁查資料。", font=F_BODY, fill=MUTED)
    sticker(img, q_waving, 82, 1040, (330, 470), p, rotate=-4)
    chip(img, 86, 720, "定位推薦", ORANGE, clamp((p - 0.05) / 0.45))
    chip(img, 86, 805, "雨天備案", GREEN, clamp((p - 0.18) / 0.45))
    chip(img, 86, 890, "推車友善", BLUE, clamp((p - 0.31) / 0.45))
    progress(img, sec)
    return img.convert("RGB")


def scene_filters(frame: int, sec: float) -> Image.Image:
    p = (sec - 5.0) / 3.0
    img = stage_bg(frame)
    phone(img, explore, (86, 500, 570, 1030), p, zoom=1.1, pan=0.2)
    sticker(img, q_bao, 710, 1040, (250, 370), p, rotate=3)
    d = ImageDraw.Draw(img)
    panel = soft_panel((910, 255), 48, 238)
    paste(img, panel, (84, 250), ease(p))
    d.text((130, 305), "情境一鍵選", font=F_MID, fill=INK)
    d.text((130, 382), "年齡、地區、雨天、放電需求，\n直接幫爸媽排好。", font=F_BODY, fill=MUTED, spacing=12)
    chip(img, 640, 610, "0–2 歲", ORANGE, clamp((p - 0.1) / 0.4))
    chip(img, 640, 695, "雨天備案", GREEN, clamp((p - 0.25) / 0.4))
    chip(img, 640, 780, "孩子放電", BLUE, clamp((p - 0.4) / 0.4))
    progress(img, sec)
    return img.convert("RGB")


def scene_map(frame: int, sec: float) -> Image.Image:
    p = (sec - 8.0) / 3.0
    img = stage_bg(frame)
    phone(img, map_taipei, (330, 215, 650, 1350), p, zoom=1.06, pan=0.48)
    big_caption(img, 250, [
        ("台北附近", INK, F_TITLE),
        ("一眼看懂", ORANGE, F_TITLE),
    ])
    d = ImageDraw.Draw(img)
    d.text((76, 430), "地圖、距離、景點分布\n直接展開看。", font=F_BODY, fill=MUTED, spacing=12)
    sticker(img, q_head, 90, 1030, (230, 230), p, rotate=-6)
    tap_pulse(d, 750, 990, sec * 1.9)
    progress(img, sec)
    return img.convert("RGB")


def scene_qmom(frame: int, sec: float) -> Image.Image:
    p = (sec - 11.0) / 2.7
    img = stage_bg(frame)
    phone(img, qmom, (96, 250, 620, 1300), p, zoom=1.08, pan=0.47)
    sticker(img, q_mom, 660, 930, (300, 440), p, rotate=2)
    d = ImageDraw.Draw(img)
    panel = soft_panel((430, 390), 46, 240)
    paste(img, panel, (600, 300), ease(p))
    d.text((640, 350), "直接問 Q媽", font=F_MID, fill=INK)
    d.text((640, 425), "「下雨帶 2 歲去哪？」\n「附近吃什麼？」\n她會幫你整理。", font=F_BODY, fill=MUTED, spacing=12)
    chip(img, 640, 660, "可追問", ORANGE, clamp((p - 0.25) / 0.4))
    progress(img, sec)
    return img.convert("RGB")


def scene_rescue(frame: int, sec: float) -> Image.Image:
    p = (sec - 13.7) / 2.1
    img = stage_bg(frame)
    phone(img, rescue, (470, 240, 530, 1260), p, zoom=1.07, pan=0.42)
    big_caption(img, 280, [
        ("尿布奶粉", INK, F_TITLE),
        ("臨時缺？", ORANGE, F_TITLE),
    ])
    d = ImageDraw.Draw(img)
    d.text((76, 455), "母嬰用品、藥局、\n急診救援點一起找。", font=F_BODY, fill=MUTED, spacing=12)
    sticker(img, q_running, 94, 980, (280, 390), p, rotate=-4)
    chip(img, 82, 660, "親子救援", ORANGE, clamp((p - 0.1) / 0.35))
    chip(img, 82, 745, "附近補給", GREEN, clamp((p - 0.25) / 0.35))
    progress(img, sec)
    return img.convert("RGB")


def scene_cta(frame: int, sec: float) -> Image.Image:
    p = (sec - 15.8) / 2.2
    img = stage_bg(frame)
    brand_pill(img)
    sticker(img, q_family, 170, 235, (740, 470), p, rotate=0, bob=3)
    d = ImageDraw.Draw(img)
    d.text((82, 770), "這個週末，", font=F_HUGE, fill=INK)
    d.text((82, 900), "讓 Q胖陪你出門。", font=F_BIG, fill=CORAL)
    d.text((86, 1045), "景點、餐廳、雨天備案、臨時補給，一張地圖一起看。", font=F_BODY, fill=MUTED)
    qr_box = soft_panel((360, 360), 44, 245)
    paste(img, qr_box, (86, 1220), ease(p))
    paste(img, rounded(contain(qr, (300, 300)), 24), (116, 1250), ease(p))
    d.rounded_rectangle((480, 1260, 990, 1390), radius=48, fill=ORANGE + (255,))
    d.text((735, 1315), "掃 QR 立刻打開", font=F_BODY_B, fill=WHITE, anchor="mm")
    d.text((735, 1360), "donald5043.github.io/...", font=F_SMALL_B, fill=WHITE, anchor="mm")
    d.text((486, 1470), "收藏起來，下次不用重找。", font=F_BODY, fill=INK)
    progress(img, sec)
    return img.convert("RGB")


def draw_frame(frame: int) -> Image.Image:
    sec = frame / FPS
    if sec < 2.4:
        return scene_hook(frame, sec)
    if sec < 5.0:
        return scene_qpang(frame, sec)
    if sec < 8.0:
        return scene_filters(frame, sec)
    if sec < 11.0:
        return scene_map(frame, sec)
    if sec < 13.7:
        return scene_qmom(frame, sec)
    if sec < 15.8:
        return scene_rescue(frame, sec)
    return scene_cta(frame, sec)


def main() -> None:
    if not FFMPEG.exists():
        raise SystemExit(f"找不到 ffmpeg：{FFMPEG}")
    cmd = [
        str(FFMPEG),
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{W}x{H}",
        "-pix_fmt", "rgb24",
        "-r", str(FPS),
        "-i", "-",
        "-an",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-preset", "medium",
        "-crf", "18",
        str(OUT),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    for frame in range(TOTAL):
        proc.stdin.write(draw_frame(frame).tobytes())
    proc.stdin.close()
    code = proc.wait()
    if code != 0:
        raise SystemExit(code)
    draw_frame(int(FPS * 1.2)).save(COVER, quality=94)
    print(OUT)
    print(COVER)


if __name__ == "__main__":
    main()
