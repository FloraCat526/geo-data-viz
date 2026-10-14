#!/usr/bin/env python3
"""Create a standalone Remotion project from an uploaded, validated scene plan."""
import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from build_errors import BuildError, diagnostic, read_object
from scene_plan import validate_scene, resolve_scene_config

ROOT = Path(__file__).resolve().parents[1]


def copy_media(scene, config, source_root, public):
    """Copy only explicitly referenced local media within the supplied folder."""
    source_root = Path(source_root).resolve()
    copied = {}

    def asset(value):
        parsed = urlparse(value)
        if parsed.scheme in ('http', 'https'):
            return value
        if parsed.scheme or parsed.netloc:
            raise BuildError('MEDIA_URL', 'Unsupported local media reference.',
                             'Use HTTPS or a relative file within the media folder.')
        source = (source_root / value).resolve()
        if source_root not in source.parents or not source.is_file():
            raise BuildError('MEDIA_FILE', 'A referenced local media file is missing or outside the media folder.',
                             'Place referenced media beside the scene, or select --media-root explicitly.')
        if source not in copied:
            name = f'media/{len(copied):03d}-{source.name}'
            target = public / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            copied[source] = name
        return copied[source]

    for location in scene.get('locations', []):
        if location.get('image'):
            location['image'] = asset(location['image'])
    for chapter in scene['chapters']:
        if chapter.get('image'):
            chapter['image'] = asset(chapter['image'])
    for track in scene.get('audio', []):
        track['src'] = asset(track['src'])
    if scene['provider'] == 'static':
        config['imageUrl'] = asset(config['imageUrl'])
    return len(copied)


def build(data_path, out_dir, *, provider=None, config_path=None, token_env=None,
          media_root=None):
    data_path, out_dir = Path(data_path), Path(out_dir)
    scene = validate_scene(read_object(data_path, 'Scene'), provider=provider)
    config = resolve_scene_config(scene['provider'], config_path=config_path, token_env=token_env)
    if scene['width'] % 2 or scene['height'] % 2:
        raise BuildError('VIDEO_DIMENSIONS', 'H.264 video width and height must both be even.',
                         'Choose dimensions such as 1920 × 1080 or 1280 × 720.')
    if out_dir.exists():
        raise BuildError('OUTPUT_EXISTS', 'Video project output already exists.',
                         'Choose a new directory to preserve existing work.')
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.geo-video-', dir=out_dir.parent) as temporary:
        stage = Path(temporary) / 'project'
        shutil.copytree(ROOT / 'assets/video', stage)
        shutil.copyfile(ROOT / 'LICENSE', stage / 'LICENSE')
        (stage / 'gitignore.txt').rename(stage / '.gitignore')
        public = stage / 'public'
        public.mkdir()
        count = copy_media(scene, config, media_root or data_path.parent, public)
        runtime = stage / 'src/runtime'
        for relative in ('components/scene-narrative.mjs', 'shared/basemap.mjs'):
            target = runtime / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'assets' / relative, target)
        (stage / 'src/scene.json').write_text(json.dumps(scene, ensure_ascii=False, allow_nan=False), encoding='utf-8')
        (stage / 'src/runtime-config.json').write_text(json.dumps(config, ensure_ascii=False, allow_nan=False), encoding='utf-8')
        # Browser public tokens are needed locally, but the generated project is
        # not a distributable key-bearing artifact.
        if config:
            os.chmod(stage / 'src/runtime-config.json', 0o600)
        manifest = {'schemaVersion':1, 'provider':scene['provider'], 'duration':scene['duration'],
                    'fps':scene['fps'], 'width':scene['width'], 'height':scene['height'],
                    'localMedia':count, 'video':'out/story.mp4', 'verification':'pending-render'}
        (stage / 'video-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        stage.rename(out_dir)
    return {'project':str(out_dir.resolve()), **manifest,
            'commands':['npm install', 'npm run studio', 'npm run render']}


def run_project(out_dir, *, install=False, render=False, browser_executable=None):
    out_dir = Path(out_dir).resolve()
    npm = shutil.which('npm')
    if not npm:
        raise BuildError('NODE_REQUIRED', 'npm is unavailable for optional video rendering.',
                         'Install Node.js 20+; the generated project remains available.')
    if install:
        subprocess.run([npm, 'install', '--no-audit', '--no-fund'], cwd=out_dir, check=True)
    if render:
        if not (out_dir / 'node_modules/.bin/remotion').is_file():
            raise BuildError('VIDEO_DEPENDENCIES', 'The video project dependencies are not installed.',
                             'Run npm install in the generated project, or use --install --render.')
        args = [npm, 'run', 'render']
        if browser_executable:
            args.extend(['--', f'--browser-executable={Path(browser_executable).resolve()}'])
        subprocess.run(args, cwd=out_dir, check=True)
        output = out_dir / 'out/story.mp4'
        if not output.is_file() or output.stat().st_size == 0:
            raise BuildError('VIDEO_OUTPUT', 'The renderer did not produce an MP4.',
                             'Inspect the render diagnostics in the generated project.')
        path = out_dir / 'video-manifest.json'
        manifest = json.loads(path.read_text())
        manifest['verification'] = 'rendered-awaiting-visual-review'
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        return str(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', type=Path)
    parser.add_argument('--out-dir', required=True, type=Path)
    parser.add_argument('--provider', choices=('maplibre', 'mapbox', 'maptiler', 'cesium', 'static'))
    parser.add_argument('--config', type=Path)
    parser.add_argument('--token-env')
    parser.add_argument('--media-root', type=Path)
    parser.add_argument('--install', action='store_true', help='Install the optional video dependencies in the output project')
    parser.add_argument('--render', action='store_true', help='Render the output project to MP4')
    parser.add_argument('--browser-executable', type=Path)
    args = parser.parse_args()
    try:
        result = build(args.data, args.out_dir, provider=args.provider, config_path=args.config,
                       token_env=args.token_env, media_root=args.media_root)
        if args.install or args.render:
            video = run_project(args.out_dir, install=args.install, render=args.render,
                                browser_executable=args.browser_executable)
            if video:
                result['video'] = video
                result['verification'] = 'rendered-awaiting-visual-review'
    except (ValueError, TypeError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(2, diagnostic(exc))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
