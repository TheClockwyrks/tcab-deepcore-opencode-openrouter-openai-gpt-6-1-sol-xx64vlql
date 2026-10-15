"""One-time original pixel-art authoring. Requires draw and draw-sheet, not used by build."""
import json
import math
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
random.seed(81273)
ops = []


def rect(x, y, w, h, color):
    if w > 0 and h > 0:
        ops.append(dict(op="fill_rect", x=int(x), y=int(y), width=int(w), height=int(h), color=color))


def line(x1, y1, x2, y2, color):
    ops.append(dict(op="line", x0=int(x1), y0=int(y1), x1=int(x2), y1=int(y2), color=color))


def disc(x, y, r, color):
    ops.append(dict(op="fill_circle", cx=int(x), cy=int(y), r=int(r), color=color))


def poly(points, color):
    for y in range(int(min(p[1] for p in points)), int(max(p[1] for p in points)) + 1):
        xs = []
        for a, b in zip(points, points[1:] + points[:1]):
            if min(a[1], b[1]) <= y < max(a[1], b[1]):
                xs.append(a[0] + (y-a[1]) * (b[0]-a[0]) / (b[1]-a[1]))
        xs.sort()
        for i in range(0, len(xs)-1, 2):
            rect(xs[i], y, xs[i+1]-xs[i]+1, 1, color)


def save(path, w=80, h=80, sheet=False):
    target = ROOT / "assets" / path
    target.parent.mkdir(parents=True, exist_ok=True)
    log = target.with_suffix(".actions.json")
    log.write_text(json.dumps(ops))
    subprocess.run(["draw-sheet" if sheet else "draw", "render", "--actions", str(log), "--out", str(target), "--width", str(w), "--height", str(h), "--no-layers"], check=True, stdout=subprocess.DEVNULL)
    ops.clear()


def color(rgb, d):
    return "#" + "".join(f"{max(0,min(255,c+d)):02x}" for c in rgb)


bands = {"topsoil": (71, 57, 48), "rockbed": (58, 70, 77), "deepstone": (34, 44, 58), "coreshell": (67, 37, 44)}
for band, rgb in bands.items():
    for variant in range(3):
        rect(0, 0, 80, 80, color(rgb, 0))
        for _ in range(1900):
            x, y = random.randrange(80), random.randrange(80)
            rect(x, y, random.choice([1, 1, 2, 3]), 1, color(rgb, random.choice([-13, -8, -4, 4, 7, 12])))
        for _ in range(8):
            x, y = random.randrange(80), random.randrange(80)
            line(x, y, x + random.randrange(5, 20), y - random.randrange(2, 9), color(rgb, -18))
        if band == "coreshell":
            for _ in range(3):
                x, y = random.randrange(80), random.randrange(80)
                line(x, y, x+9, y+3, "#a14a39")
        save(f"tiles/{band}-{variant}.png")

rect(0, 0, 80, 80, "#101c24")
for _ in range(500):
    rect(random.randrange(80), random.randrange(80), 2, 1, random.choice(["#15232c", "#0d1820", "#1a2830"]))
save("tiles/tunnel.png")
for n in range(3):
    if n < 2:
        poly([(8,20),(25-n*6,5),(60+n*5,7),(76,26),(73,62),(53,76),(17,70),(4,48)], "#192b37")
        poly([(11,22),(26-n*6,8),(59+n*5,10),(72,27),(69,59),(52,72),(19,67),(8,47)], "#536776")
        poly([(11,22),(26-n*6,8),(45,33),(29,43),(8,47)], "#70818c")
        poly([(45,33),(59+n*5,10),(72,27),(69,59),(51,53)], "#41566b")
        poly([(29,43),(51,53),(52,72),(19,67),(8,47)], "#384f61")
        line(12,22,26-n*6,8,"#a4b6ba")
        line(26-n*6,8,59+n*5,10,"#8fa5ad")
        line(29,43,51,53,"#81939d")
        line(51,53,69,59,"#233b50")
        save(f"tiles/stone-{n}.png")
        continue
    rect(0, 0, 80, 80, "#1b2530" if n == 2 else "#303b49")
    for j in range(5):
        x, y = random.randrange(-10, 50), j * 19 - 9
        poly([(x, y), (x+40, y-8), (x+58, y+10), (x+34, y+27), (x-4, y+19)], "#536273" if n < 2 else "#2c3d4a")
        line(x, y, x+40, y-8, "#84919a")
        line(x+40, y-8, x+58, y+10, "#66788a")
        line(x-4, y+19, x+34, y+27, "#17202c")
    save("tiles/bedrock.png" if n == 2 else f"tiles/stone-{n}.png")

