"""Rebuild bundled maps from checked-in normalized data; Python stdlib only."""
import sys
import tempfile
from shutil import copyfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'scripts'))
from build_visual_html import build
from build_itinerary_html import build as build_itinerary
from build_story_html import build as build_story
from prepare_itinerary import build as prepare_itinerary
from style_demos import apply_demo_styles

def main():
    (ROOT/'assets').mkdir(exist_ok=True)
    copyfile(ROOT.parent/'assets/brand/geo-data-viz.png', ROOT/'assets/geo-data-viz.png')
    (ROOT/'maps').mkdir(exist_ok=True)
    for name in ('housing',):
        data=name
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)/'map.html'
            build(ROOT/f'data/{data}.geojson',ROOT/f'specs/{name}.json',output)
            html=output.read_text()
            if name=='housing':
                html=html.replace("'line-color':light?'#334155':'#cbd5e1','line-width':0.7", "'line-color':light?'#334155':'#cbd5e1','line-width':['interpolate',['linear'],['zoom'],9,0.12,12,0.4,15,0.8],'line-opacity':0.45")
            # A gallery iframe needs the compact drawer before a full desktop map does.
            html=html.replace('max-width:900px','max-width:1100px').replace('innerWidth<=900','innerWidth<=1100')
            html=html.replace('statistics();\nasync function start()', "if(window.self!==window.top){document.querySelector('.panel').dataset.collapsed='true';el('panel-toggle').textContent='展开';el('panel-toggle').setAttribute('aria-expanded','false');}\nstatistics();\nasync function start()")
            (ROOT/f'maps/{name}.html').write_text(html)
        print(f'Built examples/maps/{name}.html')
    from build_extended import main as build_extended
    build_extended()
    prepare_itinerary(ROOT/'data/travel-itinerary-stops.csv', ROOT/'data/travel-itinerary.json',
                      crs='wgs84', day_field='date', id_field='id', time_field='time',
                      tag_field='tag', summary_field='summary',
                      title='新加坡两日漫游 · 示例行程', overwrite=True)
    build_itinerary(ROOT/'data/travel-itinerary.json', ROOT/'maps/travel-itinerary.html', overwrite=True)
    print('Built examples/maps/travel-itinerary.html')
    build_story(ROOT/'data/story-timeline.json', ROOT/'maps/story-timeline.html', overwrite=True)
    print('Built examples/maps/story-timeline.html')
    from build_mountain_flyover import build_demo as build_mountain_flyover
    build_mountain_flyover()
    print('Built examples/maps/mountain-flyover.html')
    apply_demo_styles(ROOT)
if __name__=='__main__':main()
