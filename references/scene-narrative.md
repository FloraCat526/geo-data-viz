# 场景镜头叙事

用户需要地点解说、旅行回顾、历史故事、镜头跟随或地理叙事视频时使用。普通地点分布和统计比较仍按[选型表](selection.md)选择数据组件；日期浏览用 `TravelItineraryLayer`，简洁事件时间轴用 `StoryTimelineLayer`。本组件把相机、路线进度、章节及媒体组织为一份可按时间采样的场景。

## 场景数据

输入为 `scene.json`，坐标是已核实 WGS84 `[经度,纬度]`。凭据单独放运行配置，不放场景数据。

```json
{
  "schemaVersion": 1,
  "metadata": {"dataCrs": "wgs84"},
  "title": "两个地点的故事",
  "provider": "maplibre",
  "theme": "dark",
  "basemap": {"type": "vector"},
  "attribution": "地点与连接由用户提供",
  "duration": 12,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "locations": [
    {"id": "a", "name": "出发地点", "coordinates": [103.85, 1.29]},
    {"id": "b", "name": "到达地点", "coordinates": [103.87, 1.3]}
  ],
  "routes": [
    {"id": "connection", "kind": "schematic", "coordinates": [[103.85, 1.29], [103.87, 1.3]]}
  ],
  "chapters": [
    {
      "id": "overview", "start": 0, "end": 4,
      "title": "路线概览", "text": "两个地点之间的示意连接",
      "camera": {"from": {"center": [103.86, 1.295], "zoom": 12, "pitch": 0, "bearing": 0}}
    },
    {
      "id": "arrival", "start": 4, "end": 12,
      "title": "从出发到到达", "locationId": "b", "routeId": "connection",
      "routeProgress": {"from": 0, "to": 1},
      "camera": {
        "followRoute": true,
        "from": {"center": [103.85, 1.29], "zoom": 13, "pitch": 35, "bearing": 0},
        "to": {"center": [103.87, 1.3], "zoom": 14, "pitch": 45, "bearing": 20}
      }
    }
  ],
  "audio": []
}
```

| 字段 | 含义 |
| --- | --- |
| `theme`、`basemap`、`attribution` | theme 为 dark（默认）/light；basemap 为 GL 目标的[背景配置](basemaps.md)，随场景保存且需实际资源；attribution 为应保留的来源署名文本。Cesium/static 的背景放目标运行配置中。 |
| `duration`、`fps`、`width`、`height` | 默认 20 秒、30 FPS、1920×1080；时长 0.1–3600 秒，FPS 为 1–120 整数，宽高 100–7680 整数；不代表业务事件实际耗时。 |
| `locations[]` | 稳定 `id`、`name`、WGS84 `coordinates`；可有 `description`、`image`。图片来自用户或已授权文件/URL。 |
| `routes[]` | 稳定 `id` 与完整 `coordinates`；`kind:'provided'` 为用户提供的真实几何，`'schematic'` 为明确标识的地点连接示意。 |
| `chapters[]` | `id`、秒数 `start/end`，按顺序连续覆盖 `0..duration`；可有 `title/text`、`image`、`locationId/routeId`。关联 ID 必须存在。 |
| `camera.from/to` | 必填 `center`；`zoom` 默认 8（0–22），`pitch` 默认 0（0–85°），`bearing` 默认 0（−360–360°）；`to` 省略表示静止镜头。Cesium `height` 默认 20000 米（1–50000000），不是路线点高程；静态图 pitch 必须为 0。 |
| `camera.followRoute` | 可选布尔，默认 false；true 需本章 `routeId`，相机中心沿这条已提供/明确示意的几何随揭示进度移动，zoom/pitch/bearing 仍按 from/to 编排。 |
| `routeProgress.from/to` | 本章路线揭示进度，0–1；保留用户路线顶点和方向，不能补算道路。 |
| `audio[]` | 已有音频 `src`、起始秒数 `start`（默认 0）、结束 `end`（默认 duration）、`volume`（默认 1，0–1）；不调用配音/TTS 服务生成旁白。 |

静态地图必须有明确的地理范围，当前场景不自动将无地理参考的插画转换为地图。经度跨日期线、极区或复杂摄影机插值需按目标引擎确认；不能用本地相机插值替代真实轨迹数据。

