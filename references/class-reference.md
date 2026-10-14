# Geo Data Viz 类参考手册

本文按项目公开的三类能力列出**19 个实际导出的类、参数和方法**：13 个可视化组件、3 个场景叙事组件、3 个地球模式组件。类签名以当前源码为准；这里的 `spec` 指 JavaScript 组件构造参数，不等同于 HTML 生成器使用的完整页面配置 JSON。选择效果前先按[选型表](selection.md)确认字段和聚合含义；生成单文件 HTML 则使用[生成指南](generation.md)。

## 1. 可视化组件：平面地图

源码：[visualizations.mjs](../assets/components/visualizations.mjs)。这些类接收地图实例；前九类可等待样式就绪，后四类要求 MapLibre 样式已加载。`PointViz` 至 `ExtrusionViz` 支持 **MapLibre / Mapbox**，默认使用所选图商的 GeoJSON source 和原生样式层；散点可选的加法叠加由 deck.gl 补充，原生源保留拾取与选中；`FlyLineViz`、`RippleViz`、`RadarScanViz`、`HexagonViz` 当前仅支持 **MapLibre**。飞线另由 deck.gl 绘制。类名是本项目接口，**不是**高德、百度、腾讯或 Google SDK 的同名类。

### 统一构造与公共方法

```ts
new PointViz(map, {
  data,                    // 必填，符合该类几何与字段要求的数据
  provider: 'maplibre',    // 默认 maplibre；前九类也可选 mapbox
  id: 'geo-points',        // 可选，图层/资源命名空间，不得与已有组件冲突
  theme: 'dark',           // dark | light；默认 dark
  spec: {},               // 效果专属视觉参数，默认 {}
  onPick: result => {},   // 可选，点击回调
  onError: error => {}    // 可选；原生点线面图层的异步错误回调
});
// 或 createViz(map, {effect: 'points', data, provider, id, theme, spec, onPick, onError})
```

`data`、`provider`、`id`、`theme`、`onPick`、`onError` 是顶层参数；**其余视觉参数必须放进 `spec`**，放在顶层会报错。`spec.effect` 若填写，必须与所选类的 effect 相同。底层专有效果的构造错误会同步抛出，不能只依赖 `onError`。所有平面组件提供：

| 成员 | 行为 |
| --- | --- |
| `ready: Promise<boolean>` | 原生点线面层等待样式/资源就绪，加法散点同时等待 deck 初始化；四个专有效果构造完成后为已解决的 `true`。 |
| `setData(data)` | 更新同类输入；原有筛选条件仍适用。 |
| `setFilter(predicate)` | 回调收到原始 Feature 或 OD 行；返回保留的输入记录数。 |
| `setTheme('dark' \| 'light')` | 只更新数据层，不替调用方切换底图或页面主题。 |
| `inspect()` | 返回当前 effect、数量、渲染归属等状态；具体字段随类而异。 |
| `destroy()` | 移除自身图层、数据源、监听器或 deck.gl 叠加层；先销毁组件再销毁地图。 |
| `legend` | 原生点线面类返回生成的图例；专有效果无统一图例时为 `null`。 |

`onPick` 收到 `{effect, kind, items, count}`。普通点线面返回原始要素；聚合点还可通过事件中的 `loadLeaves/expand` 取成员或展开；蜂窝返回的是**聚合后的网格**；飞线返回 OD 行。回调使用安全文本渲染，不把用户字段直接拼进 HTML。

前九类的 `data` 为**非空** WGS84 GeoJSON FeatureCollection，要求 `metadata.dataCrs: 'wgs84'`、每条 Feature 的稳定且唯一的字符串 `id`。用于指标或类别的字段位于 `properties.__viz.value`、`properties.__viz.category`；数值须为有限数，缺失用 `null`。几何不能混用：点类用 Point，线类用 LineString/MultiLineString，面类用 Polygon/MultiPolygon。下表中“指标/单位”是正确解释画面的业务要求；代码只对其中部分约束做强校验。

### 类与 `spec` 参数

