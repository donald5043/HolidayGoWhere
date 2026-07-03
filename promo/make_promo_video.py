from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "promo"
ASSETS = PROMO / "assets"
LEGACY_SCREENS = ASSETS / "screens"
LIVE_SCREENS = ASSETS / "live-screens"
OUT = PROMO / "holidaygowhere-ig-reel.mp4"
COVER = PROMO / "holidaygowhere-ig-reel-cover.jpg"
FFMPEG = ROOT / ".codex-video-tools" / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"
LINK = "donald5043.github.io/HolidayGoWhere"

W, H = 1080, 1920
FPS = 24
SECONDS = 27
TOTAL_FRAMES = FPS * SECONDS

BG = (248, 244, 236)
SURFACE = (255, 252, 247)
TEXT = (36, 59, 55)
MUTED = (96, 115, 110)
PRIMARY = (255, 111, 48)
PRIMARY_DARK = (184, 90, 71)
GREEN = (120, 155, 141)
MINT = (219, 241, 232)
CREAM = (255, 243, 218)
YELLOW = (251, 211, 107)
BLUE = (116, 197, 244)
WHITE = (255, 255, 255)


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    candidates = []
    if weight == "bold":
        candidates.extend([
            Path("C:/Windows/Fonts/msjhbd.ttc"),
            Path("C:/Windows/Fonts/NotoSansCJKtc-Bold.otf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
        ])
    else:
        candidates.extend([
            Path("C:/Windows/Fonts/msjh.ttc"),
            Path("C:/Windows/Fonts/NotoSansCJKtc-Regular.otf"),
            Path("C:/Windows/Fonts/arial.ttf"),
        ])
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default(size=size)


F_MEGA = font(96, "bold")
F_TITLE = font(66, "bold")
F_SUBTITLE = font(48, "bold")
F_BODY = font(36)
F_BODY_BOLD = font(36, "bold")
F_SMALL = font(28)
F_SMALL_BOLD = font(28, "bold")
F_CAPTION = font(23)
F_LINK = font(32, "bold")


def clamp(value: float, low = 0.0, high = 1.0) -> float:
    return max(low, min(high, value))


def ease_out(t: float) -> float:
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out(t: float) -> float:
    t = clamp(t)
    return t * t * (3 - 2 * t)


def pop(t: float) -> float:
    t = clamp(t)
    if t < 0.72:
        return 1.08 * math.sin((t / 0.72) * math.pi / 2)
    return 1.08 - 0.08 * ease_out((t - 0.72) / 0.28)


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def cover(im: Image.Image, size: tuple[int, int], centering = (0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(im.convert("RGBA"), size, method=Image.Resampling.LANCZOS, centering=centering)


def contain(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    out = im.copy().convert("RGBA")
    out.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(out, ((size[0] - out.width) // 2, (size[1] - out.height) // 2))
    return canvas


def rounded_image(im: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, im.width, im.height), radius=radius, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def soft_shadow(size: tuple[int, int], radius = 70, alpha = 70, blur = 30) -> Image.Image:
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    d.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=(64, 42, 28, alpha))
    return sh.filter(ImageFilter.GaussianBlur(blur))


def draw_text_box(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font_obj: ImageFont.FreeTypeFont,
    fill = TEXT,
    max_width = 900,
    spacing = 8,
    anchor: str | None = None,
) -> None:
    words = list(text)
    lines: list[str] = []
    current = ""
    for ch in words:
        trial = current + ch
        bbox = draw.textbbox((0, 0), trial, font=font_obj)
        if bbox[2] - bbox[0] > max_width and current:
            lines.append(current)
            current = ch
        else:
            current = trial
    if current:
        lines.append(current)
    draw.multiline_text(xy, "\n".join(lines), font=font_obj, fill=fill, spacing=spacing, anchor=anchor)


def paste_with_opacity(base: Image.Image, overlay: Image.Image, xy: tuple[int, int], opacity = 1.0) -> None:
    overlay = overlay.convert("RGBA")
    if opacity < 0.999:
        alpha = overlay.getchannel("A").point(lambda p: int(p * clamp(opacity)))
        overlay.putalpha(alpha)
    base.alpha_composite(overlay, xy)


def resize_by_scale(im: Image.Image, scale: float) -> Image.Image:
    scale = max(0.01, scale)
    return im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.Resampling.LANCZOS)


def make_bg(frame_i: int) -> Image.Image:
    t = frame_i / TOTAL_FRAMES
    img = Image.new("RGBA", (W, H), BG + (255,))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.ellipse((-260 + int(35 * math.sin(t * math.tau)), 90, 560, 880), fill=(255, 196, 138, 72))
    d.ellipse((540, -70 + int(25 * math.cos(t * math.tau)), 1320, 720), fill=(190, 229, 236, 98))
    d.ellipse((420, 1200, 1300, 2140), fill=(120, 155, 141, 58))
    d.rectangle((0, 0, W, H), fill=(255, 255, 255, 16))
    return Image.alpha_composite(img, overlay)


def brand_header(img: Image.Image, alpha = 0.94) -> None:
    d = ImageDraw.Draw(img)
    header = Image.new("RGBA", (W - 96, 112), WHITE + (235,))
    header = rounded_image(header, 42)
    paste_with_opacity(img, soft_shadow((W - 96, 112), 42, 35, 16), (48, 42), alpha)
    paste_with_opacity(img, header, (48, 36), alpha)
    icon = contain(brand_icon, (72, 72))
    paste_with_opacity(img, icon, (72, 56), alpha)
    d.text((158, 62), "HolidayGoWhere", font=F_SMALL_BOLD, fill=PRIMARY_DARK)
    d.text((158, 98), "帶孩子，去更好的地方", font=F_CAPTION, fill=MUTED)
    d.rounded_rectangle((830, 58, 1000, 126), radius=34, fill=(255, 238, 221, int(245 * alpha)))
    d.text((915, 92), "親子地圖", font=F_CAPTION, fill=PRIMARY_DARK, anchor="mm")


def phone_frame(
    img: Image.Image,
    screen: Image.Image,
    box: tuple[int, int, int, int],
    progress: float,
    zoom = 1.0,
    pan_y = 0.5,
    tilt = 0.0,
) -> None:
    x, y, w, h = box
    scale = 0.92 + 0.08 * ease_out(progress)
    w2, h2 = int(w * scale), int(h * scale)
    x2 = x + (w - w2) // 2
    y2 = y + (h - h2) // 2

    crop_center = (0.5, pan_y)
    screen_fit = cover(screen, (int(w2 * zoom), int(h2 * zoom)), centering=crop_center)
    if zoom != 1.0:
        screen_fit = cover(screen_fit, (w2, h2))
    screen_fit = rounded_image(screen_fit, 58)

    sh = soft_shadow((w2 + 42, h2 + 42), 64, 72, 24)
    paste_with_opacity(img, sh, (x2 - 21, y2 - 8), 1)
    bezel = Image.new("RGBA", (w2 + 22, h2 + 22), WHITE + (255,))
    bezel = rounded_image(bezel, 66)
    paste_with_opacity(img, bezel, (x2 - 11, y2 - 11), 1)

    if abs(tilt) > 0.01:
        screen_fit = screen_fit.rotate(tilt, resample=Image.Resampling.BICUBIC, expand=True)
        paste_with_opacity(img, screen_fit, (x2 - (screen_fit.width - w2) // 2, y2 - (screen_fit.height - h2) // 2), 1)
    else:
        paste_with_opacity(img, screen_fit, (x2, y2), 1)


def sticker(
    img: Image.Image,
    asset: Image.Image,
    xy: tuple[int, int],
    size: tuple[int, int],
    progress: float,
    bounce = 8,
    rotate = 0.0,
    opacity = 1.0,
) -> None:
    p = pop(progress)
    st = contain(asset, size)
    st = resize_by_scale(st, p)
    if abs(rotate) > 0.01:
        st = st.rotate(rotate, resample=Image.Resampling.BICUBIC, expand=True)
    y_bounce = int(math.sin(progress * math.tau * 1.5) * bounce)
    x, y = xy
    paste_with_opacity(img, soft_shadow((st.width, st.height), 40, 36, 16), (x + 10, y + 18 + y_bounce), opacity)
    paste_with_opacity(img, st, (x, y + y_bounce), opacity)


def bubble(
    img: Image.Image,
    xy: tuple[int, int],
    lines: list[str],
    progress: float,
    color = WHITE,
    text_color = TEXT,
    width = 500,
) -> None:
    x, y = xy
    p = ease_out(progress)
    h = 44 + len(lines) * 42
    panel = Image.new("RGBA", (width, h), color + (238,))
    panel = rounded_image(panel, 34)
    paste_with_opacity(img, soft_shadow((width, h), 34, 34, 14), (x, y + 10), p)
    paste_with_opacity(img, panel, (x, y), p)
    d = ImageDraw.Draw(img)
    for idx, line in enumerate(lines):
        d.text((x + 30, y + 30 + idx * 42), line, font=F_SMALL_BOLD if idx == 0 else F_SMALL, fill=text_color)


def chip(img: Image.Image, xy: tuple[int, int], label: str, color = PRIMARY, progress = 1.0) -> None:
    if progress <= 0.04:
        return
    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), label, font=F_SMALL_BOLD)
    w = bbox[2] - bbox[0] + 54
    h = 58
    x, y = xy
    p = ease_out(progress)
    visible_w = max(58, int(w * p))
    d.rounded_rectangle((x, y, x + visible_w, y + h), radius=29, fill=color + (245,))
    if p > 0.72:
        d.text((x + 27, y + 29), label, font=F_SMALL_BOLD, fill=WHITE, anchor="lm")


@dataclass
class Scene:
    start: float
    end: float
    screen: Image.Image
    title: str
    subtitle: str
    mascot: Image.Image
    mascot_xy: tuple[int, int]
    mascot_size: tuple[int, int]
    bubble_lines: list[str]
    chips: list[str]
    pan_y: float = 0.5
    zoom: float = 1.0

    def progress(self, sec: float) -> float:
        return clamp((sec - self.start) / (self.end - self.start))


def load_screen(name: str, fallback: str) -> Image.Image:
    live = LIVE_SCREENS / name
    if live.exists():
        return load_rgba(live)
    return load_rgba(LEGACY_SCREENS / fallback)


brand_icon = load_rgba(ROOT / "public" / "brand" / "q-pang-app-icon-512.png")
q_head = load_rgba(ROOT / "public" / "brand" / "q-pang-head-transparent.png")
q_bao = load_rgba(ROOT / "public" / "mascot" / "q-bao.png")
q_mom = load_rgba(ROOT / "public" / "mascot" / "q-mom.png")
q_family = load_rgba(ROOT / "public" / "mascot" / "q-pang-family.png")
q_waving = load_rgba(ROOT / "public" / "mascot" / "q-pang-waving-premium.png")
q_map = load_rgba(ROOT / "public" / "mascot" / "q-pang-map-premium.png")
q_running = load_rgba(ROOT / "public" / "mascot" / "q-pang-running.webp")
q_camera = load_rgba(ROOT / "public" / "mascot" / "q-pang-camera.webp")
qr = load_rgba(ASSETS / "site-qr.png")

screens = {
    "home": load_screen("01-real-home.png", "01-home.png"),
    "explore": load_screen("02-real-explore-map.png", "02-explore.png"),
    "map": load_screen("03-real-map-expanded.png", "02-explore.png"),
    "qmom_fab": load_screen("04-real-qmom-fab.png", "01-home.png"),
    "qmom_chat": load_screen("05-real-qmom-chat.png", "01-home.png"),
    "detail": load_screen("03-real-detail.png", "03-detail.png"),
    "rescue": load_screen("04-real-rescue.png", "04-rescue.png"),
}

SCENES = [
    Scene(0.0, 4.2, screens["home"], "週末去哪玩？", "不用再滑到崩潰，讓 Q胖先整理好。", q_waving, (650, 1180), (330, 460), ["Q胖說", "先看天氣、距離、年齡"], ["定位推薦", "雨天備案", "推車友善"], 0.43),
    Scene(4.2, 8.2, screens["explore"], "像打開一張親子雷達", "年齡、地區、情境，一秒縮小選擇。", q_bao, (55, 1170), (260, 380), ["Q寶視角", "放電？推車？我來看"], ["0–2歲", "放電", "爸媽想休息"], 0.46),
    Scene(8.2, 12.2, screens["map"], "地圖點開看", "找附近、看分布、直接定位到景點。", q_map, (684, 1180), (280, 400), ["點開地圖", "附近景點一眼看懂"], ["附近景點", "地圖範圍", "Q寶水滴"], 0.38, 1.02),
    Scene(12.2, 16.1, screens["detail"], "不是只有景點名稱", "照片、標籤、停留時間，爸媽要看的先放前面。", q_camera, (640, 1190), (280, 400), ["出門前", "先看適齡與設施"], ["停車", "育嬰室", "雨天"], 0.55),
    Scene(16.1, 20.1, screens["rescue"], "尿布奶粉臨時缺？", "母嬰用品、藥局、急診救援點一起找。", q_running, (54, 1160), (275, 390), ["救援模式", "先找最近能補給的地方"], ["母嬰店", "藥局", "急診"], 0.48),
    Scene(20.1, 24.2, screens["qmom_chat"], "直接問 Q媽", "下雨帶 2 歲去哪？附近吃什麼？她會用資料幫你整理。", q_mom, (650, 1115), (300, 430), ["Q媽管家", "像朋友一樣幫你想"], ["免費", "政府/開放資料", "可追問"], 0.48),
]


def draw_scene(frame_i: int) -> Image.Image:
    sec = frame_i / FPS
    img = make_bg(frame_i)
    d = ImageDraw.Draw(img)

    scene = next((s for s in SCENES if s.start <= sec < s.end), None)
    if scene is None:
        return draw_cta(frame_i, sec)

    p = scene.progress(sec)
    brand_header(img, 0.9)

    phone_y = 265
    phone_h = 1180
    phone_w = 496
    phone_x = 532
    phone_frame(img, scene.screen, (phone_x, phone_y, phone_w, phone_h), p, zoom=scene.zoom, pan_y=scene.pan_y)

    # kinetic headline
    title_y = 255 + int(24 * (1 - ease_out(p)))
    d.text((72, title_y), scene.title, font=F_TITLE, fill=TEXT)
    draw_text_box(d, (76, title_y + 98), scene.subtitle, F_BODY, fill=MUTED, max_width=390, spacing=12)

    sticker(img, scene.mascot, scene.mascot_xy, scene.mascot_size, p, bounce=10, rotate=math.sin(sec * 2.2) * 2.2)
    bubble(img, (72, 780), scene.bubble_lines, p, color=WHITE, width=430)

    chip_y = 960
    for idx, label in enumerate(scene.chips):
        chip(img, (76, chip_y + idx * 74), label, [PRIMARY, GREEN, BLUE][idx % 3], clamp((p - idx * 0.12) / 0.55))

    # simulated tap pulse for map/QMom scenes
    if scene.title.startswith("地圖") or "Q媽" in scene.title:
        pulse_t = (sec * 1.7) % 1
        r = int(24 + 55 * ease_out(pulse_t))
        cx, cy = (770, 960) if scene.title.startswith("地圖") else (850, 1235)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=PRIMARY + (int(180 * (1 - pulse_t)),), width=7)
        d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill=PRIMARY + (230,))

    progress_bar(img, sec)
    return img.convert("RGB")


def progress_bar(img: Image.Image, sec: float) -> None:
    d = ImageDraw.Draw(img)
    x, y, w, h = 76, 1808, 928, 8
    d.rounded_rectangle((x, y, x + w, y + h), radius=4, fill=(230, 219, 205, 210))
    d.rounded_rectangle((x, y, x + int(w * clamp(sec / SECONDS)), y + h), radius=4, fill=PRIMARY + (255,))


def draw_cta(frame_i: int, sec: float) -> Image.Image:
    p = clamp((sec - 24.2) / (SECONDS - 24.2))
    img = make_bg(frame_i)
    d = ImageDraw.Draw(img)
    brand_header(img, 0.95)

    sticker(img, q_family, (185, 240), (720, 450), pop(p), bounce=5)

    d.text((80, 760), "這個週末，", font=F_MEGA, fill=TEXT)
    d.text((80, 875), "讓 Q胖陪你出門。", font=F_MEGA, fill=PRIMARY_DARK)
    draw_text_box(d, (84, 1040), "親子景點、餐廳、雨天備案、臨時補給，一張地圖一起看。", F_BODY, fill=MUTED, max_width=820, spacing=14)

    qr_box = Image.new("RGBA", (360, 360), WHITE + (255,))
    qr_box = rounded_image(qr_box, 44)
    paste_with_opacity(img, soft_shadow((360, 360), 44, 58, 22), (82, 1222), p)
    paste_with_opacity(img, qr_box, (72, 1210), p)
    paste_with_opacity(img, rounded_image(contain(qr, (300, 300)), 24), (102, 1240), p)

    d.rounded_rectangle((470, 1250, 980, 1374), radius=44, fill=PRIMARY + (255,))
    d.text((725, 1296), "掃 QR 立刻打開", font=F_BODY_BOLD, fill=WHITE, anchor="mm")
    d.text((725, 1346), "donald5043.github.io/...", font=F_SMALL_BOLD, fill=WHITE, anchor="mm")
    d.text((475, 1450), "收藏起來，下次出門不用再重找。", font=F_BODY, fill=TEXT)
    progress_bar(img, sec)
    return img.convert("RGB")


def render_cover() -> None:
    frame = draw_scene(int(FPS * 1.6))
    frame.save(COVER, quality=94)


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
    for i in range(TOTAL_FRAMES):
        proc.stdin.write(draw_scene(i).tobytes())
    proc.stdin.close()
    code = proc.wait()
    if code != 0:
        raise SystemExit(code)
    render_cover()
    print(OUT)
    print(COVER)


if __name__ == "__main__":
    main()