ore_colors = ["#c19370", "#bdc9bb", "#e58d59", "#c6e4e6", "#659bf1", "#c4df65", "#a190df", "#ed7863", "#e6b75e", "#9cf5e7", "#61eeab", "#ff80ab", "#ffe4a0"]
ores = ["ferron", "marlite", "cuprite", "argenite", "cobaltine", "voltite", "halcite", "pyronium", "cindrite", "adamite", "verdite", "roselite", "aurite"]
for idx, name in enumerate(ores):
    c = ore_colors[idx]
    if idx < 10:
        for _ in range(230):
            x = random.randrange(80)
            y = int(40 + 15*math.sin(x/24) + random.gauss(0, 7))
            rect(x, y, random.randrange(2, 8), random.randrange(1, 4), c + random.choice(["33", "66", "99", "cc", "ff"]))
        for x in range(0, 80, 3):
            y = int(40+15*math.sin(x/24))
            line(x, y, x+5, y-1, c)
    else:
        poly([(40, 9), (63, 25), (68, 49), (40, 70), (15, 48), (19, 25)], "#102630")
        poly([(40, 12), (62, 26), (53, 37), (29, 37), (20, 26)], c)
        poly([(20, 27), (30, 37), (40, 65), (17, 47)], c+"aa")
        poly([(53, 37), (65, 47), (40, 65)], c+"cc")
        poly([(30, 37), (53, 37), (40, 65)], "#e6fff0")
        line(23, 27, 58, 27, "#ffffff")
        line(55, 9, 55, 23, "#ffffff")
        line(49, 16, 61, 16, "#ffffff")
    save(f"ore/{name}.png")

for idx, name in enumerate(["resonite", "cryenite", "core", "core-sample"]):
    c = ["#70ffc1", "#89dfff", "#ffb666", "#ffce8e"][idx]
    for x, y, r in [(40, 40, 30), (40, 40, 24), (40, 40, 18)]:
        disc(x, y, r, c+"15")
    if name == "core":
        disc(40,40,31,"#ff793b28")
        poly([(40,10),(62,19),(73,40),(62,63),(40,72),(18,61),(8,40),(19,19)],"#923c31")
        poly([(40,14),(59,21),(68,40),(58,58),(40,67),(22,57),(14,40),(23,23)],"#e9873f")
        poly([(40,17),(58,23),(60,40),(47,50),(26,48),(20,32)],"#ffc16d")
        poly([(40,23),(54,30),(56,43),(43,56),(28,49),(25,35)],"#ffe3a1")
        poly([(40,28),(50,35),(47,47),(35,51),(30,38)],"#fff9d7")
        for a in range(0,360,45):
            rad=math.radians(a)
            x,y=40+int(math.cos(rad)*30),40+int(math.sin(rad)*30)
            disc(x,y,3,"#ffe9b0")
        line(19,57,10,67,"#f5b86a")
        line(60,22,70,12,"#f5b86a")
        save(f"materials/{name}.png")
        continue
    if name == "core-sample":
        poly([(27,16),(34,10),(49,10),(55,16),(55,66),(49,72),(33,72),(27,65)],"#18313f")
        rect(30,17,22,48,"#82968d")
        rect(33,20,16,42,"#384b52")
        rect(36,23,10,34,"#ee9b53")
        rect(39,25,4,29,"#fff4b1")
        rect(28,16,27,6,"#c4bf9c")
        rect(28,61,27,6,"#c4bf9c")
        rect(35,9,14,6,"#92afa7")
        for y in [29,45]: rect(29,y,24,4,"#536c71")
        save(f"materials/{name}.png")
        continue
    for j in range(5):
        x, y = 20+j*9, 20 + (j%3)*8
        poly([(x, y), (x+7, y-14), (x+13, y+6), (x+8, 62), (x-4, 52)], c+"bb")
        poly([(x+7, y-14), (x+8, 62), (x+13, y+6)], c)
        line(x+7, y-14, x+7, y+29, "#f4fff2")
    save(f"materials/{name}.png")

