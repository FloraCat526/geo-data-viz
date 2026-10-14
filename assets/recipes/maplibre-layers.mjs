// MapLibre GL JS: native layers and Promise-based cluster APIs.
import {prepareRecipe, mountRecipe as mountGLRecipe} from './gl-layers.mjs';
export {prepareRecipe};
export function mountRecipe(map, data, spec, options={}) {
  return mountGLRecipe(map, data, spec, {...options,provider:'maplibre'});
}
