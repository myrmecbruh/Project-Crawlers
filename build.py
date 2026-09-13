#!/usr/bin/env python3
"""Assemble the whole game into one self-contained HTML file.

    python3 build.py

Writes two files from the same source:

    dist/crawlers-v<VERSION>.html   the standalone playable file (doctype and all)
    dist/artifact.html              the same page as a body fragment, for publishing

No engine, no framework, no package manager at runtime. Everything the game
needs is inlined here, so the output plays from a file on a phone with no
network. Run this after every change.
"""

import hashlib
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

# The one line in the whole project that declares a version.
VERSION_FILE = SRC / "js" / "00-version.js"
VERSION_RE = re.compile(r"^const VERSION = '([^']+)';", re.M)


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


def main():
    version = read_version()
    mods = collect_modules()

    code = "\n".join(
        "/* ==== %s ==== */\n%s" % (m.name, m.read_text().rstrip())
        for m in mods
    )
    style = (SRC / "style.css").read_text().strip()

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

    versioned = DIST / ("crawlers-v%s.html" % version)

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

    versioned.write_text(standalone)
    (DIST / "artifact.html").write_text(fragment)

    print("built Project Crawlers v%s" % version)
    for m in mods:
        print("  %-18s %4d lines" % (m.name, len(m.read_text().splitlines())))
    print("  %-18s %4d lines" % ("style.css", len(style.splitlines())))
    print("  script syntax      %s" % syntax)
    print("  dist/%-13s %6.1f KB   <- play this" % (versioned.name, len(standalone) / 1024))
    print("  dist/%-13s %6.1f KB   <- publish this" % ("artifact.html", len(fragment) / 1024))


if __name__ == "__main__":
    main()