for f in range(4):
    for i in range(f+1):
        x, y = 40, 36
        for _ in range(5):
            nx, ny = x+random.randrange(-20, 21), y+random.randrange(-20, 21)
            line(x+1, y, nx+1, ny, "#ead8ba80")
            line(x, y, nx, ny, "#131d29")
            x, y = nx, ny
    save(f"tiles/crack/frame{f:02}.png", sheet=True)
for f in range(4):
    rect(0, 0, 80, 80, "#9c352e")
    for y in range(80):
        for x in range(0, 80, 2):
            v = math.sin(x/10+y/17+f*1.5)+math.sin(y/8-x/22+f)
            rect(x, y, 2, 1, "#ffe5a0" if v > 1.65 else "#fbb34b" if v > 1 else "#e76a32" if v > -.5 else "#b7402b")
    save(f"hazards/lava/frame{f:02}.png", sheet=True)

# One consistent suited character, with jointed poses and a mechanical drill.
states = {"idle": 4, "walk": 6, "drill-down": 4, "drill-side": 4, "jetpack": 4, "fall": 4, "hurt": 3, "fuel-out": 4}
for state, count in states.items():
    for f in range(count):
        bob = [0, -1, 0, 1, 0, -1][f]
        if state.startswith("drill"):
            bob = f%2*2
        if state == "jetpack":
            bob -= 4
        if state == "hurt":
            bob -= 4-f*2
        if state == "fuel-out":
            bob += 4
        def r(x, y, w, h, c):
            if state == "hurt" and y < 55:
                x -= 6-f*2
                if y < 29:
                    y -= 3
            if state == "fuel-out" and y < 29:
                y += 7
                x += 3
            if state == "drill-side" and y < 55:
                x += 3
            rect(x, y+bob, w, h, c)
        def p(points, c):
            shift = -6+f*2 if state == "hurt" else 3 if state == "drill-side" else 0
            poly([(x+shift,y+bob) for x,y in points], c)
        # jetpack tank, fuel window and harness
        r(13, 28, 14, 29, "#0b151e")
        r(15, 29, 10, 24, "#60757d")
        r(15, 30, 4, 20, "#91a5a4")
        r(17, 35, 4, 12, "#64d8cc" if state != "fuel-out" else "#374752")
        r(15, 53, 10, 7, "#222d37")
        # legs with different stride / bent flight knees
        stride = [0, 5, 8, 0, -5, -8][f] if state == "walk" else 0
        for x, dy in [(28, stride), (43, -stride)]:
            r(x, 48, 12, 12, "#17232d")
            r(x, 50, 9, 8, "#c69048")
            trail = 8 if state == "fall" else 3 if state == "jetpack" else 0
            lift = -8 if state == "fall" else -4 if state == "jetpack" else 0
            r(x+trail, 58+lift, 10, 10+dy//2, "#698088")
            r(x-1+trail, 66+dy//2+lift, 16, 6, "#101c27")
            r(x+trail, 66+dy//2+lift, 13, 2, "#9aa49d")
        # torso armor
        p([(26,28), (49,27), (56,36), (51,54), (27,55), (22,40)], "#101d26")
        r(27, 30, 21, 23, "#a98650" if state == "fuel-out" else "#dca14d")
        r(29, 31, 6, 20, "#f2c16c")
        r(36, 34, 12, 13, "#a76d36")
        r(37, 36, 9, 7, "#263a42")
        r(38, 37, 3, 2, "#99f2d5")
        r(27, 50, 25, 5, "#30414a")
        r(35, 51, 7, 3, "#a6b4ac")
        # helmet with thick rim, deep reflective visor and warm lamp
        r(26, 7, 24, 22, "#0d1a24")
        r(24, 11, 31, 15, "#a8793e")
        r(28, 6, 20, 5, "#ffe0a1")
        r(28, 9, 23, 4, "#eab963")
        r(30, 13, 24, 12, "#112c39")
        r(32, 14, 19, 4, "#64b6bd")
        r(33, 15, 8, 2, "#baede0")
        r(48, 19, 5, 4, "#396377")
        r(27, 24, 23, 5, "#d7ad68")
        r(48, 8, 10, 7, "#4d646b")
        r(52, 9, 6, 4, "#61706a" if state == "fuel-out" else "#fff3bd" if f%2 else "#ffffff")
        # articulated arm and handheld rotary drill
        down = state in ["drill-down", "fuel-out"]
        ay = 40 if down else 21 if state == "fall" else 24 if state == "hurt" else 33 + (f%2 if state.startswith("drill") else 0)
        if state == "walk":
            ay += [-1, 1, 3, 1, -1, -3][f]
        r(45, ay, 11, 11, "#edb461")
        r(50, ay+8, 10, 7, "#334b59")
        if down:
            r(49, 48, 14, 14, "#78949b")
            r(50, 50, 4, 10, "#c7dfd2")
            p([(50,62),(62,62),(57,79)], "#d6e0ce")
            line(51, 65+bob, 60, 67+bob, "#526777")
            line(53, 70+bob, 59, 72+bob, "#526777")
        else:
            r(56, ay+5, 13, 12, "#4c6672")
            r(58, ay+6, 8, 3, "#b6c5b4")
            r(61, ay+15, 5, 6, "#182832")
            p([(69,ay+5),(79,ay+11),(69,ay+17)], "#cbd8c8")
            line(70, ay+8+bob, 74, ay+13+bob, "#57727d")
        if state == "jetpack":
            p([(15,57),(25,57),(28,67),(20,79-f%3*3),(12,68)], "#f17d3c")
            p([(17,57),(23,57),(20,72+f%2*4)], "#fff2bc")
        if state == "hurt":
            for j in range(4):
                r(11+j*15, 5+(j%2)*54, 3, 3, "#fff6de")
        save(f"miner/{state}/frame{f:02}.png", sheet=True)

# Panoramic sky: dust, stars, distant crags, a ringed dead moon, derelict cranes.
for y in range(600):
    t = y/600
    rect(0, y, 1280, 1, color((10+int(12*t), 23+int(17*t), 34+int(16*t)), 0))
for _ in range(420):
    x, y = random.randrange(1280), random.randrange(510)
    rect(x, y, 1 if random.random()<.9 else 2, 1, random.choice(["#7b9d9a", "#324b59", "#b5bca0"]))
disc(991, 146, 65, "#8c9e91")
disc(976, 135, 65, "#1b3340")
for i in range(5):
    line(884, 182+i, 1090, 100+i, "#637c78" if i==0 else "#344f58")
for level, c in [(0,"#223d47"),(1,"#1a303c"),(2,"#142631")]:
    pts = [(0,600)] + [(x, random.randrange(340,470)+level*35) for x in range(0,1320,60)] + [(1280,600)]
    poly(pts,c)
for x in [180, 720, 1100]:
    rect(x,410,7,170,"#0c1c27")
    line(x,410,x+115,400,"#0c1c27")
    line(x,411,x+60,452,"#0c1c27")
    line(x+100,402,x+100,465,"#0c1c27")
    rect(x+96,465,10,8,"#6d7566")
save("surface/sky.png",1280,600)
rect(0,0,160,40,"#3b443e")
rect(0,0,160,4,"#9a9b75")
for x in range(0,160,16):
    line(x,6,x+10,6,"#68705a")
for _ in range(400):
    rect(random.randrange(160),random.randrange(5,40),2,1,random.choice(["#4e5645","#293735","#67674e"]))
save("surface/ground.png",160,40)

ids = ["fuel-depot", "ore-market", "save-pad", "upgrade-shop", "supply-depot", "launch-pad"]
for idx, name in enumerate(ids):
    rect(7,119,186,10,"#101f29")
    rect(4,125,192,11,"#728078")
    for x in range(10,190,18):
        poly([(x,126),(x+7,126),(x+1,134),(x-6,134)],"#d7ad58")
    if idx == 0:
        for x in [18,57]:
            rect(x,33,31,83,"#203843")
            disc(x+15,33,15,"#758e8d")
            rect(x+3,36,25,76,"#5b7479")
            rect(x+5,38,6,67,"#9db0a5")
            rect(x+12,51,13,24,"#f0ba63")
            for y in [45,85]: rect(x+1,y,29,4,"#253d47")
        rect(103,53,63,65,"#47616b")
        rect(109,60,50,25,"#162e3a")
        rect(114,65,38,5,"#80ded0")
        rect(115,75,24,4,"#d7c79c")
        line(169,64,185,73,"#a6baaf")
        line(185,73,185,109,"#a6baaf")
    elif idx == 2:
        rect(40,105,120,13,"#48636c")
        rect(49,102,102,4,"#71dfcf")
        rect(81,49,39,53,"#2d4653")
        rect(87,56,27,25,"#88e1c6")
        rect(91,60,19,17,"#244750")
        rect(94,64,13,3,"#91f3cf")
        line(100,49,100,20,"#a4c1b4")
        disc(100,18,4,"#f5d596")
    elif idx == 5:
        rect(24,112,150,10,"#354c5b")
        rect(31,17,10,96,"#657a7b")
        rect(35,15,93,7,"#84958b")
        for y in range(25,105,19):
            line(32,y,65,y+17,"#344b58")
        rect(139,65,33,47,"#4a6268")
        rect(144,72,21,12,"#e7b966")
    else:
        poly([(14,59),(34,39),(153,39),(181,63),(181,119),(14,119)],"#253b48")
        rect(22,62,151,53,"#4b6269")
        rect(27,65,10,48,"#6a817d")
        rect(17,58,162,6,"#a1a58b")
        rect(53,75,61,37,"#152d39")
        rect(58,79,50,4,"#65c9c1")
        for x in range(58,108,12): rect(x,91,8,14,"#ae8a54" if idx == 1 else "#5f8b94")
        rect(131,72,31,43,"#293f4a")
        rect(137,77,19,14,"#e8b866" if idx == 3 else "#86c5a9")
        rect(142,103,6,3,"#bdcdb4")
        for x in [30,163]:
            rect(x,30,4,13,"#304c59")
            rect(x-2,27,8,4,"#e5c08a")
    save(f"surface/{name}.png",200,140)
poly([(0,96),(15,25),(43,7),(79,4),(120,19),(148,48),(160,96)],"#4c5147")
poly([(18,96),(30,41),(61,22),(97,27),(128,56),(138,96)],"#0c1b24")
for x in [23,126]: rect(x,47,7,49,"#7a8879")
rect(27,42,107,7,"#d8aa58")
save("surface/cave-mouth.png",160,100)

for stage in range(6):
    rect(12,190,136,10,"#526b70")
    rect(23,183,113,7,"#b49c6f")
    if stage:
        poly([(58,181),(57,54),(80,13),(104,54),(103,181)],"#1b2f3c")
        rect(61,58,39,119,"#778e8d" if stage>1 else "#3d5560")
        rect(65,61,9,109,"#b5c2ac")
        poly([(60,56),(80,18),(101,56)],"#d5b06d")
        rect(60,57,42,7,"#5b777c")
        for y in range(75,170,20): rect(61,y,39,3,"#243f4e")
        if stage>1:
            for x in [49,102]:
                rect(x,100,10,68,"#526e79")
                rect(x+2,103,4,60,"#9bb4ad")
        if stage>2:
            disc(81,79,12,"#203c4a")
            disc(81,79,8,"#69c7cf")
            rect(77,74,8,3,"#c7f8df")
        if stage>3:
            poly([(60,135),(40,178),(58,178),(68,155)],"#bc8950")
            poly([(100,135),(120,178),(102,178),(92,155)],"#dbb36a")
            rect(66,175,29,10,"#172b38")
        if stage>4:
            rect(75,109,12,31,"#f2c779")
            rect(78,113,6,23,"#fff1b2")
    save(f"rocket/stage{stage}.png",160,210)

for idx, name in enumerate(["fuel","hull","cargo","credits","depth","resonite","cryenite","core-sample"]):
    c = ["#e9b971","#88d9c5","#b8c9c7","#f5cc79","#8da9be","#70ffc1","#89dfff","#ffb666"][idx]
    if idx == 0:
        poly([(8,2),(17,2),(14,10),(21,10),(7,23),(10,14),(4,14)],c)
    elif idx == 1:
        poly([(12,2),(21,6),(19,16),(12,22),(5,16),(3,6)],c)
        poly([(12,6),(17,8),(16,14),(12,18)],"#17363f")
    elif idx == 2:
        rect(3,6,18,16,c);rect(6,3,12,3,c);rect(7,9,10,9,"#17363f")
    elif idx == 3:
        disc(12,12,10,c);rect(10,6,4,12,"#17363f");rect(7,9,10,2,"#17363f")
    elif idx == 4:
        rect(10,2,4,13,c);poly([(4,12),(20,12),(12,22)],c)
    else:
        poly([(12,1),(21,10),(17,20),(7,23),(3,10)],c)
        line(12,3,12,20,"#e8ffeb")
    save(f"icons/{name}.png",24,24)
print("Original art rendered.")
