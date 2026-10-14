#!/usr/bin/env python3
"""Generate MapLibre/OpenFreeMap by default; preserve explicit map provider selection."""
import argparse
import json
from pathlib import Path
from gl_html import build as build_gl
from build_errors import BuildError, read_object, diagnostic

PROVIDERS = ('maplibre','mapbox','google','baidu','amap','tencent')


def build(data_path, spec_path, output, provider=None, token_env=None, config_path=None):
    spec = read_object(spec_path, 'Spec')
    config = read_object(config_path, 'Authorized config') if config_path else {}
    if not isinstance(config, dict):
        raise ValueError('Authorized config must be a JSON object.')
    requested = provider or spec.get('provider')
    if provider and spec.get('provider') and provider != spec['provider']:
        raise BuildError('PROVIDER_CONFLICT', 'CLI and spec request different providers; resolve the request before generating.', 'Align CLI/spec with the user-selected provider.')
    # Only explicitly passed config/variable names are read. No environment or filesystem scan.
    selected = requested or config.get('provider') or ('mapbox' if token_env or config.get('mapboxToken') else 'maplibre')
    if not isinstance(selected, str) or selected not in PROVIDERS:
        raise BuildError('UNKNOWN_PROVIDER', 'Unknown provider; specify a supported provider name.', 'Use maplibre, mapbox, google, baidu, amap or tencent.')
    if selected not in ('maplibre','mapbox'):
        raise BuildError('PROVIDER_RECIPE_REQUIRED', f'Keep the requested {selected} provider: generate its native HTML using references/capabilities/{selected}.md.', 'Use the provider capability reference and reusable official-extension recipe where available; do not substitute providers.')
    if selected == 'mapbox' and config.get('provider') not in (None, 'mapbox'):
        raise BuildError('CONFIG_PROVIDER_CONFLICT', 'The authorized config belongs to a different provider.', 'Use the authorized configuration for the selected provider.')
    if selected == 'mapbox' and token_env and config.get('mapboxToken'):
        raise BuildError('TOKEN_SOURCE_CONFLICT', 'Choose one authorized Mapbox Token source: --token-env or --config.', 'Supply only one authorized credential source.')
    return build_gl(data_path,spec_path,output,token_env=token_env if selected=='mapbox' else None,
                    provider=selected,browser_token=config.get('mapboxToken') if selected=='mapbox' else None)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('data',type=Path);p.add_argument('--spec',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    p.add_argument('--provider',choices=PROVIDERS)
    p.add_argument('--token-env',help='Explicitly authorized Mapbox public-token environment variable')
    p.add_argument('--config',type=Path,help='Explicitly authorized local JSON: {"provider":"mapbox", "mapboxToken":"..."}')
    args=p.parse_args()
    try:
        result=build(args.data,args.spec,args.out,provider=args.provider,token_env=args.token_env,config_path=args.config)
    except (ValueError,OSError,KeyError,TypeError) as exc:
        p.exit(2, diagnostic(exc))
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    main()
