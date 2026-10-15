"""One-time particle and audio authoring; generated files are shipped directly."""
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTHOR = ROOT / "assets" / "authoring"
AUTHOR.mkdir(parents=True, exist_ok=True)
(ROOT / "assets" / "fx").mkdir(exist_ok=True)
(ROOT / "assets" / "audio").mkdir(exist_ok=True)


def run(tool, config, *args):
    subprocess.run([tool, "--config", str(config), *map(str,args)], cwd=AUTHOR, check=True, stdout=subprocess.DEVNULL)


effects = {
    "gas-seep": (12, 1300, 20, "#9bd9b4", 0.16, 0.8),
    "drill-debris": (24, 550, 100, "#c5a780", 0.9, 0.3),
    "jetpack-exhaust": (30, 450, 160, "#ffbb6a", 0.8, 0.7),
    "ore-sparkle": (22, 600, 90, "#ffe4a0", 1, 0.32),
    "material-shimmer": (48, 1100, 80, "#8effe0", 1, 0.6),
    "gas-explosion": (90, 1000, 220, "#ffb969", 1, 1.1),
    "lava-embers": (26, 700, 100, "#ff9d50", 0.9, 0.5),
    "impact-dust": (40, 700, 70, "#a9ab93", 0.5, 1.0),
    "core-extract": (80, 1500, 125, "#ffc08c", 1, 0.8),
    "core-detonation": (180, 1700, 360, "#fff0b7", 1, 2.0),
    "launch-exhaust": (90, 1800, 300, "#ffd69a", 0.9, 2),
    "death-burst": (65, 1000, 160, "#b0e5db", 0.9, 0.7),
}
for name, (count, life, speed, c, opacity, size) in effects.items():
    config = AUTHOR / f"{name}.config.json"
    config.write_text(json.dumps(dict(width=512,height=512,duration_ms=2200,fps=30,seed=42,actions=str(AUTHOR/f"{name}.ops.json"),preview=str(AUTHOR/f"{name}.png"))))
    run("particle-2d", config, "init")
    run("particle-2d", config, "add-emitter", "--name", "body", "--shape", "disc", "--radius", 16, "--x", 0, "--y", 0, "--burst", count, "--lifetime", life, "--lifetime-spread", int(life*.25), "--speed", speed, "--speed-spread", int(speed*.4), "--dir-y", -1 if name in ["jetpack-exhaust","launch-exhaust"] else 1, "--cone-angle", 20 if "exhaust" in name else 40 if name == "gas-seep" else 180)
    run("particle-2d", config, "set-particle", "--emitter", "body", "--size-from", size, "--size-to", size*2 if name=="gas-seep" else 0, "--opacity-from", opacity, "--opacity-to", 0, "--color-gradient", f"{c}@0,#425467@1")
    run("particle-2d", config, "set-forces", "--drag", 1.2, "--gravity", 40 if "debris" in name else 0, "--turbulence", "12,0.025")
    if "explosion" in name or "detonation" in name:
        for layer, amount, velocity, radius in [("flash", 5, 0, 10), ("shock", 80, speed*1.3, .35)]:
            run("particle-2d", config, "add-emitter", "--name", layer, "--shape", "point", "--x", 0, "--y", 0, "--burst", amount, "--lifetime", 180 if layer=="flash" else 550, "--speed", velocity, "--cone-angle", 180)
            run("particle-2d", config, "set-particle", "--emitter", layer, "--size-from", radius, "--size-to", 0, "--color-gradient", "#fff9da@0,#ff9c58@1")
    run("particle-2d", config, "render", "--frame", 12)
    shutil.move(AUTHOR/"system.json",ROOT/"assets"/"fx"/f"{name}.json")


def sound_config(name, duration=1400):
    config = AUTHOR/f"{name}.config.json"
    config.write_text(json.dumps(dict(sample_rate=22050,channels="mono",max_duration_ms=duration,seed=81,actions=str(AUTHOR/f"{name}.ops.json"),preview=str(AUTHOR/f"{name}-wave.png"),wav=str(ROOT/"assets"/"audio"/f"{name}.wav"),midi=str(ROOT/"assets"/"audio"/f"{name}.mid"))))
    return config


samples = {"drill": [("engine_diesel_idle",-23,0),("mech_ratchet",-20,0)],"thrust":[("whoosh_air",-20,0),("fire_crackle",-27,0)],"gas-explosion":[("cannon_body_heavy",-14,0),("debris_rubble",-23,90),("boom_sub_rumble",-16,0)],"impact":[("impact_metal_hollow",-22,0),("debris_rubble",-28,20)],"fabricate":[("mech_clip_load",-19,0),("servo_motor",-26,80)],"launch":[("boom_sub_rumble",-18,0),("fire_crackle",-18,0),("whoosh_air",-16,500)],"lava-sizzle":[("fire_crackle",-22,0),("whoosh_swipe",-26,0)],"death":[("impact_metal_dry",-16,0),("whoosh_air",-22,50)]}
for name, layers in samples.items():
    config = sound_config(name, 2800 if name=="launch" else 1200 if name in ["drill","thrust"] else 1800)
    run("sfx-sample",config,"init")
    for sample, gain, t in layers:
        run("sfx-sample",config,"add-sample","--name",sample,"--gain",gain,"--t",t,"--fade-out",180)
    run("sfx-sample",config,"render")
for name, notes in {"ore-pickup":[523,784],"material-chime":[440,660,880,1320],"alarm-fuel":[330,260],"alarm-core":[880,660]}.items():
    config=sound_config(name,900)
    run("sfx-synth",config,"init")
    for i, freq in enumerate(notes):
        voice=f"v{i}"
        run("sfx-synth",config,"add-voice","--name",voice,"--wave","sine" if "alarm" in name else "triangle","--freq",freq,"--gain",-25,"--start",i*95,"--dur",180)
        run("sfx-synth",config,"set-envelope","--voice",voice,"--env","pluck")
    run("sfx-synth",config,"render")

config=sound_config("music",32000)
run("music",config,"init")
run("music",config,"set-tempo","--bpm",60)
for name, instrument, gain, reverb in [("abyss","synth_pad",-28,.7),("pulse","bass_electric",-31,.2),("signal","vibraphone",-29,.6)]:
    run("music",config,"define-track","--name",name,"--instrument",instrument)
    run("music",config,"set-track-fx","--track",name,"--gain",gain,"--reverb",reverb)
for bar, root in enumerate([38,34,36,33]):
    for pitch in [root,root+7,root+14]:
        run("music",config,"add-note","--track","abyss","--pitch",pitch,"--t",bar*8,"--dur",7.8,"--velocity",55)
    for beat in range(8):
        run("music",config,"add-note","--track","pulse","--pitch",root-12,"--t",bar*8+beat,"--dur",.6,"--velocity",55 if beat%2==0 else 30)
    for beat, note in [(1,root+24),(3.5,root+19),(6,root+26)]:
        run("music",config,"add-note","--track","signal","--pitch",note,"--t",bar*8+beat,"--dur",1.6,"--velocity",45)
run("music",config,"render")
print("Twelve live effects and thirteen audio cues rendered.")
