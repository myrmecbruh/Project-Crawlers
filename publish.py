#!/usr/bin/env python3
"""Put the game on the web so the link in CHANGELOG.md opens and plays.

    python3 publish.py

Builds first, then pushes the freshly built page to the `gh-pages` branch of the
GitHub repo as `index.html`. GitHub serves that branch as a plain web page, so
the address below always opens, and always opens the newest build:

    https://<owner>.github.io/<repo>/

Why a whole page and not `dist/artifact.html`: artifact.html is a body fragment,
meant to be dropped inside somebody else's viewer. A web address of our own needs
a complete page, so this publishes `dist/crawlers-v<VERSION>.html` -- the same
self-contained file a person can also just double-click.

Why a branch instead of the working files: the branch holds only the built game,
so the published copy can never be a half-edited source tree. Each publish adds a
commit here and leaves every earlier version in place, so a version that misbehaves
can still be opened by name:

    https://<owner>.github.io/<repo>/crawlers-v0.22.0.html

Nothing in the working tree is touched: the blob, the tree and the commit are
built in git's own object store and only the new branch is pushed.
"""

import os
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
DIST = ROOT / "dist"
BRANCH = "gh-pages"
PAGE = "index.html"
VERSION_RE = re.compile(r"^const VERSION = '([^']+)';", re.M)


def git(*args, env=None, check=True):
    """Run one git command from the repo root and hand back its output."""
    p = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if check and p.returncode != 0:
        print("PUBLISH FAILED: git %s\n%s" % (" ".join(args), p.stdout), file=sys.stderr)
        sys.exit(1)
    return p.stdout.strip()


def main():
    # The published page must never be a build behind the source it came from,
    # so publishing always starts by building.
    print("building...")
    build = subprocess.run(
        [sys.executable, str(ROOT / "build.py")], cwd=ROOT, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    if build.returncode != 0:
        print(build.stdout, file=sys.stderr)
        print("PUBLISH FAILED: the build did not pass, so nothing was published.",
              file=sys.stderr)
        sys.exit(1)

    version = VERSION_RE.search(
        (ROOT / "src" / "js" / "00-version.js").read_text()).group(1)
    page = DIST / ("crawlers-v%s.html" % version)
    if not page.exists():
        print("PUBLISH FAILED: %s was not built." % page.name, file=sys.stderr)
        sys.exit(1)

    # Where the page will live, worked out from the repo this is sitting in --
    # no address to keep in sync by hand.
    url = git("remote", "get-url", "origin")
    m = re.search(r"github\.com[:/]+([^/]+)/([^/]+?)(?:\.git)?$", url)
    if not m:
        print("PUBLISH FAILED: origin is not a GitHub address (%s)." % url, file=sys.stderr)
        sys.exit(1)
    owner, repo = m.group(1), m.group(2)
    link = "https://%s.github.io/%s/" % (owner.lower(), repo)

    # The previous publish, if there is one, so this lands on top of it rather
    # than wiping the older versions off the branch.
    git("fetch", "origin", BRANCH, check=False)
    parent = git("rev-parse", "--verify", "--quiet", "origin/" + BRANCH, check=False)

    blob = git("hash-object", "-w", str(page))

    # Build the commit beside the working tree, using an index of its own, so a
    # half-finished edit in the working files cannot end up published.
    with tempfile.TemporaryDirectory() as scratch:
        index = pathlib.Path(scratch) / "index"
        env = dict(os.environ, GIT_INDEX_FILE=str(index))
        if parent:
            git("read-tree", parent, env=env)
        else:
            git("read-tree", "--empty", env=env)
        git("update-index", "--add", "--cacheinfo",
            "100644,%s,%s" % (blob, PAGE), env=env)
        git("update-index", "--add", "--cacheinfo",
            "100644,%s,%s" % (blob, page.name), env=env)
        tree = git("write-tree", env=env)

    message = "v%s -- the playable page\n\nBuilt by build.py and pushed by publish.py.\n" % version
    if parent and tree == git("rev-parse", parent + "^{tree}"):
        print("  already published -- v%s is what the link is serving" % version)
        print("  %s" % link)
        return
    commit = git("commit-tree", tree, *(["-p", parent] if parent else []),
                 "-m", message)
    git("update-ref", "refs/heads/" + BRANCH, commit)
    git("push", "origin", "refs/heads/%s:refs/heads/%s" % (BRANCH, BRANCH))

    print("  published v%s as %s" % (version, PAGE))
    print("  %s" % link)
    print("  %s%s" % (link, page.name))


if __name__ == "__main__":
    main()
