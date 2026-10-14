#!/usr/bin/env python3
"""Serve only the public examples and their assets on the loopback interface."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIRS = ("examples", "assets/adapters", "assets/screenshots")
EXTENSIONS = {".html", ".css", ".mjs", ".geojson", ".png", ".jpg", ".webp"}


def public_file(url_path):
    path = unquote(urlsplit(url_path).path)
    if any(part.startswith(".") for part in Path(path).parts):
        return None
    candidate = (ROOT / path.lstrip("/")).resolve()
    if candidate.is_dir():
        candidate /= "index.html"
    if candidate.suffix not in EXTENSIONS or not candidate.is_file():
        return None
    for folder in PUBLIC_DIRS:
        try:
            candidate.relative_to((ROOT / folder).resolve())
            return candidate
        except ValueError:
            pass
    return None


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == "/":
            self.send_response(302)
            self.send_header("Location", "/examples/")
            self.end_headers()
            return
        path = public_file(self.path)
        if path is None:
            self.send_error(404)
            return
        body = path.read_bytes()
        mime = {".mjs": "text/javascript", ".geojson": "application/geo+json"}.get(path.suffix, self.guess_type(str(path)))
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.send_error(405)

    def list_directory(self, path):
        self.send_error(404)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(ROOT)))
    print(f"Geo Data Viz examples: http://127.0.0.1:{args.port}/examples/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
