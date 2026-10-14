# MapLibre 可视化组件

不确定该用哪个组件时，先查 [业务目标到组件的统一选型表](selection.md#2-分析目标--字段--聚合--组件)。本页负责接口与输入，不另设业务选型规则。

本页说明飞线、呼吸点、雷达、蜂窝四种组件的实现细节。公开选择与统一调用先看[组件清单](visualizations.md)；底层源码为 `assets/components/maplibre-effects.mjs`。这些实现仅适用 MapLibre；不能接管用户指定的其他图商。

## 已实现范围

| 组件 | 实现与版本 | 输入与表现 |
|---|---|---|
| `FlyLineViz` / `flight` | MapLibre 5.24.0 + deck.gl 9.1.14，MapboxOverlay / PathLayer / TripsLayer / ScatterplotLayer；third-party | OD 行：三维示意弧线、渐隐流光、固定同色终点、拾取与悬停突出 |
| `HexagonViz` / `hexagon` | MapLibre 原生 fill / line / fill-extrusion；provider-native | Point GeoJSON：按点数、总和或均值聚合；平面/3D、边长调整；非负指标、区域投影限制见下文 |
| `RippleViz` / `pulse` | MapLibre 5.24.0 原生 circle 层；provider-native | Point GeoJSON：稳定核心、错峰呼吸光晕、点击详情 |
| `RadarScanViz` / `radar` | MapLibre 5.24.0 原生 fill / line / circle 层；provider-native | Point GeoJSON：贴地扇形面从明亮前缘向尾部渐隐，配合细圆环和中心点；半径、扇形角度与透明度可配 |

飞线需要三维高度和连续尾迹，故使用补充渲染。MapboxOverlay 是 deck.gl 集成接口名称，不代表更换 Mapbox 底图。当前使用独立叠加画布随 MapLibre 相机同步，关闭深度测试以避免远距离线路闪烁；不提供建筑、地形或地球背面遮挡，限定 Mercator 地图。弧线沿大圆方向生成，跨日期变更线展开经度；对跖点需明确途经点，穿越极区需其他渲染方案。高度与动画时钟纯属示意，不代表真实航迹、速度、频次。

## 组件接口约定

公开 API 从 `assets/components/visualizations.mjs` 导入，使用 `new FlyLineViz(map, {data, spec, ...})` 等公开类，或 `createViz(map, {effect, provider:'maplibre', id, data, theme, spec, onPick})`。`maplibre-effects.mjs` 中的 `FlightLayer`、`PulsePointLayer`、`RadarScanLayer`、`HexagonLayer` 是底层渲染实现；Agent 的组件选择与新页面调用统一使用公开 API。`id` 作为图层命名空间，不得重复；输入在组件内复制。公共接口为 `ready`、`setData(data)`、`setFilter(predicate)`、`setTheme('dark'|'light')`、`inspect()`、`destroy()`。`setData` 与 `setFilter` 返回保留的**输入记录数**，筛选回调收到原始 OD 行或 Point Feature；无效输入或筛选函数抛错时保留现有状态。公开 `onPick` 统一收到 `{effect,kind,items,count}`；蜂窝的 items 是聚合网格，不是原始站点。

`inspect()` 统一包含 `id`、`effect`、`provider`、`rendererOwner`、`count`、`paused`、`destroyed`，另有各组件自己的字段。飞线、呼吸点、雷达有持续动画，提供 `pause()`、`play()`；蜂窝静态展示，另提供 `setMode('flat'|'3d')`、`setCellSize(metres)`。所有平面可视化组件都遵循统一生命周期；具体方法见组件清单。

销毁组件后再销毁地图；换底图样式时先销毁，再在新样式就绪后重建并恢复筛选/暂停状态。主题方法只改数据层，调用方需同步底图和页面。动画在页面隐藏时停止帧更新，尊重减少动态效果偏好。传入文本安全显示，不作为 HTML。

## 生成单文件作品

Agent 先分析并规范化字段，OD 输入为数组：

```json
[{"id":"SIN-HEL","source":[103.994,1.350],"target":[24.963,60.317],"region":"欧洲","color":"#c4a0ff","name":"Helsinki"}]
```

`id` 唯一；坐标已确认 WGS84。`color` 使用六位十六进制色，按全量类别固定分配；缺失类别明确归组。不从连接数推导航班频次。呼吸点输入为 Point FeatureCollection。

```bash
python3 SKILL_DIR/scripts/build_visual_html.py WORK/routes.json \
  --spec WORK/flight-spec.json --out OUTPUT/map.html
python3 SKILL_DIR/scripts/build_visual_html.py WORK/points.geojson \
  --spec WORK/pulse-spec.json --out OUTPUT/pulse.html
python3 SKILL_DIR/scripts/build_visual_html.py WORK/stations.geojson \
  --spec WORK/radar-spec.json --out OUTPUT/radar.html
```

各 spec 至少指定 `effect` 和 `title`；雷达可加 `radiusMeters`、`period`、`sweepAngle`、`opacity`、`color`。导出文件内嵌数据和组件业务代码；固定 SDK/CDN 和底图仍需联网。这些组件的当前实现只支持 MapLibre；用户指定其他图商时不能用 MapLibre 版本替代。导出提供面板与拾取，业务筛选及复杂图例由 Agent 按任务补齐；不可静默截断数据。飞线导出按最短跨日期线包络设置初始视野，蜂窝仍限定区域数据。

## 自定义页面

复制模块随作品分发（服务器须为 .mjs 提供 JavaScript MIME），或像导出脚本一样内嵌到 module script。按需加载 deck.gl，呼吸点无需它：

```js
import {FlyLineViz} from './visualizations.mjs';
map.on('load', () => {
  const flights = new FlyLineViz(map, {
    provider: 'maplibre', data: routes, spec: {deck: window.deck},
    onPick: ({items}) => { details.textContent = items[0].name; }
  });
  // flights.setFilter(row => row.region === '欧洲');
  // flights.pause(); flights.destroy();
});
```

示例页由 `examples/build_extended.py` 从组件源码复制模块，勿单独维护第二份逻辑。新任务用统一 `build_visual_html.py` 生成；`build_effect_html.py` 保留为内部打包和旧作品兼容入口。

## 雷达扫描 RadarScanViz

输入为已核实 WGS84 的 Point FeatureCollection。`radiusMeters` 范围 100–100000 米，`period` 范围 2000–30000 毫秒，`color` 为 `#RRGGBB`；默认分别为 18000 米、6000 毫秒和青蓝色。`sweepAngle` 是扇形面的角度，默认 100°，允许 10–180°；`opacity` 是前缘峰值透明度，默认 0.58，允许 0–1。透明度向尾部渐隐，浅色主题降低填充强度。它是地面扫描面，倾斜地图后随地面透视变化；不是立体探测锥。

组件按球面距离计算地面圆环与连续扇区，用 MapLibre 原生 fill / line / circle 层绘制；扇区内部关闭面边缘抗锯齿，避免出现放射状接缝，外缘通过独立圆环保持清晰。不依赖独立 Canvas 或 deck.gl。跨日期变更线或越过 85° 纬度的范围会拒绝，不能直接拿全球极区数据套用。每个站点的扫描相位固定错开，筛选后保留原来的相位；暂停/减少动效模式仍显示完整扫描面。每次最多约 30 Hz 更新扇区，仅生成与视野相交的动画几何，静态点、筛选数量和原始记录不裁减；暂停时移动地图也会刷新当前视野的固定扫描面。密集站点宜筛选、聚合或控制数量。

例如：`createViz(map, {effect:'radar', data:stations, spec:{radiusMeters:18000, period:6000, sweepAngle:110, opacity:0.65, color:'#35e5f5'}})`。同一 spec 也可传给 `scripts/build_visual_html.py`。半径只有在数据有可靠覆盖范围依据时才能标作实际探测范围；这里的 18 km 是示意参数，不是实时雷达回波。

## 用户指定图商

- 高德：先选 Loca PulseLinkLayer / ScatterLayer。
- 百度：先选 MapVGL 曲线与 LineLayer 动画 / 对应点层。
- 腾讯：查 visualization Arc 与对应点效果。
- Mapbox、Google：查各自能力文档；目标效果确有缺口时按既定补充规则集成，保留指定 SDK、底图与凭证。不能实例化这套 MapLibre-only 组件冒充该图商实现。

参考：[deck.gl MapLibre 集成](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre)、[TripsLayer](https://deck.gl/docs/api-reference/geo-layers/trips-layer)。每次交付仍需检查真实底图、默认视野、尾迹连续性、端点拾取、筛选、暂停、缩放对齐及清理；一次示例通过不代表任意数据或设备均验收。

## 蜂窝图 HexagonViz

MapLibre 原生 `fill` / `fill-extrusion`，无需 deck.gl。WGS84 Point FeatureCollection 聚合成六边形；支持 `mode: 'flat'|'3d'`。`cellSize` 是六边形边长（米），不是直径。`aggregation: 'count'|'sum'|'mean'`；后两者必须传 `valueField`，只接受非负有限数字，null/缺失不参与指标计算，全部缺失为 null；保留 count、validCount、missingCount。禁止把多个比例直接相加（如占用率应先分别汇总分子分母）。3D 高度为聚合值 × `heightScale` 米，不是实际建筑高度。零/缺失高度为零，在平面模式可查看。

本地等距近似投影：限定距原点 500 km 内、原点纬度不超过 75° 的区域数据；不是等面积全球网格。跨日期变更线或大范围数据先拆分或采用合适的地理索引方案，不宣称严格每平方公里密度。网格原点在筛选和调整边长时固定；setData 时重新确定。筛选后重新统计，但保留全量颜色域；调整边长后重新计算颜色域。

```js
import {HexagonViz} from './visualizations.mjs';
const hex = new HexagonViz(map, {data: points,
  spec: {cellSize: 500, aggregation: 'sum', valueField: 'capacity',
    heightScale: .03, mode: 'flat'},
  onPick: ({items}) => { detail.textContent = String(items[0].properties.value); }});
hex.setMode('3d'); // 调用方自行调整地图 pitch
hex.setCellSize(1000);
// setData / setFilter / setTheme / inspect / destroy；无持续动画或 pause/play。
```

```bash
python3 SKILL_DIR/scripts/build_visual_html.py points.geojson \
  --spec hexagon-spec.json --out map.html
```

导出包含平面/3D 切换、边长选择和统计拾取。三维模式不叠加地面网格边线，避免线条覆盖柱顶。

## 飞线视觉参数

飞线默认目的地为同色半透明小点（3.2px 半径、约 51% 不透明度），无描边；悬停时略微放大并提亮。保留拾取，避免密集目的地黑色圆环抢占画面。示例通过 `createViz` 调用 `FlyLineViz`。

原飞线底线宽 1.1px，动态流光宽 1.5px，保持轻微粗细差；目的点悬停半径 4px。


## 导出保护与页面语言

- 默认只内嵌几何、ID、name/label、category/region、color 和选定的蜂窝指标。额外详情使用可重复的 `--detail-field FIELD`（Python：`detail_fields=[...]`），仅支持标量字段；未知属性不会进入 HTML。
- 同名输出默认拒绝覆盖；明确需要更新时使用 `--overwrite`（Python：`overwrite=True`）。输出路径不能与输入相同。示例重建脚本显式覆盖自己负责的生成页面。
- `--locale en` 输出英文按钮、提示与图例，默认 `zh-CN`；标题及业务数据文字由调用方提供。`--theme light` 使用 Positron 浅色底图，dark 使用深色底图；当前导出器在生成时选择主题，不提供运行时主题切换。
- 导出前检查必需坐标、几何类型、唯一 ID、颜色、有限指标以及飞线极区/对跖点、蜂窝区域限制；浏览器仍需核对最终画面和交互。
