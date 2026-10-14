# 平面地图可视化组件

Agent 根据[分析目标与数据条件](selection.md#2-分析目标--字段--聚合--组件)在下表中平等选择。每个 effect 是一个可单独调用的组件；必要数据条件不同，是为了保持分析含义准确，并非组件等级。所有空间坐标都必须核实来源和 CRS。

这些数据组件共用矢量、影像或地形[底图选项](basemaps.md)，不增加新的 effect。镜头、章节和视频由[场景叙事组件](scene-narrative.md)组织；底图与叙事形式不改变组件的业务输入和统计语义。

| effect / 组件 | 用途与必要输入 | 当前直接生成的图商 |
| --- | --- | --- |
| `points` / `PointViz` | 地点分布，可选柔光/加法叠加；规范化 Point GeoJSON、稳定 ID | MapLibre、Mapbox |
| `category-points` / `CategoryPointsViz` | 类别分布；Point + 明确类别，固定类别色表 | MapLibre、Mapbox |
| `point-color` / `MetricPointsViz` | 数值、正负变化的点位设色；Point + 可解释指标、单位 | MapLibre、Mapbox |
| `bubble` / `BubbleViz` | 单体规模比较；Point + 可比较数值、单位，圆面积编码 | MapLibre、Mapbox |
| `cluster` / `ClusterViz` | 密集点逐条浏览；Point + 稳定 ID，屏幕聚合随缩放变化 | MapLibre、Mapbox |
| `heatmap` / `HeatmapViz` | 事件密度或非负可加值的空间贡献；Point，显式 `weight` | MapLibre、Mapbox |
| `line` / `LineViz` | 已提供路线或边界的线状分布；LineString / MultiLineString | MapLibre、Mapbox |
| `fill` / `ChoroplethViz` | 已提供区域的分类或数值差异；Polygon / MultiPolygon | MapLibre、Mapbox |
| `extrusion` / `ExtrusionViz` | 区域指标三维拉伸；Polygon + 非负数值、单位和 `heightScale` | MapLibre、Mapbox |
| `flight` / `FlyLineViz` | 已提供起终点的示意连接；唯一 ID、WGS84 source/target 的 OD JSON | MapLibre |
| `pulse` / `RippleViz` | 需要持续强调的地点；WGS84 Point GeoJSON | MapLibre |
| `radar` / `RadarScanViz` | 已知站点的贴地扇形面扫描；WGS84 Point GeoJSON，可配半径、周期、扇形角度与峰值透明度 | MapLibre |
| `hexagon` / `HexagonViz` | 固定边长平面／3D 空间汇总；WGS84 Point GeoJSON，可配 count/sum/mean | MapLibre |

这些类均在[公开组件源码](../assets/components/visualizations.mjs)中定义。下方是接口摘要；逐类的构造参数、方法和数据格式见[类参考手册](class-reference.md)。源码是最终依据，`effect` 值与上表一一对应：

```ts
interface FlatViz<Input> {
  ready: Promise<boolean>;
  setData(data: Input): number | void;
  setFilter(predicate: (record: unknown) => boolean): number | void;
  setTheme(theme: 'dark' | 'light'): void;
  inspect(): object;
  destroy(): void;
}
// 所有平面组件：new Component(map, {data, provider, id, theme, spec, onPick, onError})
// 或 createViz(map, {effect, data, provider, id, theme, spec, onPick, onError})。
// data、provider、id、theme 和回调是公共选项；具体视觉参数统一放入 spec。
// 规范化 GeoJSON：Point / LineString / Polygon 由各组件分别校验。
class PointViz         { static effect = 'points'; }
class CategoryPointsViz{ static effect = 'category-points'; }
class MetricPointsViz  { static effect = 'point-color'; }
class BubbleViz        { static effect = 'bubble'; }
class ClusterViz       { static effect = 'cluster'; }
class HeatmapViz       { static effect = 'heatmap'; }
class LineViz          { static effect = 'line'; }
class ChoroplethViz    { static effect = 'fill'; }
class ExtrusionViz     { static effect = 'extrusion'; }
// 下列效果当前只有 MapLibre 组件实现。
class FlyLineViz        { static effect = 'flight'; pause(): void; play(): void; }
class RippleViz         { static effect = 'pulse'; pause(): void; play(): void; }
class RadarScanViz      { static effect = 'radar'; pause(): void; play(): void; }
class HexagonViz       { static effect = 'hexagon'; setMode(mode: 'flat' | '3d'): void; setCellSize(metres: number): void; }
```

## 与图商命名的关系

上表的 `effect` 和 `*Viz` 是本项目按**数据表达**定义的稳定接口，不是图商 SDK 的同名类。Mapbox / MapLibre 使用 `map.addLayer({type: ...})`：四种点表达 `points`、`category-points`、`point-color`、`bubble` 默认以 `circle` 等原生层及不同的数据映射实现；三类散点显式启用加法叠加时由 deck.gl 补充，参数见[散点外观](class-reference.md#散点外观光晕与颜色叠加)；`cluster` 是 GeoJSON **source** 的聚合选项，配合 `circle` / `symbol` 显示，不是名为 `ClusterLayer` 的样式层。`heatmap`、`line`、`fill`、`fill-extrusion` 才是这两家的实际样式层类型。[Mapbox 层类型](https://docs.mapbox.com/style-spec/reference/layers/) · [MapLibre 层类型](https://maplibre.org/maplibre-style-spec/layers/) · [MapLibre 聚合示例](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/)

| 本项目表达 | 图商中名称不同的代表性能力 | 不应作出的推断 |
| --- | --- | --- |
| `points` / `bubble` | 高德 `Loca.PointLayer`、百度 `mapvgl.PointLayer`、腾讯 `TMap.visualization.Dot` | 本项目的 `PointViz` 不是这些类的跨 SDK 子类 |
| `pulse` | 高德 `Loca.ScatterLayer`、百度 `mapvgl.RippleLayer`、腾讯 `Dot` 的动画 | 高德的 **ScatterLayer** 更接近动态强调点；它不对应本项目的普通散点 `points` |
| `heatmap` | 高德 `Loca.HeatMapLayer`、百度 `mapvgl.HeatmapLayer`、腾讯 `TMap.visualization.Heat` | 同为热力，类名、输入和权重契约仍不同 |
| `flight` | 高德 `Loca.PulseLinkLayer`、百度 `mapvgl.FlyLineLayer`、腾讯 `TMap.visualization.Arc` | 本项目默认飞线实际用 deck.gl；不能称 MapLibre 原生飞线层 |
| `hexagon` | 高德 `Loca.HexagonLayer`、百度 `mapvgl.HoneycombLayer`、腾讯 `TMap.visualization.Hexagon` | Mapbox / MapLibre 没有同名内置样式层；本项目聚合点后用原生面层绘制 |
| `radar` | 使用所选图商已有点、线、面能力组合 | 不能凭本项目类名声称某图商有原生 `RadarLayer` |

上表只对照名称与实现路线，**不代表**本项目的 MapLibre 类已经适配高德、百度或腾讯。Google Maps 则主要通过 `Data`、标记和独立的 markerclusterer 表达相关数据，同样没有这一套同名类；连续热力应按当前 Google 能力文档核查，不默认采用已弃用的旧 `HeatmapLayer`。各家精确数据契约和支持状态以[图商能力索引](capabilities/index.md)及对应官方文档为准。平面可视化组件统一使用 `PointViz` 等短类名、`VIZ_COMPONENTS`、`createViz` 与 `createVizSwitcher`。[高德 Loca 类参考](https://a.amap.com/Loca/static/loca-v2/doc/html/index.html) · [百度 MapVGL](https://mapv.baidu.com/gl/docs/index.html) · [腾讯可视化](https://lbs.qq.com/webApi/visualizationApi/visualizationGuide/visualizationOverview) · [Google Data](https://developers.google.com/maps/documentation/javascript/datalayer)

旅游规划和故事时间轴分别由 [TravelItineraryLayer](../assets/components/travel-itinerary.mjs) 与 [StoryTimelineLayer](../assets/components/story-timeline.mjs) 实现。它们使用各自的叙事数据结构，**不承诺**平面组件的 `setData/setFilter/setTheme` 接口。球面飞线、区域设色、事件指标柱分别由 [GlobeFlightLayer、GlobeChoroplethLayer、GlobeSpikeLayer](../assets/components/globe-effects.mjs) 实现，使用 Globe.GL 对象而非平面地图实例；它们不进入平面可视化注册表。

```ts
// 场景叙事组件，当前仅 MapLibre。
declare class TravelItineraryLayer {
  constructor(map: unknown, options: {data: unknown; provider?: 'maplibre'; id?: string; padding?: object; onSelect?: Function});
  setDay(dayId: string | null, options?: {fit?: boolean}): void;
  selectStop(stopId: string, options?: {fly?: boolean}): object;
  fit(): void; inspect(): object; destroy(): void;
}
declare class StoryTimelineLayer {
  constructor(map: unknown, options: {data: unknown; provider?: 'maplibre'; id?: string; padding?: object; onChange?: Function; onSelect?: Function});
  setProgress(progress: number): void; seekEvent(index: number, options?: {select?: boolean}): object;
  play(options?: {duration?: number}): void; pause(): void;
  fit(): void; inspect(): object; destroy(): void;
}
// 地球模式组件，先调用 createGlobe(host)，再实例化独立 Globe.GL 组件。
declare class GlobeFlightLayer {
  constructor(globe: unknown, options?: {onPick?: Function; motion?: boolean});
  setData(odRows: unknown): this; pause(): void; play(): void; inspect(): object; destroy(): void;
}
declare class GlobeChoroplethLayer {
  constructor(globe: unknown, options?: {onPick?: Function; motion?: boolean});
  setData(regionGeoJSON: unknown): this; pause(): void; play(): void; inspect(): object; destroy(): void;
}
declare class GlobeSpikeLayer {
  constructor(globe: unknown, options?: {onPick?: Function; motion?: boolean; minValue?: number; maxValue?: number; unit?: string});
  setData(pointGeoJSON: unknown): this; pause(): void; play(): void; inspect(): object; destroy(): void;
}
```

叙事组件的输入与语义分别见[旅游规划](travel-itinerary.md)和[故事时间轴](story-timeline.md)；地球输入见[地球模式](globe-effects.md)。上述代码是阅读用签名摘要，省略了默认值和内部类型，实际导出以源码为准。

## 统一调用

```js
import {createViz} from './assets/components/visualizations.mjs';
const layer = createViz(map, {
  effect: 'bubble', provider: 'maplibre', data: normalizedGeoJSON,
  spec: {unit: '处', maxRadius: 28},
  onPick: ({effect, kind, items, count}) => showDetails(items)
});
await layer.ready;
layer.setFilter(feature => true);
layer.setData(nextData);
layer.setTheme('light');
console.log(layer.inspect());
layer.destroy();
```

`createVizSwitcher(map, data, options)` 是给同一份已规范化 GeoJSON 切换点、线、面等 spec 型组件的页面辅助函数；它会等待新图层就绪后再移除旧图层。飞线、雷达、呼吸点、蜂窝仍通过同一个 `createViz` 组件入口创建，但切换页面由调用方自行安排数据类型、第三方依赖与销毁时机。

公共方法的 `setFilter` 返回保留的输入记录数；筛选回调收到原始 Feature 或 OD 行。`setData` 更新数据并保留当前筛选条件，输入不合格时保留原数据。`setTheme` 只更新数据层，页面及底图主题由调用方同步。`onPick.items` 对蜂窝是聚合网格，对其余效果为原始要素或 OD 记录；聚合点可再调用事件上的 `loadLeaves/expand`。动画组件附加 `pause/play`，蜂窝附加 `setMode/setCellSize`。类别点必须使用分类色，数值着色点必须使用数值色；不匹配时应换组件或修正映射。点线面组件的异步图层失败通过 `onError` 回调报告；飞线等专有组件在构造时同步报错。直接使用飞线 JS 组件时还须预先加载固定版本 deck.gl，并传入 `spec: {deck: window.deck}`；HTML 生成器会负责依赖装配。所有效果特有的视觉参数都放在 `spec` 中，放在顶层会报错。飞线、呼吸点、雷达和蜂窝的 `spec` 也会拒绝未知字段或其他组件的参数，避免拼写错误被静默忽略；可用字段见类参考手册。

HTML 作品统一使用 `scripts/build_visual_html.py DATA --spec SPEC --out OUTPUT`。分类点 spec 示例：

```json
{"effect":"category-points","title":"地点类别","description":"按类别查看位置","colorBy":"category"}
```

飞线的 spec 可用 `{"effect":"flight","title":"航线连接"}`，输入改为已核实 WGS84 的 OD JSON；雷达、蜂窝的专有选项见[效果细节](maplibre-effects.md)。点线面参数及规范化数据见[图层参数](mapbox-recipes.md)和[数据契约](data-contract.md)。旧的 `build_map_html.py` / `build_effect_html.py` 保留供既有作品和内部打包调用，新作品从统一入口开始。当前工具不会为 Google、百度、高德、腾讯生成同构 HTML，也不会把 MapLibre 专属效果偷偷切换到用户指定的 Mapbox；查对应图商能力再实现。
