import React from 'react';
import {Composition, registerRoot} from 'remotion';
import scene from './scene.json';
import config from './runtime-config.json';
import {SceneComposition} from './SceneComposition.jsx';

const Root = () => <Composition id="GeoScene" component={SceneComposition}
  durationInFrames={Math.max(2, Math.ceil(scene.duration * scene.fps))}
  fps={scene.fps} width={scene.width} height={scene.height}
  defaultProps={{scene, config}} />;

registerRoot(Root);