| 类 / `effect` | 必需数据与用途 | 可用 `spec` 参数及默认行为 |
| --- | --- | --- |
| `PointViz` / `points` | Point；位置分布。 | `colorBy: 'constant'` 默认固定色；可设置 `color`、`missingColor`，或明确改为分类/数值着色；支持下述散点外观参数。 |
| `CategoryPointsViz` / `category-points` | Point + `__viz.category`；类别比较。 | `colorBy: 'category'` 固定为分类着色；可用分类 `colorScale` 指定类别和颜色；支持散点外观参数。 |
| `MetricPointsViz` / `point-color` | Point + `__viz.value` + 可解释单位；数值/正负变化。 | `colorBy: 'value'`；可用连续或阈值 `colorScale`、`unit`、`missingColor`。圆点等大；支持散点外观参数。 |
| `BubbleViz` / `bubble` | Point + 可比较的 `__viz.value` + 单位；规模比较。 | `maxRadius: 28` 像素，半径按数值平方根映射；`unit`、`bubbleEntrance: false`（一次性入场动效）。负值须 `sizeMode: 'absolute'` 且以数值着色保留符号。零值和缺失分别显示。 |
| `ClusterViz` / `cluster` | Point；密集位置的逐条浏览。 | 聚合源当前固定 `clusterRadius: 50` 像素、`clusterMaxZoom: 14`；圆内数字是**记录数**，没有公开的这两个调节参数。 |
| `HeatmapViz` / `heatmap` | Point；事件密度或非负空间贡献。 | **必填** `weight: 'count' \| 'value'`；`value` 模式需要非负数值和单位。`heatRadius: 22` 像素，`heatIntensity` 默认按全量数据自动校准；显式值须在 `(0, 10]`。 |
| `LineViz` / `line` | LineString/MultiLineString；已有路径或线状分布。 | `lineWidth: 3` 像素，可用 `colorBy` 与 `colorScale` 着色。不会计算道路路线。 |
| `ChoroplethViz` / `fill` | Polygon/MultiPolygon；区域差异。 | `colorBy: 'value'` 默认按指标设色；无指标时明确设为 `'constant'` 或 `'category'`。可用 `colorScale`、`unit`、`missingColor`。 |
| `ExtrusionViz` / `extrusion` | Polygon/MultiPolygon + 非负 `__viz.value`；指标高度。 | **必填** `heightScale > 0`（每单位指标对应米数）和 `unit`；可用 `colorScale`。高度不自动等于真实建筑高度。 |
| `FlyLineViz` / `flight` | 唯一 ID 的 WGS84 OD 行数组；起终点连接。 | **必填** `deck: window.deck`（预先加载 deck.gl）；`duration: 6500` 毫秒、`trailLength: 0.2`、`heightRatio: 0.12`。行可带 `color: '#RRGGBB'`，默认 `#38bdf8`。提供 `pause()/play()`。 |
| `RippleViz` / `pulse` | WGS84 Point FeatureCollection；持续强调地点。 | `color: '#38bdf8'`（或 MapLibre 原生颜色表达式）、`radius: 4` 像素（有限数，范围 `(0, 100]`）；提供 `pause()/play()`。光晕不表示真实影响范围。 |
| `RadarScanViz` / `radar` | WGS84 Point FeatureCollection；贴地旋转的渐隐扇形面扫描。 | `radiusMeters: 18000`（100–100000 米）、`period: 6000` 毫秒（2000–30000）、`sweepAngle: 100` 度（10–180）、`opacity: 0.58`（0–1，扇形前缘峰值透明度）、`color: '#38bdf8'`；提供 `pause()/play()`。半径不自动代表真实覆盖。 |
| `HexagonViz` / `hexagon` | WGS84 Point FeatureCollection；局部区域网格汇总。 | `cellSize: 500` 米，六边形**边长**，范围 10–50000；`aggregation: 'count' \| 'sum' \| 'mean'`，默认 count；后两者必填 `valueField`，只使用非负有限值；`mode: 'flat' \| '3d'`，默认 flat；`heightScale: 10`。另提供 `setMode(mode)`、`setCellSize(metres)`。 |

