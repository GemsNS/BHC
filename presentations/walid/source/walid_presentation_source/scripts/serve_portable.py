#!/usr/bin/env python3
"""Serve the exported private presentation for local portability testing."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1] / "private_web_package"
HANDLER = partial(SimpleHTTPRequestHandler, directory=str(ROOT))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "4180"))
    server = ThreadingHTTPServer(("", port), HANDLER)
    print(f"Serving portable package at http://localhost:{port}", flush=True)
    server.serve_forever()
