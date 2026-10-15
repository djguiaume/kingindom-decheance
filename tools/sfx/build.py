"""
Builds the game's recorded sound effects (apps/game/public/sfx/*.mp3) from CC0 sound packs.

Every effect is a small mix of takes cut from the packs below. The RECIPES table is the full
provenance record: which pack, which file, which take, how it was pitched and mixed. Run it
again after editing a recipe; the output is the same for the same inputs.

Packs (all CC0 1.0, public domain; credit is appreciated, not required):
  kenney_rpg-audio      https://kenney.nl/assets/rpg-audio
  kenney_impact-sounds  https://kenney.nl/assets/impact-sounds
  snm                   Still North Media, "Medieval sound effects": Weapon textures and Weapon
                        impacts, https://opengameart.org/content/medieval-sound-effects-weapon-textures
                        and https://opengameart.org/content/medieval-sound-effects-weapon-impacts
                        (the .7z archives, extracted into one folder)

Usage: python3 tools/sfx/build.py <packs-dir>
  where <packs-dir> holds kenney_rpg-audio/, kenney_impact-sounds/ and snm/.
Needs ffmpeg (with libmp3lame) and numpy.
"""

import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 48000
OUT_SR = 44100
OUT = Path(__file__).resolve().parents[2] / 'apps/game/public/sfx'

RPG = 'kenney_rpg-audio/Audio/'
IMPACT = 'kenney_impact-sounds/Audio/'
SNM = 'snm/'


def L(src, at=0.0, length=None, delay=0.0, db=0.0, rate=1.0):
    """One layer: `length` seconds of `src` from `at`, pitched by `rate`, `delay` s into the mix."""
    return dict(src=src, at=at, length=length, delay=delay, db=db, rate=rate)


# name -> list of layers. Variants of one sound are separate files (name_1, name_2, ...).
RECIPES = {
    # The king's roll (his Charge): cloth tumbling with three soft body thumps, ~0.35 s.
    'roll': [
        L(RPG + 'cloth1.ogg', length=0.4),
        L(IMPACT + 'impactSoft_medium_000.ogg', delay=0.0, db=-4, rate=0.8),
        L(IMPACT + 'impactSoft_medium_001.ogg', delay=0.12, db=-6, rate=0.8),
        L(IMPACT + 'impactSoft_medium_002.ogg', delay=0.24, db=-8, rate=0.8),
    ],
    # What the roll bowls over: a heavy body bump.
    'roll-hit_1': [
        L(IMPACT + 'impactSoft_heavy_000.ogg'),
        L(IMPACT + 'impactPunch_heavy_000.ogg', db=-8),
    ],
    'roll-hit_2': [
        L(IMPACT + 'impactSoft_heavy_001.ogg'),
        L(IMPACT + 'impactPunch_heavy_001.ogg', db=-8),
    ],
    # The spear: a short whoosh into the stab, which lands within ~50 ms (the hit is the contact).
    'spear_1': [
        L(SNM + 'Spear Swing.wav', at=2.38, length=0.12),
        L(IMPACT + 'impactPunch_medium_000.ogg', delay=0.04, db=-7),
    ],
    'spear_2': [
        L(SNM + 'Spear Swing.wav', at=0.27, length=0.12),
        L(IMPACT + 'impactPunch_medium_001.ogg', delay=0.04, db=-7),
    ],
    'spear_3': [
        L(SNM + 'Spear Swing.wav', at=1.59, length=0.12, rate=1.08),
        L(IMPACT + 'impactPunch_medium_002.ogg', delay=0.04, db=-7),
    ],
    # Swords (footmen, knights): steel on steel.
    'sword_1': [L(SNM + 'Norse Sword Katana Blade on Blade.wav', at=0.24, length=0.4)],
    'sword_2': [L(SNM + 'Norse Sword Katana Blade on Blade.wav', at=4.87, length=0.4)],
    'sword_3': [L(SNM + 'Norse Sword Katana Blade on Blade.wav', at=5.61, length=0.4)],
    # Axes (raiders, harpies, the warlord): a chop.
    'axe_1': [L(RPG + 'chop.ogg'), L(SNM + 'Axe Spear Blade on haft.wav', at=0.10, length=0.3, db=-6)],
    'axe_2': [L(RPG + 'chop.ogg', rate=0.9), L(SNM + 'Axe Spear Blade on haft.wav', at=2.13, length=0.3, db=-4)],
    # Clubs (brutes): a dull wooden thud with weight behind it.
    'club_1': [L(SNM + 'Mace Spear Haft.wav', at=2.99, length=0.35, rate=0.8), L(IMPACT + 'impactPunch_heavy_002.ogg', db=-5)],
    'club_2': [L(SNM + 'Mace Spear Haft.wav', at=1.17, length=0.35, rate=0.8), L(IMPACT + 'impactPunch_heavy_003.ogg', db=-5)],
    # Shot releases.
    'bow_1': [L(SNM + 'English Longbow Shoot.wav', at=1.25, length=0.4)],
    'bow_2': [L(SNM + 'English Longbow Shoot.wav', at=0.10, length=0.4)],
    'bow_3': [L(SNM + 'Scythian Recurve Shoot.wav', at=3.40, length=0.4)],
    'crossbow_1': [L(SNM + 'Crossbow Shoot.wav', at=2.49, length=0.35)],
    'crossbow_2': [L(SNM + 'Crossbow Shoot.wav', at=0.32, length=0.35)],
    # Shot impacts and misses.
    'arrow-hit_1': [L(IMPACT + 'impactSoft_medium_003.ogg', rate=1.15)],
    'arrow-hit_2': [L(IMPACT + 'impactSoft_medium_004.ogg', rate=1.15)],
    'bolt-hit_1': [L(IMPACT + 'impactPunch_medium_003.ogg')],
    'bolt-hit_2': [L(IMPACT + 'impactPunch_medium_004.ogg')],
    'arrow-miss_1': [L(IMPACT + 'footstep_grass_000.ogg', length=0.25)],
    'arrow-miss_2': [L(IMPACT + 'footstep_grass_001.ogg', length=0.25)],
    # Towers and the castle shoot and hit at once.
    'tower_1': [L(SNM + 'Scythian Recurve Shoot.wav', at=0.21, length=0.35, rate=1.1)],
    'tower_2': [L(SNM + 'Scythian Recurve Shoot.wav', at=2.95, length=0.35, rate=1.1)],
    # The ballista: a crossbow scaled up, slamming into its target.
    'ballista': [
        L(SNM + 'Crossbow Shoot.wav', at=0.32, length=0.4, rate=0.6),
        L(IMPACT + 'impactWood_heavy_000.ogg', delay=0.06, db=-4),
    ],
    # The catapult: the arm slams the crossbar as the stone leaves (the `fired` moment), with
    # the whoosh of the throw and the frame creaking as it settles.
    'catapult': [
        L(IMPACT + 'impactWood_heavy_001.ogg'),
        L(SNM + 'Axe Swing.wav', at=1.60, length=0.3, rate=0.6, db=-4),
        L(RPG + 'creak3.ogg', length=0.3, delay=0.12, db=-8),
    ],
    # The boulder landing on someone or something, and on the bare ground.
    'boulder': [
        L(IMPACT + 'impactMining_000.ogg', rate=0.6),
        L(IMPACT + 'impactSoft_heavy_002.ogg', rate=0.7),
        L(IMPACT + 'impactWood_heavy_002.ogg', rate=0.8, db=-6),
    ],
    'boulder-land': [
        L(IMPACT + 'impactSoft_heavy_003.ogg', rate=0.6),
        L(IMPACT + 'footstep_grass_002.ogg', rate=0.5, db=-4, length=0.4),
    ],
    # Blows on structures, by material.
    'stone_1': [L(IMPACT + 'impactMining_001.ogg', rate=0.85)],
    'stone_2': [L(IMPACT + 'impactMining_002.ogg', rate=0.85)],
    'wood_1': [L(IMPACT + 'impactWood_medium_000.ogg')],
    'wood_2': [L(IMPACT + 'impactWood_medium_001.ogg')],
    'wood_3': [L(IMPACT + 'impactPlank_medium_000.ogg')],
}


