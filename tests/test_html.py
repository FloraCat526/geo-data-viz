import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import build_mapbox_html as builder
import profile_geo as profiler

class HtmlTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
    def generate(self,rows,spec,env=None):
        raw=self.root/'input.json';raw.write_text(json.dumps(rows))
        profiler.profile(raw,self.root/'profile',crs='wgs84',fields={'value':'value'})
        specfile=self.root/'spec.json';specfile.write_text(json.dumps(spec))
        return builder.build(self.root/'profile/normalized.geojson',specfile,self.root/'map.html',env)
    def test_single_file_preserves_data_and_escapes_embedded_text(self):
        text='</script><img src=x onerror=alert(1)> __MODULE__'
        r=self.generate([{'lng':179,'lat':1,'value':0,'name':text,'private_note':'omit me'}, {'lng':-179,'lat':2,'value':4}],{'title':text,'description':'订单大小','effect':'bubble','unit':'单'})
        page=(self.root/'map.html').read_text()
        payload=json.loads(re.search(r'id="geo-data">(.*?)</script>',page,re.S).group(1))
        self.assertNotIn('omit me',page);self.assertNotIn('</script><img',page)
        self.assertEqual(payload['data']['features'][0]['properties']['__viz']['label'],text)
        self.assertEqual(payload['view']['longitudeSpan'],2)
        self.assertEqual(r['verification'],'pending-key');self.assertEqual(payload['token'],'')
        self.assertEqual(page.count('<script type="module">'),1)
        self.assertIn('__MODULE__',payload['data']['features'][0]['properties']['__viz']['label'])
    def test_public_token_only_from_explicit_env_and_not_in_result(self):
        with patch.dict(os.environ,{'GEO_TEST_PUBLIC':'pk.test-browser-only'}):
            r=self.generate([{'lng':1,'lat':2,'value':3}],{'title':'T','description':'D','effect':'bubble','unit':'单'},'GEO_TEST_PUBLIC')
        self.assertTrue(r['containsBrowserToken']);self.assertNotIn('pk.test',json.dumps(r));self.assertIn('pk.test-browser-only',(self.root/'map.html').read_text())
    def test_secret_tokens_rejected_without_echo(self):
        with patch.dict(os.environ,{'GEO_TEST_SECRET':'sk.do-not-echo'}):
            with self.assertRaises(ValueError) as error:self.generate([{'lng':1,'lat':2,'value':1}],{'title':'T','description':'D','effect':'points'},'GEO_TEST_SECRET')
        self.assertNotIn('sk.do-not-echo',str(error.exception));self.assertFalse((self.root/'map.html').exists())
    def test_invalid_metrics_and_output_overwrite_rejected(self):
        spec={'title':'T','description':'D','effect':'bubble','unit':'单'}
        with self.assertRaises(ValueError):self.generate([{'lng':1,'lat':2,'value':'unknown'}],spec)
        with self.assertRaises(ValueError):self.generate([{'lng':1,'lat':2,'value':-1}],spec)
        self.generate([{'lng':1,'lat':2,'value':1}],spec)
        before=(self.root/'map.html').read_bytes()
        with self.assertRaises(ValueError):self.generate([{'lng':1,'lat':2,'value':2}],spec)
        self.assertEqual((self.root/'map.html').read_bytes(),before)