所有 `id` 以英文字母开头，只含字母、数字、下划线与连字符，在各自集合中唯一。当前路线不能跨日期线，须先按原始数据分段；MapLibre/Mapbox/MapTiler/静态场景纬度限制在 ±85°，Cesium 可到 ±90°。

## HTML 入口

```bash
python3 "SKILL_DIR/scripts/build_scene_html.py" "WORK/scene.json" \
  --out "WORK/story.html"
```

`--provider maplibre|mapbox|maptiler|cesium|static` 指定目标，`--config FILE` 提供本任务授权的运行配置，`--token-env NAME` 读取明确授权的变量；`--theme dark|light` 覆盖场景主题。已有输出明确传 `--overwrite`。默认 MapLibre + OpenFreeMap；组件数据和脚本内嵌，SDK、瓦片与远程媒体仍可能联网。本地图片与音频仅从 scene.json 同目录或明确的 `--media-root DIR` 复制；不读取越界文件或符号链接目标，需连同生成的媒体目录交付。

| 目标 | 运行配置与表达 |
| --- | --- |
| `maplibre` | 默认矢量 OpenFreeMap；按[底图配置](basemaps.md)可加载授权影像或 DEM。原生 line/circle/symbol 配合按时间设置相机。 |
| `mapbox` | `config.token` 为授权 `pk.` 浏览器公共 Mapbox Token（拒绝 secret Token），可有 `style`/`basemap`；由 Mapbox SDK 绘制路线、地点与相机。 |
| `maptiler` | `config.apiKey` 为授权 Key，可有 `style`/`basemap`；缺省 dataviz/dataviz-dark，影像/地形需明确资源，按[MapTiler](capabilities/maptiler.md)核对。 |
| `cesium` | [Cesium](capabilities/cesium.md) Viewer 与镜头；根据配置加载真实影像、地形与 3D Tiles，保持其资源署名。 |
| `static` | `config:{imageUrl,geoBounds:[west,south,east,north],projection:'mercator',attribution}`；基于地理范围与投影映射用户地点和路线，二维相机/叙事叠加。 |

GL 目标共用 `config.style`、`basemap`、`interactive`、`timeout`，MapLibre 不需 Token。Cesium 当前配置为 `imagery:{url,attribution}`（XYZ 模板）、`terrain:{url,attribution}`（Cesium 格式高程）或 `terrain:{world:true}`（需 `ionToken`），以及 `tiles3d:{url}`。没有配置高程时只有椭球面，没有默认影像或城市模型。不要将 raster-dem TileJSON 当作 CesiumTerrainProvider URL。

HTML 默认使用场景 `basemap`，运行配置 `config.basemap` 可显式覆盖；视频工程保留同一背景配置。地图凭据只放运行配置。`scene.attribution` 与媒体/地图资源来源在 HTML 与视频中保留，图商自动版权标识也仍需可见。

交互式 GL 地形场景在程序切换相机时保留上一帧完整画面，等当前影像、DEM 与地点标签完成绘制后再显示新画面；资源失败时保留完整帧并报告错误。支持相机高程的 GL 引擎在 DEM 更新后按已加载高程刷新一次瓦片覆盖，并等待新绘制，避免提前显示缺图帧。该保护不改变源数据或镜头路径，也不替代视频的逐帧验收。固定范围的山地飞越可在播放前有限采样相机视角，在同一地图内预加载并复用瓦片缓存；避免加载会隐藏的矢量图层，不应另建第二个 WebGL 地图或逐帧批量下载瓦片。

静态图片的 `projection` 为 `mercator`（默认）或 `equirectangular`，必须与图片实际投影吻合；Mercator 的范围纬度限制在 ±85.051129°，其他投影或来源未知的截图不能猜测定位。`geoBounds` 不跨日期线，`baseZoom` 可设初始图片比例基准，只有平移、缩放和方位旋转。明确选择商业服务但缺凭据时报告具体配置缺项，不静默换图商。

## 从已有故事或行程生成场景

已通过 `prepare_story.py` / `prepare_itinerary.py` 规范化的 WGS84 数据，可转换为可编辑镜头计划：

