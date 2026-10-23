---
name: motion-film
description: Makes heavy motion-graphics marketing videos (brand films, product promos, data explainers, animated ads, reels, kinetic type) for any brand from its brand kit, rendered in code to verified MP4s with an original score. In development (v0.1) — today it renders, checks and verifies existing film pages; the brief-to-MP4 flow arrives in v0.8. Not for editing existing footage, live-action cuts, subtitling or static banners.
argument-hint: "doctor | info <page> | stills <page> --times=… | sheet <dir> <prefix> | render <page> --name=… | verify <mp4>… | mascot <page> | lint"
disable-model-invocation: true
metadata:
  version: 0.1.0
---

# motion-film (v0.1, in development)

Films are drawn in code: an HTML film page renders any frame as a pure function of time (`window.__seek(t)`), headless
Chrome captures 12–40 sub-frames per frame for motion blur, and ffmpeg encodes them with a synthesized score. Every brand
comes in through the film's config (`window.FILM`: size, fps, length, tempo, palette, fonts, logo, mascot); the runtime
in `assets/runtime/` holds no brand colour and no stage size.

**Status.** v0.1 extracts the engine from two finished films. Brand-kit ingestion and templates arrive in v0.3, multiple
formats in v0.4, the guided brief → storyboard → preview → final flow (`make`) in v0.8. Until then, use the commands below
on film pages that already exist, and tell the user which phase a missing feature belongs to.

## Running it

Every command goes through one CLI. Run it from the user's project folder; scratch output goes to `./work` there, never
into this skill's folder (it is replaced on update).

```sh
python "${CLAUDE_SKILL_DIR}/scripts/mf.py" doctor        # always first on a new machine
python "${CLAUDE_SKILL_DIR}/scripts/mf.py" <command> …
```

| Command | Does |
|---|---|
| `doctor` | Checks Node 22+, Chrome 139+, WebGL on the GPU, Python 3.10+ with the packages in `requirements.txt`, ffmpeg, disk. Prints the fix for anything missing. |
| `info <page.html>` | The film's size, fps, length and frame count. |
| `stills <page.html> --times=1,2.5 [--out=…]` | Review stills (no motion blur), ~0.3 s each. |
| `sheet <stills dir> <out prefix>` | Labelled contact sheets of stills; look at them before and after every fix. |
| `cues <page.html> --out=<file.json>` | The sound cue sheet the score is built from. |
| `render <page.html> --name=<name> [--from= --to=]` | Cue sheet → score → motion-blurred frames → master and web MP4s. About 25–40 min per 45 s at 1920×1080; resumable; run it detached for long films. |
| `verify <mp4>… --mix=<wav> --fps= --dur=` | Streams, BT.709 tags, size, exact frame count, audio sync. |
| `mascot <page.html>` | Mascot continuity: no jumps, no invalid positions (rule R7). |
| `compare <ref dir> <test dir>` | PSNR between two folders of stills. |
| `lint` | The runtime stays brand-neutral and size-independent. |
| `probe gpu \| eval <page> <expr> \| boot <page>` | Look inside a page in headless Chrome. |

Pass pages and folders as file paths, never as `/…` URL paths. The page is served from the current folder (or its own
folder if it is outside), so everything it loads must be reachable from there.

## Rules that already apply

- Never speed motion up to fit; cut a beat instead. Every line stays readable for at least 0.3 s per word + 0.5 s.
- A film is not done until `verify` passes on the encoded MP4 and you have looked at stills pulled from it.
- Client material (logos, fonts, photos, copy) lives in the user's project, never in this skill's folder.
