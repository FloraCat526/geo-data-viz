import {Config} from '@remotion/cli/config';
Config.setConcurrency(1);
Config.setChromiumOpenGlRenderer('angle');
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setDelayRenderTimeoutInMilliseconds(90000);