```bash
python3 "SKILL_DIR/scripts/prepare_scene.py" "WORK/story.json" \
  --out "WORK/scene.json" --chapter-seconds 4
python3 "SKILL_DIR/scripts/build_scene_html.py" "WORK/scene.json" \
  --out "WORK/scene.html"
```

输入也可换成 `WORK/itinerary.json`。`prepare_scene.py` 保留事件顺序与 `routeFromPrevious` 的原始顶点；旅游的整日 `day.route` 完整放到当日路线概览章节，再逐站讲解，不按最近地点擅自切割几何。默认缺少真实几何时只展示地点与镜头，不添加路线；用户明确需要示意连接才加 `--schematic-links`，生成的连接标为 schematic。`--chapter-seconds` 默认 4、范围 1–60 秒，是叙事停留时间。`--provider` 可明确目标引擎。

输出镜头参数是可编辑的起点，不代表已完成视觉设计；根据数据范围、章节节奏和用户目标调整 `camera`、路线揭示、停留及媒体。明确需要 MP4 时继续：

```bash
python3 "SKILL_DIR/scripts/build_scene_video.py" "WORK/scene.json" \
  --out-dir "WORK/video-project" --install --render
```

安装与实际渲染条件见[视频输出](video-export.md)。先检查生成场景是否保留输入路径和正确路线语义，再验收地图/视频。

## JavaScript 接口

```js
import {createSceneTarget, SceneNarrativeViz} from './assets/components/scene-narrative.mjs';
const target = await createSceneTarget(host, {
  provider: 'maplibre', config: {}, theme: 'dark'
});
const scene = new SceneNarrativeViz(target, {
  data: sceneData, provider: 'maplibre', theme: 'dark',
  id: 'geo-scene', onChange: state => updateCaption(state.chapter)
});
await scene.ready;
await scene.seek(5);
```

`normalizeScene(data,{provider?})` 校验规范化输入；`sampleScene(data,timeSeconds)` 返回 `{time,progress,chapter,chapterProgress,location,route,camera,routeProgress,routeStates}`，用于共享时间状态；`routeStates` 保留已出现路线的揭示进度。`createSceneTarget(container,{provider,config,basemap,theme,interactive,libraries})` 创建目标，`libraries` 用于注入已加载 SDK；视频设 `interactive:false`。

`SceneNarrativeViz` 构造参数为 `{data,provider,theme:'dark',id:'geo-scene',onChange}`；提供 `ready`、`seek(seconds)`、`play()`、`pause()`、`setData(data)`、`setTheme(theme)`、`inspect()`、`destroy()`。`seek` 异步更新目标并返回当前采样状态；手动播放与视频均使用同一场景数据。视频按帧调用 `seek(frame/fps)`，不以真实时钟运行 `play()`。[视频工程与导出](video-export.md)。

## 编排与验收

旅游可采用“全程概览 → 每日章节 → 地点停留 → 全程回顾”；历史故事可按事件顺序设置停留、路线推进和章节说明。章节文本来自用户数据与明确提供的故事内容；摄影机路线只是取景安排。确保地点标注、文字和照片不遮挡主路线，远程媒体缺失时保留明确可检查的状态。

分别检查开头、中段、末尾与章节切点，相同时间重复采样是否一致，真实路径与示意线是否可辨，字幕/图片/音频是否同步，地图版权是否保留。脚本或模拟 SDK 测试不等于真实影像、DEM、Key 与最终视频已经验收。

实现参考：[Remotion 地图动画](https://www.remotion.dev/docs/maps)、[官方地图 Skill](https://github.com/remotion-dev/skills/blob/main/skills/remotion-maps/SKILL.md)。本项目场景数据和 API 是自己的封装，不是 Remotion 或图商的同名类。

路线跟随只根据用户路线控制经纬度，相机高度由章节明确编排；当前不自动采样 DEM 保持离地高度，也不提供避障。山地和三维镜头须逐帧核对地形遮挡。GL/Cesium 的 `timeout` 可配置为 1000–300000 毫秒，用于等待真实地图资源；超时不会以空白或缺资源画面继续导出。

GL 目标可向 `createSceneTarget` 传 `initialCamera`（与章节相机相同的 center/zoom/pitch/bearing 结构），在首个镜头位置初始化，减少无关全球瓦片请求。HTML 与视频模板已使用场景首镜头；静态图与 Cesium 在 `seek(0)` 时设置相机。
