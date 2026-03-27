from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "store"
OUT_PATH = OUT_DIR / "play_feature_graphic.png"

CANVAS_W = 1024
CANVAS_H = 500


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates.extend(
            [
                Path(r"C:\Windows\Fonts\malgunbd.ttf"),
                Path(r"C:\Windows\Fonts\arialbd.ttf"),
            ]
        )
    candidates.extend(
        [
            Path(r"C:\Windows\Fonts\malgun.ttf"),
            Path(r"C:\Windows\Fonts\arial.ttf"),
        ]
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def cover_crop(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    resized = img.resize((int(src_w * scale), int(src_h * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def add_phone_card(
    base: Image.Image,
    screenshot_path: Path,
    box: tuple[int, int, int, int],
    title: str,
    accent: str,
) -> None:
    x, y, w, h = box
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (x + 10, y + 14, x + w + 10, y + h + 14),
        radius=34,
        fill=(0, 0, 0, 120),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(shadow)

    panel = Image.new("RGBA", (w, h), (22, 26, 37, 255))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=34, fill=(22, 26, 37, 245))
    panel_draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=34, outline=(255, 255, 255, 36), width=2)

    inner_margin = 14
    header_h = 44
    shot_h = h - header_h - inner_margin * 2
    shot_w = w - inner_margin * 2
    screenshot = Image.open(screenshot_path).convert("RGBA")
    screenshot = cover_crop(screenshot, (shot_w, shot_h))
    screen_mask = rounded_mask((shot_w, shot_h), 22)
    panel.paste(screenshot, (inner_margin, header_h), screen_mask)

    header = ImageDraw.Draw(panel)
    header_font = load_font(20, bold=True)
    dot_y = 20
    header.ellipse((18, dot_y, 28, dot_y + 10), fill=ImageColor.getrgb(accent))
    header.text((38, 11), title, font=header_font, fill=(242, 245, 250, 255))

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle((2, 2, w - 3, h - 3), radius=34, outline=ImageColor.getrgb(accent) + (120,), width=3)
    glow = glow.filter(ImageFilter.GaussianBlur(8))
    panel = Image.alpha_composite(glow, panel)

    base.alpha_composite(panel, (x, y))


def draw_background(canvas: Image.Image) -> None:
    pixels = canvas.load()
    for y in range(CANVAS_H):
        t = y / max(CANVAS_H - 1, 1)
        top = (11, 12, 24)
        bottom = (24, 13, 41)
        row = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(CANVAS_W):
            pixels[x, y] = row + (255,)

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.ellipse((-140, -120, 360, 320), fill=(255, 77, 166, 90))
    draw.ellipse((580, -100, 1120, 340), fill=(0, 212, 255, 78))
    draw.ellipse((640, 250, 1120, 650), fill=(255, 170, 0, 55))
    overlay = overlay.filter(ImageFilter.GaussianBlur(55))
    canvas.alpha_composite(overlay)

    grid = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid)
    for x in range(-60, CANVAS_W + 80, 64):
        grid_draw.line((x, 0, x + 140, CANVAS_H), fill=(255, 255, 255, 16), width=1)
    for y in range(40, CANVAS_H, 56):
        grid_draw.line((0, y, CANVAS_W, y), fill=(255, 255, 255, 10), width=1)
    grid = grid.filter(ImageFilter.GaussianBlur(0.6))
    canvas.alpha_composite(grid)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 255))
    draw_background(canvas)

    hero_panel = Image.new("RGBA", (332, 332), (255, 255, 255, 12))
    hero_draw = ImageDraw.Draw(hero_panel)
    hero_draw.rounded_rectangle((0, 0, 331, 331), radius=58, fill=(255, 255, 255, 16), outline=(255, 255, 255, 36), width=2)

    random_visual = Image.open(ROOT / "assets" / "background" / "random.png").convert("RGBA")
    random_visual = cover_crop(random_visual, (260, 260))
    random_mask = rounded_mask((260, 260), 44)
    hero_panel.paste(random_visual, (36, 54), random_mask)

    visual_shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(visual_shadow).rounded_rectangle((34, 88, 366, 420), radius=58, fill=(0, 0, 0, 120))
    visual_shadow = visual_shadow.filter(ImageFilter.GaussianBlur(26))
    canvas.alpha_composite(visual_shadow)
    canvas.alpha_composite(hero_panel, (34, 88))

    left_draw = ImageDraw.Draw(canvas)
    badge_font = load_font(18, bold=True)
    title_font = load_font(48, bold=True)
    body_font = load_font(22, bold=False)

    left_draw.rounded_rectangle((56, 42, 202, 78), radius=18, fill=(255, 255, 255, 28))
    left_draw.text((78, 49), "오늘 뭐 먹지?", font=badge_font, fill=(255, 221, 87, 255))
    left_draw.text((390, 88), "메추", font=title_font, fill=(250, 250, 252, 255))
    left_draw.text((390, 148), "룰렛으로 고르고\n주변 맛집 찾는 앱", font=title_font, fill=(250, 250, 252, 255), spacing=6)

    body = "메뉴 고민은 줄이고,\n오늘의 한 끼는 더 빠르게."
    left_draw.multiline_text((392, 280), body, font=body_font, fill=(218, 224, 236, 255), spacing=8)

    chip_font = load_font(18, bold=True)
    chips = [
        ("룰렛 추천", "#ff4da6"),
        ("주변 검색", "#00d4ff"),
        ("무드 추천", "#ffb703"),
    ]
    chip_x = 390
    for label, color in chips:
        bbox = left_draw.textbbox((0, 0), label, font=chip_font)
        width = bbox[2] - bbox[0] + 28
        left_draw.rounded_rectangle((chip_x, 355, chip_x + width, 393), radius=19, fill=ImageColor.getrgb(color) + (230,))
        left_draw.text((chip_x + 14, 363), label, font=chip_font, fill=(17, 19, 25, 255))
        chip_x += width + 12

    add_phone_card(
        canvas,
        ROOT / "assets" / "screenshots" / "search.png",
        (814, 28, 100, 228),
        "룰렛",
        "#ff4da6",
    )
    add_phone_card(
        canvas,
        ROOT / "assets" / "screenshots" / "nearby.png",
        (744, 266, 96, 182),
        "주변 검색",
        "#00d4ff",
    )
    add_phone_card(
        canvas,
        ROOT / "assets" / "screenshots" / "result.png",
        (884, 286, 92, 166),
        "무드 추천",
        "#ffb703",
    )

    footer_font = load_font(16)
    footer_text = "Food roulette · Nearby restaurants · Mood-based picks"
    left_draw.text((390, 430), footer_text, font=footer_font, fill=(175, 183, 197, 255))

    canvas.convert("RGB").save(OUT_PATH, quality=95)
    print(f"saved: {OUT_PATH}")


if __name__ == "__main__":
    main()
