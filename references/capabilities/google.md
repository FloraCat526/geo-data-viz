# Google Maps：数据可视化选型

核查：2026-09-13，Maps JavaScript API 官方文档与 deck.gl 官方文档。以下为有文档依据的实现路线，未用真实 Key 验收。接入、CRS 和清理见 [公共接入约定](../providers.md)。

## 能力与数据匹配

| 效果 / 适用数据 | 接口与来源 | 映射与选择要点 | 限制 / 备选 |
|---|---|---|---|
| 位置、分类点、可点击业务点 | 原生 `AdvancedMarkerElement`；`Data` 点 | 分类颜色/图标；数量气泡可用自定义圆形 DOM | Advanced Markers 需 marker 库和 map ID；大量 DOM 点先评估，批量 GPU 可选第三方 ScatterplotLayer。[标记接入](https://developers.google.com/maps/documentation/javascript/advanced-markers/start) |
| 数量气泡、告警呼吸 | DOM/Canvas 组合，或第三方 `ScatterplotLayer` | 半径按数量平方根；稳定核心与动画外环分开 | 不是 Google 内置 BubbleChart/BreathingPoints 类；圈的动画由任务实现，暂停可用静态核心。[自定义覆盖物](https://developers.google.com/maps/documentation/javascript/customoverlays) |
| 点聚合、缩放展开 | 官方维护扩展 `@googlemaps/markerclusterer` | 降低重叠；cluster 数为记录数，业务汇总需自定义 | 不等同于分析用的固定网格；大规模批量渲染另评估。[聚合指南](https://developers.google.com/maps/documentation/javascript/marker-clustering) |
| 自有 GeoJSON 点线面 / 分级设色 | 原生 `google.maps.Data`、`addGeoJson`、`setStyle` | 属性驱动颜色、线宽与选中态；用户已有区域边界优先 | 业务指标先按稳定 ID 关联，别重新拿地名猜边界。[Data 层](https://developers.google.com/maps/documentation/javascript/datalayer) |
| 官方行政区边界设色 | 原生 DDS boundaries、`getFeatureLayer` | 地域匹配到对应 place ID，再按指标设色 | 需矢量 map ID、启用对应边界层和区域覆盖；缺条件时用自有边界 Data。[DDS 条件](https://developers.google.com/maps/documentation/javascript/dds-boundaries/start) |
| 事件密度 / 加权热力 | 第三方 `HeatmapLayer` + `GoogleMapsOverlay` | 位置与非负权重；配置带宽、颜色、聚合与固定域 | **旧 Google HeatmapLayer 已退出，不能新用**；CPU/自行 Canvas 热力可作有标识备选。[Google 替代示例](https://developers.google.com/maps/documentation/javascript/examples/deckgl-heatmap)、[deck.gl 热力](https://deck.gl/docs/api-reference/aggregation-layers/heatmap-layer) |
| 方格 / 蜂窝汇总 | 第三方 `GridLayer` / `HexagonLayer`，或预计算面 + Data | 点计数、金额求和、均值需明确选择；跨平台严格比较预计算 | 不把第三方聚合说成 Google 原生；统计值保留详情。[deck.gl 聚合](https://deck.gl/docs/api-reference/aggregation-layers/hexagon-layer) |
| 道路 / 实际轨迹线 | 原生 `Polyline` 或 Data | 输入已有的有序 LineString，宽度/颜色编码 | 只有 OD 时只能绘关系线；路线服务和可视化是不同步骤。[线与形状](https://developers.google.com/maps/documentation/javascript/shapes) |
| OD 弧线、迁徙关系 | 第三方 `ArcLayer` 或自定义线几何 | 起点、终点、流量映射线宽；弧高通常是装饰 | ArcLayer 本身不等同于移动飞线；流动亮点要另实现。[ArcLayer](https://deck.gl/docs/api-reference/layers/arc-layer) |
| 有时间的车辆回放 | 第三方 `TripsLayer` 或自行调度位置/折线 | 每实体路径 + 同步时间戳；时间进度统一 | 时间戳要满足图层数值精度，不能直接塞毫秒 epoch；缺时间可画静态路径。[TripsLayer](https://deck.gl/docs/api-reference/geo-layers/trips-layer) |
| 柱体、建筑拉伸、自定义 3D | 第三方 Column/Polygon 图层或原生 `WebGLOverlayView` 组合 | 物理高度与指标高度分清；需要共享场景时核实矢量模式 | WebGLOverlayView 需矢量地图；二维 Canvas 无遮挡能力；降级到气泡/面色阶。[WebGL](https://developers.google.com/maps/documentation/javascript/webgl/webgl-overlay-view) |
| 实际距离范围 / 圆形围栏 | 原生 `Circle`、`Polygon` | Circle 半径是地面米数；这是距离范围 | 不能把米半径直接当屏幕气泡半径；没有服务分析时不称为通勤可达圈。[形状](https://developers.google.com/maps/documentation/javascript/shapes) |

## 关键实现约束

- 原生、第三方和自绘分别加载。采用 deck.gl 时记录 core、layers、google-maps 等匹配版本；官方示例中的旧版本号不是本项目锁定版本。
- `GoogleMapsOverlay` 的矢量模式可共享 WebGL2 场景，支持倾斜旋转与建筑遮挡；栅格模式不能承诺相同 3D 效果。先确定渲染模式，再决定高度、拾取与交互方案。[集成说明](https://deck.gl/docs/api-reference/google-maps/overview)
- `google.maps.visualization.HeatmapLayer` 在 2025-05 弃用，并于 2026-05 发布的后续版本移除。即使旧示例页面仍存在，也不能作为新实现的依据。[官方弃用说明](https://developers.google.com/maps/deprecations)
- 大范围区域统计若需云端 datasets 工作流，应另核实上传与服务配置；普通附件任务优先本地 Data/第三方图层，不默认上传原始数据到供应商后台。

## 给 Agent 的选择建议

少量可交互门店使用原生标记/自定义圆形即可；用户要密度、批量 OD 或复杂 3D 时评估 deck.gl；已有多边形优先 Data，只有地域编码且满足 DDS 条件才选官方边界。没有专门 3D 热力方案时，不把二维 HeatmapLayer 的颜色场说成起伏曲面。

运行时核对底图模式、map ID、扩展存在性、层销毁、动画暂停和 A→B→A 状态，再按 [匹配规则](../selection.md) 记录实际验证状态。
