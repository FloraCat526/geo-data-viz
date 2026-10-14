"""Inline the public visualization module and its local dependencies into an HTML module."""
from pathlib import Path


def bundle_visualizations(root: Path) -> str:
    root = Path(root)
    parts = []
    sources = (
        ('assets/shared/basemap.mjs', None),
        ('assets/shared/color-scale.mjs', None),
        ('assets/recipes/gl-layers.mjs', "import {colorMapping} from '../shared/color-scale.mjs';\n"),
        ('assets/components/maplibre-effects.mjs', None),
        ('assets/components/point-glow.mjs', "import {mountRecipe,pointStyle} from '../recipes/gl-layers.mjs';\n"),
        ('assets/components/visualizations.mjs',
         "import {mountRecipe} from '../recipes/gl-layers.mjs';\n"
         "import {mountAdditivePoints} from './point-glow.mjs';\n"
         "import {FlightLayer,PulsePointLayer,RadarScanLayer,HexagonLayer} from './maplibre-effects.mjs';\n"),
    )
    for relative, dependency in sources:
        source = (root / relative).read_text(encoding='utf-8')
        if dependency:
            if source.count(dependency) != 1:
                raise ValueError(f'Visualization module dependency changed: {relative}')
            source = source.replace(dependency, '', 1)
        parts.append(source)
    combined = '\n'.join(parts)
    if '</script' in combined.lower():
        raise ValueError('Visualization code cannot be embedded safely in an inline module.')
    return combined
