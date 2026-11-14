import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {GeoStory} from './Composition.jsx';
import config from './project-config.json';
const Root=()=> <Composition id="GeoStory" component={GeoStory}
  durationInFrames={config.durationInFrames} fps={config.fps} width={config.width} height={config.height}/>;
registerRoot(Root);
