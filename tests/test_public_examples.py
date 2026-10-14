import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('example_server', ROOT / 'tools/serve_examples.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class PublicExamplesTests(unittest.TestCase):
    def test_only_public_resources_are_served(self):
        for path in ['/examples/', '/examples/italy-atlas/cities.geojson', '/assets/adapters/coords.mjs']:
            self.assertIsNotNone(server.public_file(path), path)
        for path in ['/.git/config', '/.env.local', '/examples/../package.json',
                     '/examples/%2e%2e/README.md', '/scripts/profile_geo.py',
                     '/tools/serve_examples.py', '/assets/adapters/', '/examples/README.md']:
            self.assertIsNone(server.public_file(path), path)

    def test_symlinks_cannot_escape_public_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'examples').mkdir()
            secret = root / 'private.geojson'
            secret.write_text('private')
            (root / 'examples/leak.geojson').symlink_to(secret)
            original = server.ROOT
            try:
                server.ROOT = root
                self.assertIsNone(server.public_file('/examples/leak.geojson'))
            finally:
                server.ROOT = original
