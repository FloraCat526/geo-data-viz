#!/usr/bin/env python3
"""Deterministic fixture checks, not an independent agent evaluation."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from profile_geo import profile
from build_mapbox_html import build


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True,type=Path);args=p.parse_args()
    base=Path(__file__).resolve().parent
    results=[]
    for case in json.loads((base/'cases.json').read_text()):
        dest=args.out/case['id'];config=case.get('profile',{})
        result=profile(base/case['fixture'],dest/'profile',**config)
        if 'status' in case.get('checks',{}):
            assert result['status']==case['checks']['status'],case['id']
        candidates={r['type']:r for r in result['recommendations']}
        for effect,status in case.get('checks',{}).get('candidates',{}).items():
            assert candidates[effect]['status']==status,(case['id'],effect)
        artifact=None
        if case.get('spec'):
            spec=dest/'spec.json';spec.write_text(json.dumps(case['spec'],ensure_ascii=False))
            artifact=build(dest/'profile/normalized.geojson',spec,dest/'map.html')
        results.append({'case':case['id'],'profileStatus':result['status'],'artifact':artifact,
                        'agentSelection':'not-run','realBasemap':'not-run'})
    args.out.mkdir(parents=True,exist_ok=True)
    (args.out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps({'cases':len(results),'html':sum(r['artifact'] is not None for r in results),'results':str(args.out/'results.json')}))

if __name__=='__main__':main()
