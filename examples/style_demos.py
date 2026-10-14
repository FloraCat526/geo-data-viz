"""Keep the bundled demo panels compact without changing exported map templates."""
import re
from pathlib import Path

LINK = '<link rel="stylesheet" href="../assets/demo-panels.css">'
STANDARD = {'housing', 'point-glow', 'imagery'}


def apply_demo_styles(root: Path, *, page_names=None):
    for page in (root / 'maps').glob('*.html'):
        name = page.stem
        if page_names is not None and name not in page_names:
            continue
        kind = ('standard' if name in STANDARD else
                'globe' if name.startswith('globe-') else
                'itinerary' if name == 'travel-itinerary' else
                'story' if name == 'story-timeline' else 'extended')
        document = page.read_text(encoding='utf-8')
        if name == 'globe-earthquakes':
            document = re.sub(r'<div class="rule"></div><p class="note">[^<]*</p>', '', document, count=1)
            # Leave the detail slot available for picked data, without tutorial copy.
            document = document.replace('点击地球上的数据查看详情', '')
            document = document.replace("status.textContent='拖动旋转 · 滚轮缩放 · 点击查看'", "status.textContent=''")
        # Keep compact styling scoped to bundled pages, rather than export templates.
        document = re.sub(r'(<html\b[^>]*?)\sdata-demo-kind="[^"]*"', r'\1', document, count=1)
        document = re.sub(r'<html\b', f'<html data-demo-kind="{kind}"', document, count=1)
        if LINK not in document:
            if '</head>' in document:
                document = document.replace('</head>', LINK + '</head>', 1)
            else:
                document = document.replace('</style>', '</style>' + LINK, 1)
        page.write_text(document, encoding='utf-8')


if __name__ == '__main__':
    apply_demo_styles(Path(__file__).resolve().parent)
