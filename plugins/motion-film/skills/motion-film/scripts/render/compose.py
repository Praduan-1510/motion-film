"""Encode the rendered frames + the score into the deliverables.

    python compose.py <frame dir> <mix.wav> <out dir> <name> [--fps=30]

Writes <name>.mp4 (master, x264 CRF 15, AAC 320k) and <name>_web.mp4 (CRF 21, AAC 192k). Both BT.709-tagged, yuv420p,
faststart. aq-mode 3 keeps the dark gradients from banding. ffmpeg comes from the imageio-ffmpeg Python package.
"""
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def encode(frames, wav, out, crf, abr, fps, preset="slow"):
    cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-stats",
           "-framerate", str(fps), "-i", str(Path(frames) / "frame_%05d.png"), "-i", str(wav),
           "-map", "0:v", "-map", "1:a",
           "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
           "-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-profile:v", "high", "-level", "4.2",
           "-x264-params", "aq-mode=3:aq-strength=0.9:deblock=-1,-1",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
           # write the BT.709 VUI into the H.264 stream itself (x264 otherwise leaves primaries/transfer unspecified here)
           "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",
           "-c:a", "aac", "-b:a", abr, "-ar", "48000",
           "-movflags", "+faststart", "-shortest", str(out)]
    print(" ".join(cmd[:6]), "…", out)
    subprocess.run(cmd, check=True)


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a.lstrip("-").split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    if len(pos) < 4:
        sys.exit(__doc__)
    frames, wav, out_dir, name = pos[0], pos[1], Path(pos[2]), pos[3]
    fps = opts.get("fps", "30")
    out_dir.mkdir(parents=True, exist_ok=True)
    encode(frames, wav, out_dir / f"{name}.mp4", 15, "320k", fps)
    encode(frames, wav, out_dir / f"{name}_web.mp4", 21, "192k", fps)


if __name__ == "__main__":
    main()
