#!/usr/bin/env python3
"""
تولید آیکون‌های EasyShop (icon-192 / icon-512) بدون هیچ وابستگی بیرونی.

اجرا:  python3 tools/render_icons.py
خروجی: web/public/icon-192.png و web/public/icon-512.png

روش: رَستری‌سازی با فاصله‌ی علامت‌دار (SDF) و پوشش تحلیلی (antialias) —
نتیجه در هر اندازه لبه‌های نرم دارد و از stdlib استفاده می‌کند.
"""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "public")

C1 = (0x63, 0x66, 0xF1)  # indigo
C2 = (0xA8, 0x55, 0xF7)  # purple
YELLOW = (0xFF, 0xE0, 0x66)
WHITE = (255, 255, 255)


def seg_dist(u, v, p0, p1):
    """فاصله نقطه از پاره‌خط (برای کپسول)."""
    px, py = p0
    qx, qy = p1
    vx, vy = qx - px, qy - py
    length = vx * vx + vy * vy
    t = max(0.0, min(1.0, ((u - px) * vx + (v - py) * vy) / length)) if length else 0.0
    dx = u - (px + t * vx)
    dy = v - (py + t * vy)
    return (dx * dx + dy * dy) ** 0.5


def disc_dist(u, v, cx, cy):
    return ((u - cx) ** 2 + (v - cy) ** 2) ** 0.5


def capsule_sdf(u, v, p0, p1, rad):
    return seg_dist(u, v, p0, p1) - rad


def disc_sdf(u, v, cx, cy, rad):
    return disc_dist(u, v, cx, cy) - rad


def coverage(d, aa):
    """پوشش از فاصله‌ی علامت‌دار: داخل=۱، بیرون=۰، لبه نرم."""
    return min(1.0, max(0.0, 0.5 - d * aa))


CART = (
    ((13.5, 19.0), (19.0, 19.0), 2.0),
    ((19.0, 19.0), (23.6, 39.6), 2.0),
    ((23.6, 39.6), (42.4, 39.6), 2.0),
    ((42.4, 39.6), (46.0, 26.6), 2.0),
)
CART_DOTS = ((28.0, 46.6, 3.1), (41.0, 46.6, 3.1))
# درخشش چهارپر (نشان هوش مصنوعی) — ابربیضی با نمای کوچک‌تر از ۱
SPARKLE = (37.4, 12.6, 5.3, 5.3, 0.62)


def sparkle_sdf(u, v, cx, cy, a, b, power):
    """تخمین فاصله‌ی علامت‌دار برای ابربیضی ستاره‌ای (چهارپر مقعر)."""
    x = max(abs(u - cx), 1e-4) / a
    y = max(abs(v - cy), 1e-4) / b
    f = x ** power + y ** power - 1.0
    gx = power * x ** (power - 1) / a
    gy = power * y ** (power - 1) / b
    grad = (gx * gx + gy * gy) ** 0.5
    return f / max(grad, 1e-6)


def sample(u, v, aa):
    """نمونه‌گیری پیش‌ضرب‌شده: (pr, pg, pb, pa) در بازه ۰..۱."""
    # پس‌زمینه: مستطیل گرد با شعاع ۱۵
    r = 15.0
    dx = abs(u - 32.0) - (32.0 - r)
    dy = abs(v - 32.0) - (32.0 - r)
    mx, my = max(dx, 0.0), max(dy, 0.0)
    bg_d = (mx * mx + my * my) ** 0.5 + min(max(dx, dy), 0.0) - r
    bg_cov = coverage(bg_d, aa)
    if bg_cov <= 0:
        return (0.0, 0.0, 0.0, 0.0)

    t = min(1.0, max(0.0, (u + v) / 128.0))
    bg = tuple((C1[i] / 255.0) * (1 - t) + (C2[i] / 255.0) * t for i in range(3))

    # سبد خرید
    cart_cov = 0.0
    for p0, p1, rad in CART:
        cart_cov = max(cart_cov, coverage(capsule_sdf(u, v, p0, p1, rad), aa))
    for cx, cy, rad in CART_DOTS:
        cart_cov = max(cart_cov, coverage(disc_sdf(u, v, cx, cy, rad), aa))
    cart_cov *= bg_cov

    # ستاره درخشان
    spark_cov = coverage(sparkle_sdf(u, v, *SPARKLE), aa) * bg_cov * (1 - cart_cov)

    # ترکیب از پایین به بالا (پیش‌ضرب‌شده)
    pr, pg, pb = (bg[i] * bg_cov for i in range(3))
    pa = bg_cov
    for cov, color in ((cart_cov, WHITE), (spark_cov, YELLOW)):
        if cov <= 0:
            continue
        cr, cg, cb = (color[i] / 255.0 for i in range(3))
        pr = cr * cov + pr * (1 - cov)
        pg = cg * cov + pg * (1 - cov)
        pb = cb * cov + pb * (1 - cov)
        pa = cov + pa * (1 - cov)
    return (pr, pg, pb, pa)


def render(size, ss=2):
    step = 64.0 / (size * ss)
    aa = 1.0 / step  # نمونه در واحد viewBox
    rows = []
    samples = ss * ss
    for y in range(size):
        row = bytearray((0,))  # filter type 0
        for x in range(size):
            sr = sg = sb = sa = 0.0
            for sy in range(ss):
                v = (y * ss + sy + 0.5) * step
                for sx in range(ss):
                    u = (x * ss + sx + 0.5) * step
                    r, g, b, a = sample(u, v, aa)
                    sr += r
                    sg += g
                    sb += b
                    sa += a
            alpha = sa / samples
            if alpha > 0.0001:
                rgb = (sr / sa, sg / sa, sb / sa)
            else:
                rgb = (0.0, 0.0, 0.0)
            row += bytes(
                (
                    int(round(min(1.0, max(0.0, rgb[0])) * 255)),
                    int(round(min(1.0, max(0.0, rgb[1])) * 255)),
                    int(round(min(1.0, max(0.0, rgb[2])) * 255)),
                    int(round(min(1.0, max(0.0, alpha)) * 255)),
                )
            )
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, width, height, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (192, 512):
        raw = render(size, ss=2)
        target = os.path.join(OUT_DIR, f"icon-{size}.png")
        write_png(target, size, size, raw)
        print(f"✓ {target} ({os.path.getsize(target)} bytes)")


if __name__ == "__main__":
    main()