通用颜色参数：`colorBy` 可选 `constant`、`category`、`value`；`color` / `missingColor` 为 `#RRGGBB`。`colorScale` 可为 `categorical`（`domain` 与 `colors` 等长）、`continuous`（数值 `domain` 与 `colors` 等长）或 `threshold`（`breaks` 升序，`colors` 比 breaks 多一个）。类别超过默认 12 色时需显式给足颜色。色域按全量数据确定，筛选不重算。`maxRadius`、`heatRadius`、`lineWidth` 均须为 `(0, 100]` 的有限像素值；各项只在相关 effect 中有视觉作用。[图层参数与色阶](mapbox-recipes.md)提供更多细节。

飞线 OD 行示例：`{id:'SIN-ROM', source:[103.994,1.350], target:[12.251,41.800], color:'#a78bfa', name:'Rome'}`。坐标顺序均为 `[经度, 纬度]`；MapLibre 专有效果要求纬度在 Mercator 支持范围内（`±85°`）。蜂窝仅适合局部区域，不能当作全球等面积网格；3D 高度是聚合值乘 `heightScale`。[专有效果限制](maplibre-effects.md)。

### 散点外观：光晕与颜色叠加

`PointViz`、`CategoryPointsViz`、`MetricPointsViz` 共用以下 `spec` 参数；不能把整套散点外观配置套到其他组件。雷达也有 `opacity`，但它表示扇形面的峰值透明度，语义与下面的点透明度不同。

| 参数 | 默认值 | 含义与范围 |
| --- | --- | --- |
| `pointRadius` | `5` | 圆点半径，CSS 像素；有限数 `(0, 100]`。支持小数。 |
| `opacity` | `1` | 核心透明度，有限数 `[0, 1]`；光晕透明度也乘此值。 |
| `glow` | `false` | 是否增加柔和光晕；布尔值。开启后去除普通点的描边。 |
| `glowRadius` | `6` | 光晕在核心半径外增加的 CSS 像素，有限数 `(0, 100]`。不表示地理覆盖范围。 |
| `glowIntensity` | `0.18` | 光晕强度，有限数 `[0, 1]`。 |
| `blendMode` | `'normal'` | `'normal'`：地图原生圆图层；`'additive'`：deck.gl 加法混合，重叠颜色累积变亮。 |

`normal` 的点和光晕均使用所选 MapLibre / Mapbox 的原生圆图层；`additive` 须在 JavaScript 页面中先加载 `deck.gl@9.1.14`（全局 `window.deck`，包含 `MapboxOverlay/ScatterplotLayer`），以共享地图 WebGL2 上下文的补充层绘制，原生透明圆保留拾取、选中与筛选。HTML 生成入口会在本次 spec 或 alternatives 启用 additive 时按需加载该依赖；普通模式不加载。`ready` 包括 deck 初始化，`inspect()` 如实返回 `rendererOwner:'hybrid'`、补充原因和图层注册状态。点的颜色和指标色域仍按全量数据确定。

```js
const points = new PointViz(map, {data: normalized, spec: {
  color: '#38bdf8', pointRadius: 1.5, opacity: 0.3,
  glow: true, glowRadius: 4, glowIntensity: 0.15, blendMode: 'additive'
}});
await points.ready;
```

加法叠加适合深色底图上的位置纹理，亮度反映屏幕重叠，随缩放、点大小和透明度改变；不是精确密度测量。多类别混色会削弱类别可读性，数值设色叠加也可能改变原有颜色含义：比较类别或单点指标时优先 normal，或提供筛选。加法模式当前限 Mercator 范围（纬度 `±85.051129°`）；百万级输入须单独验证加载、内存与交互，不承诺统一点数上限。原生 GeoJSON 拾取仍有开销，二进制 GPU 属性不等于整个导出流程已完成海量数据优化。

### 工厂与同数据切换

```js
import {createViz, createVizSwitcher, VIZ_COMPONENTS} from './assets/components/visualizations.mjs';

const layer = createViz(map, {
  effect: 'bubble', data: normalized, provider: 'maplibre',
  spec: {unit: '处', maxRadius: 28}, onPick: ({items}) => console.log(items)
});
await layer.ready;
layer.destroy();

const switcher = createVizSwitcher(map, normalized, {
  provider: 'maplibre', prefix: 'geo-viz',
  onPick: ({items}) => console.log(items), onError: error => console.error(error),
  timeoutMs: 15000
});
await switcher.show({effect: 'heatmap', weight: 'count', theme: 'dark'});
switcher.active?.setFilter(feature => true);
switcher.destroy();
```

