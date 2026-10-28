# motion-film: a Claude Code skill for motion-graphics videos

![A 3D character leaps out of the word "code.", from a 45 s brand film made with motion-film](.github/preview.png)

**motion-film** is an open-source Claude Code skill (a plugin, in development, v0.1) for making heavy motion-graphics
videos in code: brand films, product promos and data explainers, with kinetic type, Liquid Glass UI, a travelling
mascot, real motion blur and a synthesized score, exported as MP4. No After Effects and no timeline: an HTML page
renders any frame as a pure function of time, headless Chrome captures motion-blurred frames, and ffmpeg encodes them
with the score. One installation serves every client; each client's look comes from their brand kit, which stays in your
project.

Website: [motion-film.praduansaha.com](https://motion-film.praduansaha.com/) · Licence: MIT

## Install

```
/plugin marketplace add Praduan-1510/motion-film
/plugin install motion-film@motion-film-marketplace
```

or in one step on Claude Code 2.1.275+: `/plugin install motion-film --marketplace Praduan-1510/motion-film`. Then check
the machine:

```
/motion-film:motion-film doctor
```

It needs Node 22+, Chrome 139+ with WebGL, and Python 3.10+ with the packages in the skill's `requirements.txt`;
`doctor` prints the exact fix for anything missing. Update with `/plugin marketplace update motion-film-marketplace`.

## Status

v0.1 is the engine: a brand-neutral runtime (motion engine, Liquid Glass, WebGL backgrounds, particles, kinetic type,
mascot, iOS and phone components), the render pipeline (motion blur averaged in linear light, x264 master and web MP4s,
synthesized score) and QA tools (still comparison, contact sheets, MP4 verification, mascot continuity, runtime lint).
It renders and checks film pages that already exist. Next: brand-kit ingestion and the first templates (v0.3), the four
formats 16:9 / 9:16 / 1:1 / 4:5 (v0.4), then the guided flow brief → storyboard → preview → final MP4s (v0.8). Until
then the skill runs only when called; it does not trigger by itself.

## Commands (v0.1)

`/motion-film:motion-film <command>`, or from a shell `python <skill dir>/scripts/mf.py <command>`:

| Command | Does |
|---|---|
| `doctor` | Checks Node, Chrome, WebGL on the GPU, Python packages, ffmpeg and disk space |
| `info <page.html>` | The film's size, fps, length and frame count |
| `stills <page.html> --times=…` | Review stills; `sheet <dir> <prefix>` tiles them into contact sheets |
| `render <page.html> --name=…` | Cue sheet → score → motion-blurred frames → MP4s (resumable) |
| `verify <mp4>… --mix= --fps= --dur=` | Streams, BT.709 tags, size, exact frame count, audio sync |
| `mascot <page.html>` | Mascot continuity: no jumps, no invalid positions |
| `compare`, `lint`, `probe`, `cues` | Still comparison, runtime lint, page inspection, sound cue sheet |

## Repository layout

| Path | What |
|---|---|
| `.claude-plugin/marketplace.json` | The marketplace (one plugin) |
| `plugins/motion-film/` | The plugin: `.claude-plugin/plugin.json` and `skills/motion-film/` (`SKILL.md`, `scripts/`, `assets/runtime/`, `requirements.txt`) |

## Developing

- **A film page** defines `window.FILM = { w, h, fps, dur, bpm, palette, fonts, logo, mascot }` (set the property, never
  `var FILM`), then loads the runtime, then its scenes and conductor. The conductor exposes `__seek(t)`, `__ready`,
  `__cues()`, `__fast()` and `__info()` (which must include `w`, `h`, `fps`, `dur`).
- **The runtime holds no brand colour and no stage size** (`mf lint`; neutral white and black are allowed).
- **No client material in this repository**: logos, fonts, photos and copy live in the user's project. The engine
  regression test runs against fixtures from a client production that are kept outside this public repository.
- **Pages and folders are passed as file paths**, never `/…` URL paths. The page is served from the current folder (or
  its own folder if it is outside); `--root` overrides.
- Bump `version` in `plugins/motion-film/.claude-plugin/plugin.json` for every release.
- Console output from Python scripts stays ASCII (Windows pipes it as cp1252).
