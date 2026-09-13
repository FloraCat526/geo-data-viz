import importlib.util
import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/profile_geo.py'
spec = importlib.util.spec_from_file_location('profile_geo', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.count = 0
    def tearDown(self):
        self.tmp.cleanup()
    def run_data(self, text, ext='.csv', encoding='utf-8', **kwargs):
        self.count += 1
        path = self.root / f'in{self.count}{ext}'
        path.write_text(text if isinstance(text,str) else json.dumps(text,ensure_ascii=False),encoding=encoding)
        out = self.root / f'out{self.count}'
        result = m.profile(path,out,**kwargs)
        geo = json.loads((out/'normalized.geojson').read_text())
        return result,geo
    def fc(self, geometries, **extras):
        return {'type':'FeatureCollection','features':[{'type':'Feature','properties':{'name':f'P{i}','value':i+1},'geometry':g} for i,g in enumerate(geometries)],**extras}
    def test_unknown_datum_and_no_auto_metric(self):
        p,g=self.run_data('lng,lat,name,value,user_id,邮编\n116.4,39.9,Beijing,50,123,010001\n121.5,31.2,Shanghai,80,124,200000\n')
        self.assertEqual(p['status'],'needs_crs')
        self.assertEqual(p['dataCrs'],'unknown')
        self.assertEqual(p['roleCandidates']['value'],['value'])
        self.assertIsNone(p['roles']['value'])
        self.assertIsNone(g['features'][0]['properties']['__viz']['value'])
    def test_bom_gb18030_tsv_and_explicit_metric(self):
        for enc in ('utf-8-sig','gb18030'):
            p,g=self.run_data('经度\t纬度\t名称\t人数\n 0 \t 0 \t测试\t 4 \n',ext='.tsv',encoding=enc,crs='gcj02',fields={'value':'人数'})
            self.assertEqual(p['status'],'ready')
            self.assertEqual(g['features'][0]['geometry']['coordinates'],[0,0])
            self.assertEqual(g['features'][0]['properties']['__viz']['value'],4)
            self.assertTrue(any(w.startswith('zero_zero:') for w in p['warnings']))
    def test_missing_nonfinite_out_of_range_and_reversal(self):
        p,g=self.run_data('lng,lat,amount\n0,0,\n,10,2\n10,NaN,3\n39.9,116.4,4\n181,50,5\n1,2,Infinity\n',crs='wgs84',fields={'value':'amount'})
        self.assertEqual(p['counts']['validFeatures'],2)
        self.assertEqual(p['counts']['invalidRecords'],4)
        self.assertEqual(len(p['invalidRows']),4)
        self.assertTrue(any('reversed' in s for r in p['invalidRows'] for s in r['reasons']))
        self.assertEqual([f['properties']['__viz']['value'] for f in g['features']],[None,None])
    def test_duplicate_and_reorder_stable_ids(self):
        p,g=self.run_data('lng,lat,name\n1,2,A\n1,2,A\n1,2,B\n3,4,C\n',crs='wgs84')
        self.assertEqual(p['counts']['duplicateRecords'],1)
        self.assertEqual(p['counts']['duplicatePointLocations'],2)
        self.assertEqual(len({f['id'] for f in g['features']}),4)
        _,h=self.run_data('lng,lat,name\n3,4,C\n1,2,B\n1,2,A\n1,2,A\n',crs='wgs84')
        self.assertEqual({f['id'] for f in g['features']},{f['id'] for f in h['features']})
    def test_address_only(self):
        p,g=self.run_data([{'name':'店','address':'北京市某路'}],ext='.json')
        self.assertEqual(p['status'],'needs_geocoding')
        self.assertEqual(g['features'],[])
        self.assertEqual(p['counts']['invalidRecords'],1)
    def test_geojson_antimeridian(self):
        p,g=self.run_data(self.fc([{'type':'Point','coordinates':[179,20]},{'type':'Point','coordinates':[-179,22]}]),ext='.geojson')
        self.assertEqual(p['status'],'ready')
        self.assertEqual(p['dataCrs'],'wgs84')
        self.assertTrue(p['spatial']['crossesAntimeridian'])
        self.assertEqual(p['spatial']['longitudeSpan'],2)
        self.assertEqual(p['spatial']['center'],[-180,21])
    def test_geojson_nonwgs_source_declaration(self):
        p,g=self.run_data(self.fc([{'type':'Point','coordinates':[116,39]}],metadata={'dataCrs':'bd09'}),ext='.geojson')
        self.assertEqual(p['dataCrs'],'bd09')
        self.assertEqual(g['features'][0]['geometry']['coordinates'],[116,39])
        self.assertTrue(any(w.startswith('non_rfc7946_crs:') for w in p['warnings']))
    def test_unknown_projected_declaration(self):
        p,g=self.run_data(self.fc([{'type':'Point','coordinates':[116,39]}],crs={'type':'name','properties':{'name':'EPSG:3857'}}),ext='.geojson')
        self.assertEqual(p['status'],'needs_crs')
        self.assertEqual(p['dataCrs'],'unknown')
    def test_lines_polygons_multipart_and_area(self):
        square=[[0,0],[1,0],[1,1],[0,1],[0,0]]
        shapes=[{'type':'LineString','coordinates':[[0,0],[1,1]]},{'type':'MultiPoint','coordinates':[[0,0],[1,1]]},{'type':'Polygon','coordinates':[square]},{'type':'MultiLineString','coordinates':[[[0,0],[1,1]]]},{'type':'MultiPolygon','coordinates':[[square]]}]
        p,g=self.run_data(self.fc(shapes),ext='.geojson')
        self.assertEqual(p['counts']['validFeatures'],5)
        self.assertGreater(p['spatial']['approxPolygonAreaKm2'],24000)
        self.assertLess(p['spatial']['approxPolygonAreaKm2'],25000)
    def test_reject_bad_geometry_structures(self):
        shapes=[{'type':'Point','coordinates':['1',2]},{'type':'Point','coordinates':[1,float('inf')]},{'type':'LineString','coordinates':[[1,2]]},{'type':'Polygon','coordinates':[[[0,0],[1,0],[1,1],[0,1]]]},{'type':'MultiPolygon','coordinates':[]},{'type':'Point','coordinates':[True,2]}]
        p,g=self.run_data(self.fc(shapes),ext='.geojson')
        self.assertEqual(p['counts']['invalidRecords'],6)
        self.assertEqual(p['status'],'needs_coordinates')
        self.assertEqual(g['features'],[])
        self.assertEqual(len(p['invalidRows']),6)
    def test_original_props_and_original_id_reserved(self):
        root=self.fc([{'type':'Point','coordinates':[1,2]}])
        root['features'][0]['id']='old-id'
        root['features'][0]['properties'].update({'__viz':{'my':'value'},'__source_viz':'keep','bad':float('nan')})
        p,g=self.run_data(root,ext='.geojson')
        props=g['features'][0]['properties']
        self.assertEqual(props['___source_viz'],{'my':'value'})
        self.assertEqual(props['__source_viz'],'keep')
        self.assertEqual(props['__source_feature_id'],'old-id')
        self.assertIsNone(props['bad'])
    def test_time_category_and_quantiles(self):
        p,g=self.run_data('lng,lat,value,type,time\n1,2,0,A,2026-01-01T08:00:00+08:00\n3,4,100,B,2026-01-02T00:00:00Z\n5,6,,A,invalid\n',crs='wgs84',fields={'value':'value'})
        self.assertEqual(p['fields']['value']['quantiles']['p50'],50)
        self.assertEqual(p['fields']['value']['missing'],1)
        self.assertEqual(g['features'][0]['properties']['__viz']['time'],'2026-01-01T00:00:00Z')
        self.assertEqual(p['fields']['time']['time']['utcRange'],['2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'])
        self.assertIsNone(g['features'][2]['properties']['__viz']['time'])
    def test_ambiguous_fields_require_override(self):
        p,g=self.run_data('lng,longitude,lat\n1,3,2\n')
        self.assertEqual(p['status'],'needs_coordinates')
        p,g=self.run_data('lng,longitude,lat\n1,3,2\n',fields={'lng':'longitude'},crs='wgs84')
        self.assertEqual(g['features'][0]['geometry']['coordinates'],[3,2])
    def test_cli_and_malformed_header(self):
        path=self.root/'cli.csv'
        path.write_text('lng,lat\n1,2\n')
        result=subprocess.run([sys.executable,str(SCRIPT),str(path),'--crs','wgs84','--out-dir',str(self.root/'cli')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout)['status'],'ready')
        with self.assertRaises(ValueError):
            self.run_data('lng,lng,lat\n1,2,3\n')
    def test_output_never_overwrites_source(self):
        path=self.root/'normalized.geojson'
        text=json.dumps(self.fc([{'type':'Point','coordinates':[1,2]}]))
        path.write_text(text)
        with self.assertRaises(ValueError):
            m.profile(path,self.root)
        self.assertEqual(path.read_text(),text)
        self.assertFalse((self.root/'profile.json').exists())

if __name__=='__main__':
    unittest.main(verbosity=2)