`VIZ_COMPONENTS` 是 effect → 类的只读注册表。`createViz()` 负责按 effect 实例化；`createVizSwitcher()` 用同一份**已规范化数据**切换前九种 spec 型效果，等待新层就绪再移除旧层。它不会把 Point 自动变成 Polygon，也不会为飞线自动补 OD 数据或 deck.gl。`show(spec)` 的颜色、权重、单位等视觉字段直接写在传入的 `spec` 对象中；切换器内部再将其传给类的 `spec` 参数。飞线、呼吸点、雷达与蜂窝也可用 `createViz()`，但跨数据结构的切换由页面自行管理。

## 2. 场景叙事组件

旅游与故事时间轴源码分别在 [travel-itinerary.mjs](../assets/components/travel-itinerary.mjs) 与 [story-timeline.mjs](../assets/components/story-timeline.mjs)，只支持 MapLibre 原生点线/文字图层；新增镜头叙事在 [scene-narrative.mjs](../assets/components/scene-narrative.mjs)，支持按目标调用 MapLibre、Mapbox、MapTiler、Cesium 或静态地图。三者**不是**平面组件的子类，也不进入 `VIZ_COMPONENTS`。旧两类先加载地图样式再实例化；新类通过 `ready` 等待目标就绪。文字详情由页面安全显示。

| 类 | 构造参数 | 方法与回调 |
| --- | --- | --- |
| `TravelItineraryLayer` | `new TravelItineraryLayer(map, {data, provider:'maplibre', id:'geo-itinerary', padding:{top:110,right:420,bottom:90,left:60}, onSelect})`。`data` 必填。 | `setDay(dayId \| null, {fit:true})`：`null` 总览；`selectStop(stopId, {fly:true})` 返回站点并调用 `onSelect(stop)`；`fit()`、`inspect()`、`destroy()`。 |
| `StoryTimelineLayer` | `new StoryTimelineLayer(map, {data, provider:'maplibre', id:'geo-story', padding:{top:95,right:390,bottom:145,left:70}, onChange, onSelect})`。`data` 必填。 | `setProgress(value)`：有限数值，按 0–1 截取；`seekEvent(index, {select:false})` 返回事件，`select:true` 时调用 `onSelect(event)`；`play({duration:14000})`、`pause()`、`fit()`、`inspect()`、`destroy()`。`onChange({progress,eventIndex,event,position,playing})` 随进度更新。 |
| `SceneNarrativeViz` | `new SceneNarrativeViz(target, {data, provider, theme:'dark', id:'geo-scene', onChange})`。`target` 由 `createSceneTarget(container,{provider,config,basemap,theme,interactive,libraries})` 创建；`data` 必填，为章节、地点、路线、相机和媒体场景。 | `ready`；`seek(seconds)` 异步采样并更新镜头与路线；`play()`、`pause()`、`setData(data)`、`setTheme(theme)`、`inspect()`、`destroy()`。`onChange` 返回当前采样状态。 |

`TravelItineraryLayer.data` 为 `{title?, days:[{id?, label?, date?, color?, stops:[{id,name,coordinates,time?,tag?,summary?,details?}], route?}]}`。每日至少一个站点；站点 ID 全局唯一，`coordinates` 为已核实 WGS84 `[经度,纬度]`；`date` 若有则为 `YYYY-MM-DD`；`details` 为 `{label,text}[]`；可选 `route` 是该日已提供的 GeoJSON `LineString` 几何。缺少路线时只绘制按站点顺序连接的**示意虚线**，不推断道路、距离或用时。[完整输入与转换](travel-itinerary.md)。

`StoryTimelineLayer.data` 为 `{title?, subtitle?, metadata:{dataCrs:'wgs84'}, events:[{id,title,coordinates,date?,chapter?,summary?,details?,routeFromPrevious?}]}`。事件按数组顺序推进；`routeFromPrevious` 是连接上一事件的 GeoJSON `LineString` 几何，首事件不能设置，端点须与相邻事件吻合；未提供时为示意虚线。日期是章节标签，不用于推算速度。[完整输入与转换](story-timeline.md)。

