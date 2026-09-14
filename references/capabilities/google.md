# Google Maps：数据可视化选型

核查：2026-09-14，Maps JavaScript API 官方文档。优先采用 JSAPI 原生能力和官方维护扩展，能力缺口可由第三方/自绘补充；尚未用真实 Key 验收。接入与清理见 [公共接入](../providers.md)，所有路线遵守 [渲染归属](../provider-rendering.md)。

## 能力与数据匹配

| 效果 / 数据 | 对应能力 | 条件与限制 |
| --- | --- | --- |
| 位置、分类点 | 原生 AdvancedMarkerElement 或 Data 点 | Advanced Markers 需要 marker 库和 map ID；图标/样式由对应标记管理。大量标记要实测。[接入](https://developers.google.com/maps/documentation/javascript/advanced-markers/start) |
| 点线面属性表达、区域设色 | 原生 google.maps.Data，addGeoJson / setStyle | 数据进入 Data 层，样式按属性决定；已有边界优先。点符号按当前 Data.StyleOptions.icon 契约核查，不引入独立散点渲染器。[Data](https://developers.google.com/maps/documentation/javascript/datalayer)、[StyleOptions](https://developers.google.com/maps/documentation/javascript/reference/data#Data.StyleOptions) |
| 点聚合、展开 | 官方维护扩展 @googlemaps/markerclusterer | 聚合数默认是标记数，不是销售额；额外扩展需记录版本。[官方指南](https://developers.google.com/maps/documentation/javascript/marker-clustering) |
| 官方行政区边界设色 | DDS boundaries、getFeatureLayer | 要求矢量 map ID、启用对应边界及区域覆盖；条件不具备时用已有边界 Data。[条件](https://developers.google.com/maps/documentation/javascript/dds-boundaries/start) |
| 路径、OD 关系、方向提示 | 原生 Polyline / Data；Polyline icons 符号 | 按已有顶点绘制。可通过公开 icons 属性更新符号位置形成组合动画，注明并非内置飞线；OD 直连不能冒充道路路径。[形状](https://developers.google.com/maps/documentation/javascript/shapes)、[符号与动画](https://developers.google.com/maps/documentation/javascript/symbols) |
| 时间轨迹 | 按时间更新原生标记与 Polyline | 先实体内排序与分段；SDK 负责绘制，Agent 仅调度数据。没有内置尾迹能力的证据时不承诺该效果 |
| 实际距离范围 | 原生 Circle / Polygon | Circle 半径是地面米数，不可把 px 气泡半径直接传入；不是自动计算的通勤可达圈。[形状](https://developers.google.com/maps/documentation/javascript/shapes) |
| 方格/蜂窝统计 | 分析端预计算面 + 原生 Data | 固定网格和计数/求和/比率口径后绘制；准确称作网格统计，不称 Google 原生 HexagonLayer |

## 连续热力和其他缺口

Google 官方已说明旧 `google.maps.visualization.HeatmapLayer` 自 2026-05 不可用。其推荐的 deck.gl 是第三方实现，可用于补充这一能力缺口；需标为 third-party，并验证匹配版本的 HeatmapLayer 与 GoogleMapsOverlay 集成。[弃用说明](https://developers.google.com/maps/deprecations#heatmap-layer-deprecated-as-of-may-27-2025)

用户问“哪里集中”时按目标选择聚合、网格或连续热力。需要连续热力时，可直接评估 deck.gl 或自绘补充并说明非原生来源，无需重复询问是否允许补充；仍禁止使用已退出的旧 API。若用户额外限定“只能原生”，则尊重该限制并说明可选原生替代。

当前清单未核实符合本范围的专用呼吸点、指标柱拉伸、3D 热力曲面或批量 3D 弧线。可评估第三方 ArcLayer/TripsLayer、柱体等或自定义实现，并核验集成、遮挡与投影。WebGLOverlayView 是自定义渲染接入接口，不是这些效果的实现；补充成功也不能标为 Google 原生支持。目标版本如提供新的官方能力，取得对应文档、数据契约和运行证据后再加入。

## 实现检查

优先让业务数据进入 Google 原生实例或官方扩展；补充方案按实际库的 API 实现详情/筛选，并记录 rendererOwner、fallbackReason 和匹配版本。自有边界无需默认上传云端 datasets；确需云服务时另核查授权。实例和事件逐一清理；Google 无通用公开 Map.destroy，不猜造接口。
