#!/usr/bin/env python3
"""Film index.html with headless Chrome.

  python3 render.py frames 3.2 8.4 15.9     # full-size stills -> out/frames/
  python3 render.py video                   # one mp4 per scene -> out/video.mp4 (silent)
  python3 render.py video 2 3               # only re-render scenes 2 and 3 (0-based), then re-join

Needs: pip install playwright, a Chrome/Chromium binary (CHROME=/path), ffmpeg.
"""
import json, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
ENC = ["-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30"]


def open_page(pw):
    browser = pw.chromium.launch(executable_path=CHROME, args=["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars"])
    page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    page.goto((HERE / "index.html").as_uri())
    page.evaluate("() => window.ready")
    page.wait_for_timeout(400)
    return browser, page


def shot(page, t):
    page.evaluate("t => new Promise(r => { renderAt(t); requestAnimationFrame(() => requestAnimationFrame(r)); })", t)
    return page.screenshot(type="jpeg", quality=92)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "video"
    with sync_playwright() as pw:
        browser, page = open_page(pw)
        tl = page.evaluate("() => window.TIMELINE")
        fps, starts, end = tl["fps"], tl["starts"], tl["end"]
        if mode == "frames":
            (OUT / os.environ.get("FRAMES", "frames")).mkdir(parents=True, exist_ok=True)
            for a in sys.argv[2:]:
                (OUT / os.environ.get("FRAMES", "frames") / f"t{float(a):05.2f}.jpg").write_bytes(shot(page, float(a)))
        else:
            (OUT / "scenes").mkdir(parents=True, exist_ok=True)
            bounds = [round(s * fps) for s in starts] + [round(end * fps)]
            only = [int(a) for a in sys.argv[2:]] or range(len(starts))
            for i in only:
                tmp, final = OUT / "scenes" / f"s{i}.part.mp4", OUT / "scenes" / f"s{i}.mp4"
                ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "-", *ENC, str(tmp)], stdin=subprocess.PIPE)
                for f in range(bounds[i], bounds[i + 1]):
                    ff.stdin.write(shot(page, f / fps))
                ff.stdin.close()
                if ff.wait() != 0:
                    sys.exit(f"ffmpeg failed on scene {i}")
                tmp.rename(final)
                print("scene", i, "done", flush=True)
            lst = OUT / "scenes" / "list.txt"
            lst.write_text("".join(f"file 's{i}.mp4'\n" for i in range(len(starts))))
            subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(OUT / "video.mp4")])
        browser.close()


if __name__ == "__main__":
    main()