`SceneNarrativeViz.data` 为 `{schemaVersion:1,metadata:{dataCrs:'wgs84'},title,provider,theme?,basemap?,attribution?,duration,fps,width,height,locations,routes,chapters,audio}`。章节用 `start/end` 秒数、`camera.from/to` 与 `routeProgress.from/to` 定义；`camera.followRoute:true` 需 routeId，中心随该用户路线推进。真实路径与示意连接用 `routes[].kind` 区分。`sampleScene(data,seconds)` 返回时间、章节、相机及路线进度；Remotion 导出逐帧使用相同状态，不让真实时钟驱动动画。既有故事/旅游 JSON 可经 `prepare_scene.py` 生成可编辑计划。[完整场景与目标配置](scene-narrative.md)、[视频输出](video-export.md)。

## 3. 地球模式组件

源码：[globe-effects.mjs](../assets/components/globe-effects.mjs)。这一组使用独立的 **Globe.GL** 渲染器，不是 MapLibre 球面图层，也不需要地图 Key。先 `createGlobe(host, options)` 获取球体，再实例化一个地球图层；当前图层的 `destroy()` 会清空该球体的弧线、点和面数据，组合多个图层时须自行管理生命周期。

```js
import {createGlobe, GlobeFlightLayer} from './assets/components/globe-effects.mjs';
const globe = createGlobe(document.getElementById('globe'), {
  // GlobeCtor 默认 globalThis.Globe；texture 默认项目固定的夜间纹理 URL
  center: {lat: 16, lng: 12, altitude: 2.1},
  motion: true
});
const layer = new GlobeFlightLayer(globe, {onPick: row => console.log(row), motion: true});
layer.setData(odRows);
```

| 类 | 构造参数与数据 | 方法与拾取 |
| --- | --- | --- |
| `GlobeFlightLayer` | `new GlobeFlightLayer(globe, {onPick, motion:true})`；`setData()` 接受 OD 数组或 `{origin:{position}, routes:[...]}`。每条有 WGS84 `source/target`（或 `airport.position`），建议提供唯一 `id`；缺失时按数组索引生成，重复 ID 会报错。可有 `label/name`、`category/region`。 | 球面弧线、类别色与目的地点；`onPick` 收到规范化 OD 行。 |
| `GlobeChoroplethLayer` | `new GlobeChoroplethLayer(globe, {onPick, motion:true})`；`setData()` 接受 Polygon/MultiPolygon FeatureCollection，数值取 `properties.__viz.value`、`value` 或 `population`；允许 `null`，不允许负数。 | 球面区域设色；缺失灰色，零值保留；`onPick` 收到 `{id,label,value,geometry}`。当前颜色按 `log10(1+value)` 映射。 |
| `GlobeSpikeLayer` | `new GlobeSpikeLayer(globe, {onPick, motion:true, minValue?, maxValue?, unit?})`；`setData()` 接受 Point FeatureCollection，有限指标取 `properties.__viz.value`、`value` 或 `mag`。若同时指定 min/max，必须递增。 | 球面指标柱；`onPick` 收到 `{id,lng,lat,value,label}`。高度和颜色是指标的视觉映射，不是海拔；`unit` 用于标签。 |

三个类均提供 `setData(data): this`、`pause()`、`play()`、`inspect()`、`destroy()`。`pause()/play()` 控制球体自动旋转；飞线同时控制流光。`motion:false` 时 `play()` 不启用动画。`inspect()` 返回 `rendererOwner:'third-party'`、`provider:'globe.gl'`、类名、数据量和暂停状态。`createGlobe()` 的 `texture` 与 Globe.GL SDK 默认需联网；可自行提供并托管资源。[地球输入示例与生成命令](globe-effects.md)。

## 使用边界

本手册记录**已封装的公开类**。仓库有少数为特定数据制作的页面效果，例如停车占用率方格、充电站图标和事故指标线宽；它们尚无对应通用类，不能算入上述类清单。高德、百度、腾讯、Google 等指定图商需按各自[能力文档](capabilities/index.md)选择其 SDK 方法；不能实例化本项目的 MapLibre 专有类后声称由该图商实现。
