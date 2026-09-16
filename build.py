#!/usr/bin/env python3
"""Assemble the whole game into one self-contained HTML file.

    python3 build.py

Writes two files from the same source:

    dist/crawlers-v<VERSION>.html   the standalone playable file (doctype and all)
    dist/artifact.html              the same page as a body fragment, for a viewer
                                    that wraps one (the Claude artifact address)

To put the standalone file on the permanent web address, run `python3 publish.py`:
it calls this first, then pushes what this wrote.

No engine, no framework, no package manager at runtime. Everything the game
needs is inlined here, so the output plays from a file on a phone with no
network. Run this after every change.
"""

import base64
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
SHEET = ROOT / "docs" / "crawlers.xlsx"
TEXTURES = ROOT / "textures"

sys.path.insert(0, str(ROOT / "tools"))
import sheet as S

# The one line in the whole project that declares a version.
VERSION_FILE = SRC / "js" / "00-version.js"
VERSION_RE = re.compile(r"^const VERSION = '([^']+)';", re.M)

# Pictures somebody dropped into textures/<material>/, inlined as data URIs the
# same way the spreadsheet is, so the built page still plays from a file on a
# phone with no network. The eight material names come from sheet.py, so the
# folders here, the names the sheet may use and the eight the renderer draws are
# one list and cannot drift apart.
IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
}


def natural(name):
    """Reads 2.png as two rather than as ten. The order matters: the pictures in
    a folder are laid across the material in this order, so it is the order
    somebody sees them in the folder."""
    return [int(p) if p.isdigit() else p.lower()
            for p in re.split(r"(\d+)", name)]


def collect_textures():
    """material -> [data URI, ...], in the order the files are named.

    A folder that is not one of the eight, or a file that is not a picture, is
    printed and skipped rather than fatal: it is somebody's picture next to the
    game, not a broken build."""
    out = {}
    if not TEXTURES.is_dir():
        return out
    for folder in sorted(TEXTURES.iterdir(), key=lambda p: natural(p.name)):
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        if folder.name not in S.MATERIALS:
            print("  !! textures/%s is not a material the game has; ignoring it "
                  "(it has: %s)" % (folder.name, ", ".join(S.MATERIALS)))
            continue
        files = []
        for p in sorted(folder.iterdir(), key=lambda p: natural(p.name)):
            if p.is_dir() or p.name.startswith("."):
                continue
            # The notes in these folders are for the person, not the game.
            if p.suffix.lower() in (".txt", ".md"):
                continue
            mime = IMAGE_TYPES.get(p.suffix.lower())
            if not mime:
                print("  !! textures/%s/%s is not a picture the page can read; "
                      "ignoring it" % (folder.name, p.name))
                continue
            files.append("data:%s;base64,%s" % (
                mime, base64.b64encode(p.read_bytes()).decode("ascii")))
        if files:
            out[folder.name] = files
    return out


def fail(msg):
    print("BUILD FAILED: " + msg, file=sys.stderr)
    sys.exit(1)


def read_version():
    text = VERSION_FILE.read_text()
    found = VERSION_RE.findall(text)
    if len(found) != 1:
        fail("expected exactly one VERSION declaration in %s, found %d"
             % (VERSION_FILE.name, len(found)))
    return found[0]


def collect_modules():
    mods = sorted((SRC / "js").glob("*.js"))
    if not mods:
        fail("no modules in src/js")
    for m in mods:
        if not m.read_text().strip():
            fail("%s is empty" % m.name)
    return mods


def check_syntax(js_path):
    """A build that emits a file with a syntax error is worse than no build."""
    try:
        r = subprocess.run(["node", "--check", str(js_path)],
                           capture_output=True, text=True)
    except FileNotFoundError:
        return "skipped (no node)"
    if r.returncode != 0:
        print(r.stderr.strip(), file=sys.stderr)
        fail("the assembled script has a syntax error")
    return "ok"


def arg(flag, default=None):
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
        fail("%s needs a path after it" % flag)
    return default


def load_data(sheet_path):
    """Reconcile the master spreadsheet against the code defaults, and print the
    receipt. The receipt is the whole point: it is what stops the two drifting
    apart quietly."""
    defaults = S.load_defaults(SRC / "defaults.json")

    if not sheet_path.exists():
        print("  !! docs/crawlers.xlsx is MISSING -- building from code defaults.")
        print("  !! Run: python3 tools/make_sheet.py")
        merged, moved, errors = S.reconcile(defaults, None)
    else:
        try:
            raw = S.read_xlsx(sheet_path)
        except ImportError:
            fail("openpyxl is not installed, so the spreadsheet cannot be read.\n"
                 "Run the start-up script, or: pip install openpyxl")
        merged, moved, errors = S.reconcile(defaults, raw)

    game = S.for_game(merged)
    errors = errors + S.check_vocabulary(game)
    if errors:
        print("\nThe spreadsheet and the game disagree:", file=sys.stderr)
        for e in errors:
            print("  - " + e, file=sys.stderr)
        fail("refusing to build from a spreadsheet that is out of step with the game")

    if moved:
        print("  spreadsheet moved %d setting%s:" % (len(moved), "" if len(moved) == 1 else "s"))
        for section, key, col, was, now in moved:
            label = key if col in ("value", "text") else "%s.%s" % (key, col)
            print("      %-10s %-26s %s -> %s" % (section, label, was, now))
    elif sheet_path.exists():
        print("  spreadsheet matches the code defaults exactly (nothing moved)")

    counts = ", ".join("%d %s" % (len(v), k) for k, v in game.items())
    print("  loaded from the sheet: %s" % counts)
    return game