def load(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def layer(packs: Path, spec: dict) -> np.ndarray:
    x = load(packs / spec['src'])
    start = int(spec['at'] * SR)
    end = len(x) if spec['length'] is None else start + int(spec['length'] * SR)
    x = x[start:end].astype(np.float64)
    if spec['rate'] != 1.0:  # tape-style pitch: lower rate is lower and longer
        n = int(len(x) / spec['rate'])
        x = np.interp(np.arange(n) * spec['rate'], np.arange(len(x)), x)
    x *= 10 ** (spec['db'] / 20)
    return np.concatenate([np.zeros(int(spec['delay'] * SR)), x])


def mix(packs: Path, layers: list) -> np.ndarray:
    parts = [layer(packs, s) for s in layers]
    out = np.zeros(max(len(p) for p in parts))
    for p in parts:
        out[: len(p)] += p
    # Trim leading silence so the sound starts on the action, fade the tail, peak at -1 dBFS.
    loud = np.flatnonzero(np.abs(out) > np.abs(out).max() * 0.02)
    out = out[max(0, loud[0] - int(0.003 * SR)) :]
    fade = min(len(out) // 3, int(0.08 * SR))
    out[-fade:] *= np.linspace(1, 0, fade) ** 2
    out[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return out / np.abs(out).max() * 10 ** (-1 / 20)


def encode(x: np.ndarray, path: Path) -> None:
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
         '-af', 'highpass=f=40', '-ar', str(OUT_SR), '-c:a', 'libmp3lame', '-b:a', '96k',
         '-map_metadata', '-1', str(path)],
        input=x.astype(np.float32).tobytes(),
        check=True,
    )


def main() -> None:
    packs = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for name, layers in RECIPES.items():
        encode(mix(packs, layers), OUT / f'{name}.mp3')
        print(name)


if __name__ == '__main__':
    main()
