#!/usr/bin/env python3
"""
Cozy Cat Cafe x HexaSort — sprite sheet generator (Warm Vintage Cafe)
Art direction: STYLE_GUIDE.md. Logic/art decoupling (G7): outputs sprites.png + sprites.json.
Draws each figure programmatically with the exact palette tokens and chocolate outline.
"""
import os, json, math
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Palette (tokens from STYLE_GUIDE.md)
# ---------------------------------------------------------------------------
INK      = (121, 72, 53)      # --ink      chocolate
INK_SOFT = (160, 110, 82)     # --ink-soft
PANEL    = (248, 241, 213)    # --panel    cream
WOOD     = (182, 148, 124)    # --wood     warm latte
WOOD_D   = (154, 122, 99)     # --wood-dark
ACCENT   = (246, 167, 193)    # --accent   blush pink
ACCENT2  = (255, 178, 193)    # --accent-2 soft pink
HIGHLIGHT= (255, 245, 178)    # --highlight yellow pale
DANGER   = (201, 106, 90)     # --danger
LOCK     = (160, 146, 138)    # --lock
REVFUR   = (248, 241, 213)    # fur cream (panel)
T_MINT   = (168, 225, 212)
T_BLUE   = (178, 215, 255)
T_PINK   = (255, 178, 193)
T_BLUSH  = (246, 167, 193)
T_LAV    = (229, 196, 232)
T_CREAM  = (248, 241, 213)

# Fur tones (no pure white / no pure black)
FUR_CARAMEL = (199, 143, 100)   # caramel
FUR_CREAM   = (240, 222, 190)   # cream
FUR_GREY    = (183, 158, 140)   # gris-cafe

OUT_W = 8   # outline width in 512-space (= 2px at 128 display)

# ---------------------------------------------------------------------------
# Anti-aliased canvas: draw each cell at 4x then downscale
# ---------------------------------------------------------------------------
SCALE = 4
CELL  = 128