def main():
    if "--check" in sys.argv:
        print("spreadsheet reconciler self-check")
        checks = S.selftest()
        for name, ok, detail in checks:
            print("  %s %s%s" % ("ok  " if ok else "FAIL", name,
                                 "" if ok else " -- " + detail))
        bad = [c for c in checks if not c[1]]
        print("  %d/%d passed" % (len(checks) - len(bad), len(checks)))
        return sys.exit(1 if bad else 0)

    version = read_version()
    mods = collect_modules()

    sheet_path = pathlib.Path(arg("--sheet", SHEET))
    print("building Project Crawlers v%s%s"
          % (version, "" if sheet_path == SHEET else "  [sheet: %s]" % sheet_path))
    game_data = load_data(sheet_path)

    code = "\n".join(
        "/* ==== %s ==== */\n%s" % (m.name, m.read_text().rstrip())
        for m in mods
    )

    # The whole spreadsheet travels inside the built file, so the game plays with
    # no network and nothing to install.
    if "{{DATA}}" not in code:
        fail("no module contains {{DATA}}; the spreadsheet would never reach the game")
    # NOT sort_keys: the order rows are written in the spreadsheet is meaningful.
    # The six attributes are shown in the order they are listed, and a figure is
    # authored from the ground up.
    code = code.replace("{{DATA}}", json.dumps(game_data, separators=(",", ":")))
    style = (SRC / "style.css").read_text().strip()

    # And the pictures somebody dropped in travel the same way, for the same
    # reason: one self-contained page.
    pictures = collect_textures()
    if "{{TEXTURES}}" not in code:
        fail("no module contains {{TEXTURES}}; the pictures would never reach "
             "the game")
    code = code.replace("{{TEXTURES}}", json.dumps(pictures, separators=(",", ":")))

    shell = (SRC / "shell.html").read_text()
    for token in ("{{STYLE}}", "{{CODE}}"):
        if token not in shell:
            fail("shell.html is missing %s" % token)

    fragment = shell.replace("{{STYLE}}", style).replace("{{CODE}}", code)
    standalone = (
        "<!doctype html>\n"
        '<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, '
        'viewport-fit=cover">\n'
        "<style>*{box-sizing:border-box}html,body{margin:0}"
        "img{max-width:100%}[hidden]{display:none!important}</style>\n"
        + fragment.split("\n", 1)[0] + "\n"   # the <title>
        "</head>\n<body>\n"
        + fragment.split("\n", 1)[1] +
        "\n</body>\n</html>\n"
    )

    DIST.mkdir(exist_ok=True)
    scratch = DIST / "_check.js"
    scratch.write_text(code)
    syntax = check_syntax(scratch)
    scratch.unlink()

    out_override = arg("--out")
    versioned = pathlib.Path(out_override) if out_override else DIST / ("crawlers-v%s.html" % version)

    # A/B against a file, and check what built it. If a build of this version
    # already exists and the content has changed, the old file was a baseline
    # somebody may be comparing against -- say so loudly before clobbering it.
    if versioned.exists():
        old = hashlib.sha256(versioned.read_bytes()).hexdigest()
        new = hashlib.sha256(standalone.encode()).hexdigest()
        if old != new:
            print("  !! dist/%s already existed and the content CHANGED."
                  % versioned.name)
            print("  !! If you were keeping it as a baseline, bump VERSION first.")

    versioned.parent.mkdir(parents=True, exist_ok=True)
    versioned.write_text(standalone)
    if not out_override:
        (DIST / "artifact.html").write_text(fragment)

    print("  --")
    for m in mods:
        print("  %-18s %4d lines" % (m.name, len(m.read_text().splitlines())))
    print("  %-18s %4d lines" % ("style.css", len(style.splitlines())))
    print("  script syntax      %s" % syntax)
    total = sum(len(v) for v in pictures.values())
    if total:
        kb = sum(len(u.encode()) for v in pictures.values() for u in v) / 1024
        print("  %-18s %6.1f KB   <- %d picture%s in %d material%s: %s"
              % ("textures", kb, total, "" if total == 1 else "s",
                 len(pictures), "" if len(pictures) == 1 else "s",
                 ", ".join("%s %d" % (k, len(pictures[k]))
                           for k in sorted(pictures))))
    else:
        print("  %-18s %6s      <- no pictures dropped in; every surface is the "
              "generated one" % ("textures", "-"))
    print("  %-18s %6.1f KB   <- play this, and publish this"
          % (versioned.name, len(standalone) / 1024))
    if not out_override:
        print("  %-18s %6.1f KB   <- a body fragment, for a viewer that wraps one"
              % ("artifact.html", len(fragment) / 1024))


if __name__ == "__main__":
    main()
