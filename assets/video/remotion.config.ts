import {Config} from '@remotion/cli/config';
import runtimeConfig from './src/runtime-config.json';

Config.setConcurrency(1);
Config.setChromiumOpenGlRenderer('angle');
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setDelayRenderTimeoutInMilliseconds(Math.max(90000,(runtimeConfig.timeout ?? 30000)+30000));
