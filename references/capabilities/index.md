# 六家地图可视化能力索引

核查日期：2026-09-13。用于从数据与目标选择实现路线，不是 SDK 全量手册，也不是本项目已实现图层清单。仅阅读用户所选平台的文档；未选平台时先用本表比较，再读候选平台。

- [Google Maps](google.md)：Data、Advanced Markers、官方维护聚合扩展、Polyline；连续热力存在能力缺口。
- [Mapbox](mapbox.md)：数据驱动的 circle/heatmap/line/fill/fill-extrusion、聚合、自定义层。
- [Maptec](maptec.md)：GeoJSONOverlay、CircleOverlay、热力、飞线、棱柱、轨迹。
- [百度地图](baidu.md)：JSAPI 基础图层与 MapVGL 点线面、聚合、波纹和飞线。
- [高德地图](amap.md)：JSAPI 2.0 与 Loca 2.x 点线面、呼吸、热力、网格、脉冲。
- [腾讯地图](tencent.md)：TMap GL 与 visualization 的 Dot/Heat/Arc/Trail 等。

选型步骤见 [数据到效果的匹配规则](../selection.md)，接入与坐标要求见 [跨地图接入](../providers.md)。

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

| 数据表达 | Google | Mapbox | Maptec | 百度 | 高德 | 腾讯 |
|---|---|---|---|---|---|---|
| 散点 / 数量气泡 | Data 点样式 / AdvancedMarker | 原生 circle | 原生 GeoJSONOverlay 圆样式 | 扩展 PointLayer | 扩展 Loca.PointLayer | 扩展 Dot |
| 呼吸 / 波纹强调 | 按已核实原生覆盖物属性组合；否则缺口 | circle 样式动画组合 | CircleOverlay 组合 | 扩展 RippleLayer | 扩展 ScatterLayer | 扩展 Dot 动画 / Radiation |
| 点聚合与展开 | @googlemaps/markerclusterer | GeoJSON source cluster | GeoJSONOverlay pointCluster | 扩展 ClusterLayer | AMap.MarkerCluster 插件 | TMap.MarkerCluster |
| 连续热力 | 原生缺口；可评估第三方 HeatmapLayer | 原生 heatmap | 原生 HeatmapOverlay | 扩展 HeatmapLayer | 扩展 HeatMapLayer | 扩展 Heat |
| 方格 / 蜂窝统计 | 预计算面 + Data | 预计算 fill | 预计算 GeoJSONOverlay 面 | 扩展 HeatGridLayer / HoneycombLayer | 扩展 GridLayer / HexagonLayer | 扩展 Grid / Hexagon |
| 区域分级设色 | Data / DDS boundaries | 原生 fill + line | GeoJSONOverlay / PolygonOverlay | 原生多边形 / 扩展 PolygonLayer | 原生 Polygon / 扩展 PolygonLayer | MultiPolygon / 扩展 Area |
| 真实路径线 | Polyline / Data | 原生 line | PolylineOverlay / GeoJSONOverlay | 原生折线 / 扩展 SimpleLineLayer | Polyline / 扩展 LineLayer | MultiPolyline / 扩展 Trail |
| OD / 动态飞线 | 原生 Polyline + symbols 组合 | 原生 line 样式动画组合 | 原生 PulseLinkOverlay（快照） | 扩展 FlyLineLayer | LinkLayer / PulseLinkLayer | 扩展 Arc |
| 有时间的轨迹回放 | 按时间更新原生标记/Polyline | 原生 source/line/marker 时间调度 | PointKeyFrameTrack / PolylineKeyFrameTrack | 对应轨迹层按时间契约核实 / 自行调度 | MoveAnimation / PulseLineLayer 仅作方向强调 | 扩展 Trail |
| 指标柱 / 区域拉伸 | 原生缺口；可评估第三方指标拉伸 | 原生 fill-extrusion | PrismOverlay | 扩展 ShapeLayer | 扩展 PrismLayer / PolygonLayer | 扩展 Prism |
| 3D 热力曲面 | 缺口：未核实专用官方层 | 缺口：heatmap 不提供曲面高度 | Heatmap3DOverlay（快照） | 扩展 HeatmapLayer height，验证版本 | 扩展 HeatMapLayer height | 扩展 Heat height |
| 范围 / 辐射 / 围栏 | Circle / Polygon / 组合动画 | 预计算面 / 组合动画 | CircleOverlay / PolygonOverlay | 基础覆盖物 / RippleLayer | Circle / Polygon / Loca 组合 | Radiation / Wall / Area |

矩阵中的接口依据链接及源码定位放在各平台文件中。不能仅凭本表推断字段同名、动画语义相同、地形遮挡相同或最大点数相同。

## 跨平台可比性的等级

1. **业务口径相同**：记录、单位、指标、聚合、色阶及时间窗口相同；本 Skill 的默认要求。
2. **计算结果相同**：网格边界、成员、权重、KDE 核与带宽都相同。若用户要严格对比，先统一计算，再交给各家绘制，不能各自调用默认聚合。
3. **渲染近似一致**：统一平面视角、像素/米单位、样式和动画。字体、抗锯齿、底图及原生热力渲染仍可能不同。

不满足用户要求的增强效果可以提供明确的降级路线，例如飞线变二维方向线、棱柱变区域色阶。保留业务口径，并说明失去的是高度、遮挡、动画还是拾取；不能悄悄换指标或把缺少能力显示成成功。

## 维护

新增能力需记录：效果、类/图层、来源类型、数据条件、映射方式、依赖、限制、替代方案、证据与核查日期。接口变动以官方 API/变更说明或用户授权的当前源码为依据；搜索摘要和产品宣传不是参数契约。失效链接或无法确认的新版本降为待核实，不继续复制旧示例。
