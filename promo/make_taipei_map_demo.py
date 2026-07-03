from __future__ import annotations

import math
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "promo" / "assets" / "live-screens" / "03-real-map-expanded.png"
W, H = 375, 811
TILE = 256
ZOOM = 13
CENTER = (25.0478, 121.5170)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/msjhbd.ttc") if bold else Path("C:/Windows/Fonts/msjh.ttc"),
        Path("C:/Windows/Fonts/NotoSansCJKtc-Bold.otf") if bold else Path("C:/Windows/Fonts/NotoSansCJKtc-Regular.otf"),
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default(size=size)


def latlon_to_pixel(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    siny = math.sin(math.radians(lat))
    siny = min(max(siny, -0.9999), 0.9999)
    scale = TILE * (2 ** zoom)
    x = scale * (0.5 + lon / 360.0)
    y = scale * (0.5 - math.log((1 + siny) / (1 - siny)) / (4 * math.pi))
    return x, y


def fetch_tile(x: int, y: int, zoom: int) -> Image.Image:
    url = f"https://a.basemaps.cartocdn.com/rastertiles/voyager/{zoom}/{x}/{y}.png"
    req = Request(url, headers={"User-Agent": "HolidayGoWhere promo renderer"})
    with urlopen(req, timeout=20) as resp:
        return Image.open(BytesIO(resp.read())).convert("RGBA")


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def text_pill(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, fill: tuple[int, int, int, int], fg: tuple[int, int, int], size = 12, bold = True) -> tuple[int, int]:
    f = font(size, bold)
    bbox = draw.textbbox((0, 0), label, font=f)
    width = bbox[2] - bbox[0] + 24
    height = 34
    draw.rounded_rectangle((x, y, x + width, y + height), radius=17, fill=fill)
    draw.text((x + 12, y + 8), label, font=f, fill=fg)
    return width, height


def make_map(width: int, height: int) -> tuple[Image.Image, int, int]:
    center_x, center_y = latlon_to_pixel(*CENTER, ZOOM)
    left = int(center_x - width / 2)
    top = int(center_y - height / 2)
    canvas = Image.new("RGBA", (width, height), (229, 238, 232, 255))
    for tx in range(left // TILE, (left + width) // TILE + 2):
        for ty in range(top // TILE, (top + height) // TILE + 2):
            try:
                tile = fetch_tile(tx, ty, ZOOM)
            except Exception:
                tile = Image.new("RGBA", (TILE, TILE), (229, 238, 232, 255))
            canvas.alpha_composite(tile, (tx * TILE - left, ty * TILE - top))

    warm = Image.new("RGBA", canvas.size, (255, 246, 232, 255))
    canvas = Image.blend(canvas, warm, 0.10)
    return canvas, left, top


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    screen = Image.new("RGBA", (W, H), (248, 244, 236, 255))
    draw = ImageDraw.Draw(screen)

    # App header
    draw.rectangle((0, 0, W, 58), fill=(255, 252, 247, 248))
    icon = Image.open(ROOT / "public" / "brand" / "q-pang-app-icon-64.png").convert("RGBA")
    icon = icon.resize((38, 38), Image.Resampling.LANCZOS)
    screen.alpha_composite(icon, (18, 10))
    draw.text((64, 12), "HolidayGoWhere", font=font(15, True), fill=(184, 90, 71))
    draw.text((64, 33), "帶孩子，去更好的地方", font=font(11), fill=(96, 115, 110))

    card_x, card_y, card_w, card_h = 16, 76, 343, 690
    shadow = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((0, 0, card_w, card_h), radius=25, fill=(30, 40, 35, 46))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    screen.alpha_composite(shadow, (card_x, card_y + 8))

    map_img, left, top = make_map(card_w, card_h)
    mask = rounded_mask((card_w, card_h), 25)
    map_img.putalpha(mask)
    screen.alpha_composite(map_img, (card_x, card_y))
    draw = ImageDraw.Draw(screen)

    def point(lat: float, lon: float) -> tuple[int, int]:
        px, py = latlon_to_pixel(lat, lon, ZOOM)
        return card_x + int(px - left), card_y + int(py - top)

    # Controls
    text_pill(draw, 32, 92, "台北定位", (255, 252, 247, 238), (36, 59, 55), 12, True)
    text_pill(draw, 254, 92, "完成", (36, 59, 55, 238), (255, 255, 255), 12, True)
    text_pill(draw, 32, 706, "◎ 定位", (255, 252, 247, 238), (36, 59, 55), 12, True)
    text_pill(draw, 230, 706, "↗ 放大地圖", (255, 252, 247, 238), (36, 59, 55), 12, True)

    # User location
    user_x, user_y = point(*CENTER)
    draw.ellipse((user_x - 17, user_y - 17, user_x + 17, user_y + 17), fill=(66, 142, 245, 68))
    draw.ellipse((user_x - 8, user_y - 8, user_x + 8, user_y + 8), fill=(45, 132, 245), outline=(255, 255, 255), width=3)

    head = Image.open(ROOT / "public" / "brand" / "q-pang-marker-head.png").convert("RGBA")
    head.thumbnail((34, 34), Image.Resampling.LANCZOS)

    def marker(lat: float, lon: float, color: tuple[int, int, int]) -> None:
        x, y = point(lat, lon)
        drop = Image.new("RGBA", (56, 68), (0, 0, 0, 0))
        d = ImageDraw.Draw(drop)
        d.ellipse((5, 2, 51, 48), fill=color + (255,), outline=(255, 255, 255, 255), width=4)
        d.polygon([(19, 39), (37, 39), (28, 64)], fill=color + (255,))
        d.ellipse((11, 8, 45, 42), fill=(255, 244, 224, 255))
        drop.alpha_composite(head, ((56 - head.width) // 2, 8))
        shadow = Image.new("RGBA", drop.size, (0, 0, 0, 0))
        shadow.putalpha(drop.getchannel("A").filter(ImageFilter.GaussianBlur(3)))
        screen.alpha_composite(shadow, (x - 28, y - 48 + 5))
        screen.alpha_composite(drop, (x - 28, y - 48))

    spots = [
        (25.0340, 121.5645, (217, 119, 95)),   # 信義/大安
        (25.0438, 121.5295, (120, 155, 141)),  # 華山
        (25.0730, 121.5240, (116, 197, 244)),  # 圓山
        (25.0911, 121.5598, (251, 178, 83)),   # 內湖
        (25.1167, 121.5169, (120, 155, 141)),  # 北投
        (25.0148, 121.5329, (217, 119, 95)),   # 文山
        (25.0478, 121.5170, (116, 197, 244)),  # 台北車站
        (25.0130, 121.4630, (251, 178, 83)),   # 板橋
    ]
    for item in spots:
        marker(*item)

    # Place info card
    panel = Image.new("RGBA", (232, 118), (255, 252, 247, 242))
    panel.putalpha(rounded_mask(panel.size, 22))
    screen.alpha_composite(panel, (72, 146))
    draw = ImageDraw.Draw(screen)
    draw.text((94, 164), "台北市親子熱點", font=font(17, True), fill=(36, 59, 55))
    draw.text((94, 192), "大安・中正・信義", font=font(12), fill=(96, 115, 110))
    text_pill(draw, 94, 216, "景點", (255, 231, 213, 255), (217, 119, 95), 11, True)
    text_pill(draw, 170, 216, "附近", (225, 244, 236, 255), (68, 125, 102), 11, True)

    draw.rounded_rectangle((82, 655, 293, 704), radius=25, fill=(255, 111, 48, 245))
    draw.text((187, 680), "搜尋台北附近・128 筆", font=font(14, True), fill=(255, 255, 255), anchor="mm")
    draw.text((210, 752), "© OpenStreetMap contributors", font=font(7), fill=(90, 98, 95))

    screen.convert("RGB").save(OUT, quality=95)
    print(OUT)


if __name__ == "__main__":
    main()
