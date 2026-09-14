import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_mapbox_html import build


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.data = self.root / 'data.json'
        self.spec = self.root / 'spec.json'
        self.out = self.root / 'map.html'
        self.feature = {'type': 'Feature', 'id': 'city-1',
                        'geometry': {'type': 'Point', 'coordinates': [12, 42]},
                        'properties': {'private_note': 'DO_NOT_EXPORT',
                                       '__viz': {'value': 40, 'label': '</script><script>alert(1)</script>'}}}
        self.collection = {'type': 'FeatureCollection', 'metadata': {'dataCrs': 'wgs84'},
                           'features': [self.feature]}
        self.config = {'title': 'Cities <test>', 'description': 'Population', 'effect': 'bubble', 'unit': 'people'}

    def render(self):
        self.data.write_text(json.dumps(self.collection))
        self.spec.write_text(json.dumps(self.config))
        return build(self.data, self.spec, self.out)

    def test_html_preserves_display_text_without_exporting_private_properties(self):
        result = self.render()
        self.assertEqual(result['verification'], 'pending-key')
        document = self.out.read_text()
        payload = json.loads(re.search(r'id="geo-data">(.*?)</script>', document, re.S)[1])
        self.assertNotIn('DO_NOT_EXPORT', document)
        self.assertNotIn('</script><script>alert(1)', document)
        self.assertEqual(payload['data']['features'][0]['properties']['__viz']['label'],
                         self.feature['properties']['__viz']['label'])
        self.assertEqual(payload['token'], '')
        self.assertIn('export function mountRecipe', document)

    def test_existing_output_is_preserved(self):
        self.out.write_text('keep')
        with self.assertRaises(ValueError): self.render()
        self.assertEqual(self.out.read_text(), 'keep')

    def test_unknown_crs_and_mismatched_geometry_are_rejected(self):
        self.collection['metadata']['dataCrs'] = 'unknown'
        with self.assertRaises(ValueError): self.render()
        self.collection['metadata']['dataCrs'] = 'wgs84'
        self.config['effect'] = 'fill'
        with self.assertRaises(ValueError): self.render()
        self.assertFalse(self.out.exists())

    def test_negative_bubbles_require_explicit_semantics(self):
        self.feature['properties']['__viz']['value'] = -3
        with self.assertRaises(ValueError): self.render()
        self.config['sizeMode'] = 'absolute'
        self.assertEqual(self.render()['effects'], ['bubble'])

    def test_weighted_heatmap_does_not_accept_negative_contributions(self):
        self.config.update(effect='heatmap', weight='value')
        self.feature['properties']['__viz']['value'] = -3
        with self.assertRaises(ValueError): self.render()
        self.config['weight'] = 'count'
        self.assertEqual(self.render()['effects'], ['heatmap'])
