# 地图可视化能力索引

各家图商文档核查日期：2026-09-13；MapLibre/OpenFreeMap 新增核查：2026-09-21。用于从数据与目标选择实现路线，不是 SDK 全量手册，也不是本项目已实现图层清单。只阅读本次使用的平台文档；未指定图商且无已授权配置时，直接采用 MapLibre + OpenFreeMap，不要求用户先比较或选图商。

- [MapLibre + OpenFreeMap](maplibre.md)：免 Key 默认组合；原生 circle/heatmap/line/fill/fill-extrusion 与聚合，已提供 HTML 打包入口及独立能力表。

- [Google Maps](google.md)：Data、Advanced Markers、官方维护聚合扩展、Polyline；连续热力存在能力缺口。
- [Mapbox](mapbox.md)：数据驱动的 circle/heatmap/line/fill/fill-extrusion、聚合、自定义层。
- [MapTiler](maptiler.md)：场景叙事的 MapTiler SDK 镜头、影像与地形路线；需授权 Key。常规统一数据组件仍按其已验证引擎范围选择。
- [CesiumJS](cesium.md)：场景叙事的三维地形、影像与 3D Tiles 镜头；不是地球数据组件的 Globe.GL 替代名。
- [百度地图](baidu.md)：JSAPI 基础图层与 MapVGL 点线面、聚合、波纹和飞线。
- [高德地图](amap.md)：JSAPI 2.0 与 Loca 2.x 点线面、呼吸、热力、网格、脉冲。
- [腾讯地图](tencent.md)：TMap GL 与 visualization 的 Dot/Heat/Arc/Trail 等。

选型步骤见 [数据到效果的匹配规则](../selection.md)，接入与坐标要求见 [跨地图接入](../providers.md)。

矢量、影像和地形按[底图配置](../basemaps.md)独立选择；默认 OpenFreeMap 仍为免 Key 矢量底图。静态图片地图、镜头叙事及 Remotion 视频在[场景叙事](../scene-narrative.md)中组织，不扩充为第四类能力。新增影像/地形与场景路线核查日期：2026-10-08；文档支持与实际资源验收分别记录。

## 如何读能力表

实现来源与验证状态是两个维度：

- **原生**：地图 SDK 公共类或样式层。
- **官方扩展**：需要另行加载的厂商库，如 Loca、MapVGL、腾讯 visualization。
- **第三方**：如 deck.gl、ECharts，图商不支持目标效果时可补充；即使官方推荐也不等于官方扩展。
- **组合**：仅组织数据或更新原生图层的样式/动画，最终由 SDK/官方扩展绘制；另用 custom-layer 自建渲染器属于 custom 补充，须记录能力缺口，不能标为原生组合。
- **待核实**：当前证据不足，不等于厂商没有此能力，不能进入“已支持”承诺。

“官方文档已核查”仅证明有文档依据；“本地源码已核查”仅证明该源码快照具有接口。实际 SDK 版本、Key、扩展、投影与浏览器验收仍分别记录。下面的路线由 Agent 按任务实现；文档列出能力不等于运行资源已实现或通过验收。Mapbox 常用原生层另有 [可复用配方](../mapbox-recipes.md)。

## 效果 → 平台实现路线

各单元格优先列原生/官方扩展路线；“缺口”表示未核实该图商的原生效果，允许进一步评估第三方或自绘补充。具体输入、依赖和限制以对应平台文档为准；按 [渲染归属](../provider-rendering.md) 分开记录补充能力，不将其填成图商原生支持。

| 数据表达 | Google | Mapbox | 百度 | 高德 | 腾讯 |
|---|---|---|---|---|---|
| 散点 / 数量气泡 | Data 点样式 / AdvancedMarker | 原生 circle | 扩展 PointLayer | 扩展 Loca.PointLayer | 扩展 Dot |
| 呼吸 / 波纹强调 | 按已核实原生覆盖物属性组合；否则缺口 | circle 样式动画组合 | 扩展 RippleLayer | 扩展 ScatterLayer | 扩展 Dot 动画 / Radiation |
| 点聚合与展开 | @googlemaps/markerclusterer | GeoJSON source cluster | 扩展 ClusterLayer | AMap.MarkerCluster 插件 | TMap.MarkerCluster |
| 连续热力 | 原生缺口；可评估第三方 HeatmapLayer | 原生 heatmap | 扩展 HeatmapLayer | 扩展 HeatMapLayer | 扩展 Heat |
| 方格 / 蜂窝统计 | 预计算面 + Data | 预计算 fill | 扩展 HeatGridLayer / HoneycombLayer | 扩展 GridLayer / HexagonLayer | 扩展 Grid / Hexagon |
| 区域分级设色 | Data / DDS boundaries | 原生 fill + line | 原生多边形 / 扩展 PolygonLayer | 原生 Polygon / 扩展 PolygonLayer | MultiPolygon / 扩展 Area |
| 真实路径线 | Polyline / Data | 原生 line | 原生折线 / 扩展 SimpleLineLayer | Polyline / 扩展 LineLayer | MultiPolyline / 扩展 Trail |
| OD / 动态飞线 | 原生 Polyline + symbols 组合 | 原生 line 样式动画组合 | 扩展 FlyLineLayer | LinkLayer / PulseLinkLayer | 扩展 Arc |
| 有时间的轨迹回放 | 按时间更新原生标记/Polyline | 原生 source/line/marker 时间调度 | 对应轨迹层按时间契约核实 / 自行调度 | MoveAnimation / PulseLineLayer 仅作方向强调 | 扩展 Trail |
| 指标柱 / 区域拉伸 | 原生缺口；可评估第三方指标拉伸 | 原生 fill-extrusion | 扩展 ShapeLayer | 扩展 PrismLayer / PolygonLayer | 扩展 Prism |
| 3D 热力曲面 | 缺口：未核实专用官方层 | 缺口：heatmap 不提供曲面高度 | 扩展 HeatmapLayer height，验证版本 | 扩展 HeatMapLayer height | 扩展 Heat height |
| 范围 / 辐射 / 围栏 | Circle / Polygon / 组合动画 | 预计算面 / 组合动画 | 基础覆盖物 / RippleLayer | Circle / Polygon / Loca 组合 | Radiation / Wall / Area |

矩阵中的接口依据链接及源码定位放在各平台文件中。不能仅凭本表推断字段同名、动画语义相同、地形遮挡相同或最大点数相同。

## 跨平台可比性的等级

1. **业务口径相同**：记录、单位、指标、聚合、色阶及时间窗口相同；本 Skill 的默认要求。
2. **计算结果相同**：网格边界、成员、权重、KDE 核与带宽都相同。若用户要严格对比，先统一计算，再交给各家绘制，不能各自调用默认聚合。
3. **渲染近似一致**：统一平面视角、像素/米单位、样式和动画。字体、抗锯齿、底图及原生热力渲染仍可能不同。

不满足用户要求的增强效果可以提供明确的降级路线，例如飞线变二维方向线、棱柱变区域色阶。保留业务口径，并说明失去的是高度、遮挡、动画还是拾取；不能悄悄换指标或把缺少能力显示成成功。

## 维护

新增能力需记录：效果、类/图层、来源类型、数据条件、映射方式、依赖、限制、替代方案、证据与核查日期。接口变动以官方 API/变更说明或用户授权的当前源码为依据；搜索摘要和产品宣传不是参数契约。失效链接或无法确认的新版本降为待核实，不继续复制旧示例。