class Cell:
    """512x512 draw canvas representing one 128px sprite cell."""
    def __init__(self):
        self.S = CELL * SCALE  # 512
        self.img = Image.new("RGBA", (self.S, self.S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
    def crop(self):
        # tighten to content bbox then re-pad to square within cell
        return self.img

def rrect(d, box, r, fill, outline=INK, width=OUT_W):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def ellipse(d, box, fill, outline=INK, width=OUT_W):
    d.ellipse(box, fill=fill, outline=outline, width=width)

def poly(d, pts, fill, outline=INK, width=OUT_W):
    d.polygon(pts, fill=fill, outline=outline, width=width)

def hexagon(cx, cy, r):
    pts = []
    for i in range(6):
        a = math.radians(60 * i - 30)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def hex_tile(d, cx, cy, r, color, outline=INK, width=OUT_W):
    poly(d, hexagon(cx, cy, r), color, outline, width)

def stroke(d, pts, fill, width, joint="curve"):
    d.line(pts, fill=fill, width=width, joint=joint)

# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------
def cat(c, cx, cy, s, fur, spot=None, blush=True):
    """Generic sitting cat. cx,cy = bottom center of body. s = unit scale."""
    d = c.d
    def P(v):  # multiply by s
        return int(v * s)
    body_w = P(190); body_h = P(150)
    # tail (curled hook behind right side)
    tail = [(cx - body_w*0.62, cy - P(20)),
            (cx - body_w*0.78, cy - P(75)),
            (cx - body_w*0.62, cy - P(120)),
            (cx - body_w*0.35, cy - P(128))]
    stroke(d, [(t[0]+3, t[1]) for t in tail], INK, P(34))           # outline under
    stroke(d, [t for t in tail], fur, P(24))                        # fur over
    # tip of tail
    ellipse(d, (tail[-1][0]-P(20), tail[-1][1]-P(20), tail[-1][0]+P(20), tail[-1][1]+P(20)), fur)

    # body (rounded)
    bx0 = cx - body_w/2; by1 = cy; by0 = cy - body_h
    rrect(d, (bx0, by0, bx0+body_w, by1), P(60), fur)
    if spot:
        ellipse(d, (bx0+body_w*0.20, by0+body_h*0.15, bx0+body_w*0.62, by0+body_h*0.55), spot)
    # front paws at bottom
    for side in (-1, 1):
        px = cx + side*body_w*0.22
        ellipse(d, (px-P(26), cy-P(26), px+P(26), cy+P(10)), fur)
        # toe lines
        d.line([(px-P(14), cy-P(6)), (px-P(6), cy-P(14))], fill=INK, width=3)
        d.line([(px+P(14), cy-P(6)), (px+P(6), cy-P(14))], fill=INK, width=3)

    # head
    hr = P(92)
    hy0 = by0 - hr*0.55  # head top overlaps body top
    head_c = (cx, hy0)
    # ears
    for side in (-1, 1):
        ex = cx + side*hr*0.62
        ear = [(ex - side*P(46), hy0-hr*0.55),
               (ex, hy0 - hr*1.15),
               (ex + side*P(46), hy0-hr*0.55)]
        poly(d, ear, fur)
        inner = [(ex - side*P(26), hy0-hr*0.62),
                 (ex, hy0 - hr*0.95),
                 (ex + side*P(26), hy0-hr*0.62)]
        poly(d, inner, ACCENT2)
    # head circle
    ellipse(d, (head_c[0]-hr, head_c[1]-hr*0.85, head_c[0]+hr, head_c[1]+hr*0.85), fur)
    # eyes (button)
    for side in (-1, 1):
        ex = cx + side*hr*0.34
        ellipse(d, (ex-P(15), hy0-hr*0.10-P(15), ex+P(15), hy0-hr*0.10+P(15)), INK)
    # nose
    nx, ny = cx, hy0 + hr*0.12
    poly(d, [(nx, ny-hr*0.06), (nx-hr*0.10, ny+hr*0.06), (nx+hr*0.10, ny+hr*0.06)], INK)
    # mouth
    stroke(d, [(nx-hr*0.05, ny+hr*0.05), (nx, ny+hr*0.12), (nx+hr*0.05, ny+hr*0.05)], INK, 3)
    # whiskers
    for side in (-1, 1):
        for dy in (0, 1):
            y = hy0 + hr*0.15 + dy*hr*0.08
            stroke(d, [(cx+side*hr*0.42, y), (cx+side*hr*0.95, y+dy*hr*0.05)], INK, 3)
    if blush:
        for side in (-1, 1):
            ex = cx + side*hr*0.60
            ellipse(d, (ex-P(16), hy0+hr*0.20-P(11), ex+P(16), hy0+hr*0.20+P(11)), (246,167,193,120))

def cat_worker(c, cx, cy, s, fur):
    """Barista cat: apron with double vintage line + hat + tray with 3 hexes."""
    d = c.d
    P = lambda v: int(v*s)
    cat(c, cx, cy-P(60), s, fur, blush=True)
    hy_off = P(60)
    # apron (bib) over belly
    ax0 = cx - P(80); ay0 = cy - P(60) - P(150) * 0.35
    rrect(d, (ax0, ay0, ax0+P(160), cy+ P(4)), P(34), PANEL, INK, OUT_W)
    # double vintage line
    d.line([(ax0+P(16), ay0+P(14)), (ax0+P(144), ay0+P(14))], fill=WOOD_D, width=3)
    d.line([(ax0+P(16), ay0+P(22)), (ax0+P(144), ay0+P(22))], fill=WOOD_D, width=3)
    # strap
    for side in (-1, 1):
        d.line([(cx+side*P(78), ay0+P(4)), (cx+side*P(60), cy-P(150)), ], fill=INK, width=OUT_W)
    # barista hat
    hx = cx - P(120)
    hy = cy - P(150) - P(160)
    poly(d, [(hx, hy+P(30)), (hx+P(240), hy+P(30)), (hx+P(120), hy-P(90))], PANEL, INK, OUT_W)
    d.line([(hx+P(16), hy+P(34)), (hx+P(224), hy+P(34))], fill=WOOD_D, width=3)
    ellipse(d, (hx+P(96), hy-P(96), hx+P(144), hy-P(76)), ACCENT)
    # tray with 3 hexes held at the side
    tx = cx - P(96); ty = cy - P(2)
    rrect(d, (tx-P(110), ty-P(18), tx+P(10), ty+P(18)), P(18), WOOD, INK, OUT_W)
    for i in range(3):
        hcol = [T_MINT, T_BLUE, T_PINK][i]
        cyy = ty - P(20) - P(30) - i*P(30)
        hex_tile(d, tx - P(50)+ i*P(24), cyy, P(24), hcol, INK, OUT_W)

def espresso(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    # body
    w = P(200); h = P(220)
    rrect(d, (cx-w/2, cy-h, cx+w/2, cy), P(30), WOOD_D, INK, OUT_W)
    # brass top panel
    rrect(d, (cx-w/2+P(14), cy-h+P(14), cx+w/2-P(14), cy-h*0.45), P(20), WOOD, INK, OUT_W)
    # pressure gauge + knobs
    ellipse(d, (cx-P(30), cy-h+P(30), cx+P(38), cy-h+P(98)), PANEL, INK, OUT_W)
    # steam wand + group head
    stroke(d, [(cx+w/2-P(34), cy-h*0.45), (cx+w/2-P(34), cy-h*0.28)], INK, P(16))
    # drip tray slot
    rrect(d, (cx-w/2+P(30), cy-h*0.22, cx+w/2-P(30), cy-h*0.08), P(12), WOOD, INK, 6)
    # steam puff
    for (px,py,r,col) in [(cx-P(70),cy-h+P(4),P(26),(255,245,178,90)),
                          (cx+P(20),cy-h+P(-6),P(30),(255,245,178,110))]:
        ellipse(d, (px-r,py-r,px+r,py+r), col)

def machine2(c, cx, cy, s):
    """Bar / register style machine (cafe vending style)."""
    d = c.d; P = lambda v: int(v*s)
    w = P(180); h = P(210)
    rrect(d, (cx-w/2, cy-h, cx+w/2, cy), P(26), WOOD, INK, OUT_W)
    # glass / cream front
    rrect(d, (cx-w/2+P(16), cy-h+P(16), cx+w/2-P(16), cy-h*0.55), P(14), PANEL, INK, OUT_W)
    # product window (rect colored)
    rrect(d, (cx-w/2+P(34), cy-h+P(40), cx-w/2+P(70), cy-h+P(110)), 6, T_MINT, INK, 6)
    rrect(d, (cx-w/2+P(84), cy-h+P(40), cx-w/2+P(120), cy-h+P(110)), 6, T_BLUSH, INK, 6)
    # buttons
    for i in range(4):
        ellipse(d, (cx-w/2+P(24)+i*P(36), cy-h*0.42, cx-w/2+P(24)+i*P(36)+P(18), cy-h*0.42+P(18)), ACCENT)
    # coin slot
    rrect(d, (cx-w/2+P(60), cy-h*0.30, cx-w/2+P(112), cy-h*0.30+P(26)), 10, WOOD_D, INK, OUT_W)
    # dispenser tray
    rrect(d, (cx-w/2+P(40), cy-h*0.06, cx+w/2-P(40), cy-h*0.06+P(30)), 10, WOOD_D, INK, OUT_W)

def table(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    # top
    w = P(230); t = P(26)
    rrect(d, (cx-w/2, cy-P(60)-t, cx+w/2, cy-P(60)), P(14), WOOD, INK, OUT_W)
    # legs
    for side in (-1,1):
        lx = cx + side*(w/2-P(26))
        stroke(d, [(lx, cy-P(60)), (lx, cy)], WOOD_D, P(22))
    # double vintage line on top + coffee order on top
    d.line([(cx-w/2+P(20), cy-P(60)+P(8)), (cx+w/2-P(20), cy-P(60)+P(8))], fill=WOOD_D, width=3)
    # mini cup + treat on table
    ellipse(d, (cx-P(16), cy-P(74), cx+P(16), cy-P(48)), PANEL, INK, OUT_W)

def shelf_plant(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    w = P(220)
    rrect(d, (cx-w/2, cy-P(40), cx+w/2, cy), P(12), WOOD, INK, OUT_W)             # shelf
    stroke(d, [(cx-w/2+P(14), cy-P(40)), (cx-w/2+P(14), cy-P(190))], WOOD, P(18)) # post
    # pot + plant
    px = cx - w/2 + P(46)
    rrect(d, (px-P(28), cy-P(40)-P(60), px+P(28), cy-P(40)), P(10), DANGER, INK, OUT_W)
    for (dx,dy,rr,col) in [(-P(10),-P(80),P(28),T_MINT),(P(6),-P(96),P(26),T_LAV),(P(24),-P(70),P(24),T_BLUE)]:
        ellipse(d, (px+dx-rr, cy-P(40)-P(60)+dy-rr, px+dx+rr, cy-P(40)-P(60)+dy+rr), col, INK, 5)
    stroke(d, [(px, cy-P(100)), (px, cy-P(40))], WOOD_D, P(8))
    # small cups hanging on right
    for i in range(2):
        cxx = cx + w/2 - P(30) - i*P(26)
        ellipse(d, (cxx-P(14), cy-P(34)-P(30)-i*P(4), cxx+P(14), cy-P(34)-P(30)-i*P(4)+P(38)), (255,178,193), INK, 5)

def cup(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    # saucer
    ellipse(d, (cx-P(95), cy-P(18), cx+P(95), cy+P(18)), WOOD, INK, OUT_W)
    # cup body (trapezoid-ish)
    rrect(d, (cx-P(58), cy-P(110), cx+P(58), cy-P(18)), P(16), PANEL, INK, OUT_W)
    # inner coffee
    ellipse(d, (cx-P(52), cy-P(110), cx+P(52), cy-P(64)), WOOD_D)
    ellipse(d, (cx-P(52), cy-P(108), cx+P(52), cy-P(66)), (101,73,56))
    # rim highlight
    ellipse(d, (cx-P(52), cy-P(108), cx+P(52), cy-P(90)), (255,245,178))
    # handle
    stroke(d, [(cx+P(52),cy-P(90)),(cx+P(96),cy-P(78)),(cx+P(96),cy-P(42)),(cx+P(50),cy-P(34))], WOOD, P(20))
    # steam
    for (dx,dy,r,col) in [( -P(12),-P(150),P(16),(255,245,178,120)),(P(16),-P(168),P(13),(255,245,178,100))]:
        ellipse(d, (cx+dx-r, cy-P(110)+dy-r, cx+dx+r, cy-P(110)+dy+r), col)
    # paw on cup
    for fx in (-1,1): ellipse(d, (cx+fx*P(22)-P(11), cy-P(60)-P(9), cx+fx*P(22)+P(11), cy-P(60)+P(9)), ACCENT)

def pastry(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    # plate
    ellipse(d, (cx-P(100), cy-P(16), cx+P(100), cy+P(16)), WOOD, INK, OUT_W)
    # croissant body (crescent made of 3 overlapping puffs)
    base = (cx, cy-P(96))
    ellipse(d, (base[0]-P(92), base[1]-P(60), base[0]+P(10), base[1]+P(56)), (206,148,92), INK, OUT_W)
    ellipse(d, (base[0]-P(10), base[1]-P(74), base[0]+P(92), base[1]+P(40)), (214,156,100), INK, OUT_W)
    ellipse(d, (base[0]-P(56), base[1]-P(10), base[0]+P(60), base[1]+P(48)), (196,138,88), INK, OUT_W)
    # ridge lines
    for i in range(3):
        stroke(d, [(cx-P(46)+i*P(30), cy-P(46)-i*P(6)), (cx-P(46)+i*P(52), cy-P(20)-i*P(4))], (150,96,60), 4)
    # cherry top
    ellipse(d, (cx+P(30), cy-P(96), cx+P(62), cy-P(64)), (201,106,90), INK, OUT_W)

def power_destroy(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    # bomb body
    r = P(78)
    ellipse(d, (cx-r, cy-P(10)-r, cx+r, cy-P(10)+r), DANGER, INK, OUT_W)
    d.line([(cx-P(40), cy-P(10)-r*0.6),(cx+P(40), cy-P(10)+r*0.5)], fill=HIGHLIGHT, width=6)
    # fuse
    stroke(d, [(cx, cy-P(10)-r), (cx+P(6), cy-P(10)-r-P(40)), (cx-P(10), cy-P(10)-r-P(66))], INK, P(12))
    # spark
    ellipse(d, (cx-P(16), cy-P(10)-r-P(96), cx+P(16), cy-P(10)-r-P(64)), HIGHLIGHT, INK, 6)

def power_swap(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    R = P(84)
    for ang, col in [(  30, T_BLUE), (210, T_BLUSH)]:
        a0 = math.radians(ang-18); a1 = math.radians(ang+18)
        # arrow head
        hx = cx + R*math.cos(math.radians(ang)); hy = cy + R*math.sin(math.radians(ang))
        # arc band
        pts = []
        for i in range(40):
            a = a0 + (a1-a0)*i/39
            pts.append((cx + R*math.cos(a), cy + R*math.sin(a)))
        stroke(d, pts, col, P(30))
        # arrowhead
        tx2 = cx + (R+P(34))*math.cos(math.radians(ang)); ty2 = cy + (R+P(34))*math.sin(math.radians(ang))
        stroke(d, [(hx,hy),(tx2,ty2)], INK, P(8))
        bh = P(24)
        hx2 = cx + (R+P(30))*math.cos(math.radians(ang)); hy2 = cy + (R+P(30))*math.sin(math.radians(ang))
        pa = ang+90
        for sgn in (-1,1):
            px = hx2 + sgn*bh*math.cos(math.radians(pa)); py = hy2 + sgn*bh*math.sin(math.radians(pa))
            poly(d, [(tx2,ty2),(px,py),(hx2,hy2)], INK)

def power_refresh(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    R = P(80)
    # arc
    for ang0, ang1, col in [(-30,120,T_MINT),(120,270,T_BLUE)]:
        pts=[]
        for i in range(40):
            a = math.radians(ang0+(ang1-ang0)*i/39)
            pts.append((cx + R*math.cos(a), cy + R*math.sin(a)))
        stroke(d, pts, col, P(26))
    # arrowhead at end
    ang = math.radians(120)
    hx = cx + (R+P(8))*math.cos(ang); hy = cy + (R+P(8))*math.sin(ang)
    pa = ang+90; bh=P(24)
    for sgn in (-1,1):
        px = hx + sgn*bh*math.cos(pa); py = hy + sgn*bh*math.sin(pa)
        poly(d, [(hx,hy),(px,py),(hx+P(30)*math.cos(ang), hy+P(30)*math.sin(ang))], T_MINT)
    # center dot
    ellipse(d, (cx-P(18), cy-P(18), cx+P(18), cy+P(18)), INK)

def lock(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    LOCKF = LOCK
    # body
    w = P(150); h = P(120)
    rrect(d, (cx-w/2, cy-h, cx+w/2, cy), P(22), LOCKF, INK, OUT_W)
    # shackle
    stroke(d, [(cx-w/2+P(34), cy-h), (cx-w/2+P(34), cy-h-P(70)), (cx+w/2-P(34), cy-h-P(70)), (cx+w/2-P(34), cy-h-P(4))], LOCKF, P(24))
    # keyhole
    ellipse(d, (cx-P(12), cy-h+P(48)-P(14), cx+P(12), cy-h+P(48)+P(14)), INK)
    stroke(d, [(cx, cy-h+P(50)), (cx, cy-h+P(78))], INK, 8)
    # danger notch for calamity
    poly(d, [(cx-w/2-P(8), cy-h-P(78)), (cx-w/2+P(16), cy-h-P(78)), (cx-w/2+P(4), cy-h-P(104))], DANGER, INK, 6)

def coin(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    r = P(86)
    # rim + inner
    ellipse(d, (cx-r, cy-r, cx+r, cy+r), HIGHLIGHT, INK, OUT_W)
    ellipse(d, (cx-r+P(18), cy-r+P(18), cx+r-P(18), cy+r-P(18)), (255,239,150), INK, 6)
    # "$" style whisker / paw? use a paw on coin
    for f in (-1,1):
        ellipse(d, (cx+f*P(28)-P(12), cy-P(14)-P(10), cx+f*P(28)+P(12), cy-P(14)+P(10)), INK, INK, 0)
        ellipse(d, (cx+f*P(30)-P(9), cy+P(26)-P(9), cx+f*P(30)+P(9), cy+P(26)+P(9)), INK, INK, 0)
    ellipse(d, (cx-P(10), cy+P(8)-P(12), cx+P(10), cy+P(8)+P(12)), INK)
    # shine
    stroke(d, [(cx-r+P(30), cy-r+P(26)), (cx-r+P(52), cy-r+P(44))], (255,255,255,150), 8)

def heart(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    def H(px,py,sc,col):
        # classic heart via two circles + triangle polygon
        r = P(34)*sc
        ellipse(d, (px-r+P(2),py-r+P(10),px+r+P(2),py+r+P(10)), col, INK, OUT_W)
        ellipse(d, (px-r-P(2),py-r+P(10),px+r-P(2),py+r+P(10)), col, INK, OUT_W)
        poly(d, [(px-P(2),py-P(2)),(px-P(2),py-P(2)),(px-2*r,py+P(6)),(px+2*r,py+P(6))], col, INK, OUT_W)
    # simpler: draw heart as polygon+2 circles manually
    cx0, cy0 = cx, cy+P(6)
    r = P(40)
    d.ellipse((cx0-r, cy0-r, cx0, cy0+r), fill=ACCENT2, outline=INK, width=OUT_W)
    d.ellipse((cx0, cy0-r, cx0+r, cy0+r), fill=ACCENT2, outline=INK, width=OUT_W)
    d.polygon([(cx0-r, cy0+P(2)), (cx0, cy0+P(P(46))), (cx0+r, cy0+P(2))], fill=ACCENT2, outline=INK)
    d.line([(cx0-r, cy0+P(2)), (cx0, cy0+P(46)), (cx0+r, cy0+P(2))], fill=INK, width=OUT_W)
    # highlight
    d.ellipse((cx0-P(20), cy0-P(24), cx0-P(4), cy0-P(8)), fill=(255,220,230), outline=None)

def paw(c, cx, cy, s):
    d = c.d; P = lambda v: int(v*s)
    base = P(58)
    # main pad
    d.ellipse((cx-base, cy-base*0.6, cx+base, cy+base), fill=ACCENT2, outline=INK, width=OUT_W)
    # toes
    for i,ang in enumerate([-50,-18,18,50]):
        a = math.radians(ang)
        tx = cx + P(86)*math.cos(a); ty = cy - P(20) + P(86)*math.sin(a)
        tr = P(26)
        d.ellipse((tx-tr, ty-tr, tx+tr, ty+tr), fill=ACCENT2, outline=INK, width=OUT_W)

# ---------------------------------------------------------------------------
# Build sheet
# ---------------------------------------------------------------------------
COLS = 5
ROWS = 4
SPRITE_CELL = CELL
SHEET_W = COLS * CELL
SHEET_H = ROWS * CELL

def render(fn):
    c = Cell()
    fn(c)   # draw in 512-space, using scale 1 base coords
    small = c.img.resize((CELL, CELL), Image.LANCZOS)
    return small

sprites_spec = [
    # id, name, fn
    ("cat_client_1",  "Cat Client — Caramel",   lambda c: cat(c, 256, 432, 1.0, FUR_CARAMEL, spot=ACCENT)),
    ("cat_client_2",  "Cat Client — Cream",     lambda c: cat(c, 256, 432, 1.0, FUR_CREAM, spot=T_BLUE)),
    ("cat_client_3",  "Cat Client — Grey",      lambda c: cat(c, 256, 432, 1.0, FUR_GREY, spot=T_PINK)),
    ("cat_worker",    "Cat Worker (Barista)",   lambda c: cat_worker(c, 256, 432, 1.0, FUR_CARAMEL)),
    ("machine_coffee", "Espresso Machine",      lambda c: espresso(c, 256, 430, 1.0)),
    ("machine_bar",   "Bar / Vending Machine",  lambda c: machine2(c, 256, 430, 1.0)),
    ("furniture_table","Wood Cafe Table",       lambda c: table(c, 256, 430, 1.0)),
    ("furniture_shelf","Shelf & Plant",         lambda c: shelf_plant(c, 256, 430, 1.0)),
    ("furniture_cup", "Coffee Cup",             lambda c: cup(c, 256, 430, 1.0)),
    ("furniture_pastry","Pastry (Croissant)",   lambda c: pastry(c, 256, 430, 1.0)),
    ("power_destroy", "Destroy Pile (Bomb)",    lambda c: power_destroy(c, 256, 400, 1.0)),
    ("power_swap",    "Swap Piles",             lambda c: power_swap(c, 256, 400, 1.0)),
    ("power_refresh", "Refresh Pool",           lambda c: power_refresh(c, 256, 400, 1.0)),
    ("calamity_lock", "Calamity / Lock",        lambda c: lock(c, 256, 404, 1.0)),
    ("icon_coin",     "Coin",                   lambda c: coin(c, 256, 396, 1.0)),
    ("icon_heart",    "Heart (Payment)",        lambda c: heart(c, 256, 390, 1.0)),
    ("icon_paw",      "Paw (Level Badge)",      lambda c: paw(c, 256, 380, 1.0)),
]

assert len(sprites_spec) <= COLS*ROWS, "increase grid"

sheet = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))
sprites_map = []
for idx, (sid, name, fn) in enumerate(sprites_spec):
    col = idx % COLS
    row = idx // COLS
    img = render(fn)
    x = col * CELL; y = row * CELL
    sheet.paste(img, (x, y), img)
    sprites_map.append({"id": sid, "name": name, "x": x, "y": y, "w": CELL, "h": CELL,
                        "col": col, "row": row})

out = {
    "SPRITE_CELL": SPRITE_CELL,
    "cols": COLS,
    "rows": ROWS,
    "sheetWidth": SHEET_W,
    "sheetHeight": SHEET_H,
    "sprites": sprites_map,
}

asset_dir = os.path.dirname(os.path.abspath(__file__))
sheet.save(os.path.join(asset_dir, "sprites.png"))
with open(os.path.join(asset_dir, "sprites.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)

print(f"Sheet: {SHEET_W}x{SHEET_H}, cell {SPRITE_CELL}, sprites {len(sprites_map)}")
print("Saved sprites.png + sprites.json")

# ---------------------------------------------------------------------------
# Preview (labeled contact grid)
# ---------------------------------------------------------------------------
import stat, glob
# find a legible ttf
fonts = glob.glob("C:/Windows/Fonts/*.ttf")
fname = None
for cand in ["arialbd.ttf","arial.ttf","segoeuib.ttf","seguisb.ttf","calibrib.ttf"]:
    p = f"C:/Windows/Fonts/{cand}"
    if os.path.exists(p):
        fname = p; break
label_font = ImageFont.truetype(fname, 30) if fname else ImageFont.load_default()

pad = 10
cap = 60
pv_w = pad*2 + COLS*(CELL+8) - 8
pv_h = pad*2 + ROWS*(CELL+8) - 8 + cap
pv = Image.new("RGBA", (pv_w, pv_h), (247,209,225,255))
pv_d = ImageDraw.Draw(pv)
for idx,(sid,name,fn) in enumerate(sprites_spec):
    col = idx%COLS; row = idx//COLS
    sx = pad + col*(CELL+8); sy = pad + row*(CELL+8)
    img = render(fn)
    # light panel behind each cell
    pv_d.rounded_rectangle((sx-4, sy-4, sx+CELL+4, sy+CELL+4+cap), radius=12, fill=(255,255,255,120),
                           outline=(121,72,53), width=2)
    pv.paste(img, (sx, sy), img)
    pv_d.multiline_text((sx, sy+CELL+6), sid, font=label_font, fill=(121,72,53))
pv.convert("RGB").save(os.path.join(asset_dir, "sprite_preview.png"))
print("Saved sprite_preview.png")
