// Backward-compatible Mapbox entrypoint.
import {prepareRecipe, mountRecipe as mountGLRecipe} from './gl-layers.mjs';
export {prepareRecipe};
export function mountRecipe(map, data, spec, options={}) {
  return mountGLRecipe(map, data, spec, {...options,provider:'mapbox'});
}
