# 腾讯地图：TMap GL 与 visualization 选型

核查：2026-09-13。依据腾讯位置服务官网可视化 API 概述、类参考及 JSAPI GL 文档；官方网页由动态/服务端状态提供正文，本次读取了公开 HTML 中的文档内容。未用真实 Key 验收。

**加载 TMap GL 不等于已经加载 visualization。** 按官方方式请求 `libraries=visualization`，记录实际版本与需要的附加库；不要把旧 `qq.maps` API 与 TMap GL 混用。[概述](https://lbs.qq.com/webApi/visualizationApi/visualizationGuide/visualizationOverview)、[入门](https://lbs.qq.com/webApi/visualizationApi/visualizationGuide/visualizationBasic)

## 能力与数据匹配

下列类均位于 `TMap.visualization`，属于官方可视化扩展；基础 MarkerCluster 单独列出。

| 效果 / 适用数据 | 类 / 输入 | 映射与选择要点 | 限制 / 备选 |
|---|---|---|---|
| 散点 / 气泡 / 分类点 | `Dot`，DotPoint：lat/lng/styleId/properties | styles 对应每点 styleId，圆样式 radius 为 px；数量用平方根半径 | 连续尺寸可预计算样式映射；不要把 value 当自动气泡权重。[Dot](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocDot) |
| 点的呼吸 / 跳动强调 | `Dot` 的 `processAnimation` | 静态核心与动态装饰分开，按等级控制色阶 | 旧 animation 参数被标为待下线，不能只复制旧教程；视角朝向 screen/map 有别。[Dot 动画](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocDot) |
| 圆形辐射 / 范围圈 | `Radiation`，center/radius/styleId | radius 是米，过程辐射动画，业务范围有实际依据 | 视觉脉冲圈不证明真实服务覆盖或传播范围；只强调点时优先 Dot。[Radiation](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocRadiation) |
| 连续热力 / 3D 热力 | `Heat`，HeatPoint：lat/lng/count | count 文档要求正整数；min/max、radius、height、gradientColor | 小数、负值、比率不能无说明取整塞入；改用 Dot 色阶或预计算面。[Heat](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocHeat) |
| 方格统计 | `Grid`，HeatPoint[] | sideLength 是米；extrudable、showRange、heightRange | 缺省点权重为1；需要求和/均值时先确认聚合契约，严格可比采用共同格网面。[Grid](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocGrid) |
| 蜂窝统计 | `Hexagon`，HeatPoint[] | radius 是米；固定格网尺度与统计意义 | SDK 默认生成的网格和别家不保证同边界/成员；不能把默认点数当销售额。[Hexagon](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocHexagon) |
| OD 弧线 / 迁徙 | `Arc`，ArcLine：from/to/properties | 起终点为 LatLng；pickStyle 与 processAnimation；mode/curvature | 旧 animatable、顶层 width/opacity 标有迁移提示；OD 不是道路。跨日期线核实 enableGeodesic。[Arc](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocArc) |
| 真实时间轨迹 / 尾迹 | `Trail`，path 为 TrailPoint[] | **每点顺序是 [lat,lng,time]**；按时间排序，统一播放范围与倍速 | 缺时间会采用默认匀速，这不能说是真实速度；不要按 GeoJSON 的 lng/lat 顺序直接传。[Trail](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocTrail) |
| 线形管道 / 网络 | `Pipe`，PipeLine | 使用真实管线路径与业务属性，按层样式控制 | 不是默认物流OD表示，物理半径/高度不得编造。[Pipe](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocPipe) |
| 区域 / 地理围栏强调 | `Area` / `Wall` | AreaPlane 或 WallLine，区域指标与边界 | 墙体是强调手段；统计以面色阶/详情为准，避免围墙遮挡主要指标。[Area](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocArea)、[Wall](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocWall) |
| 建筑 / 区域指标拉伸 | `Prism`，AreaPlane[] | 面轮廓 + PrismStyle 的高度/颜色 | 此 Prism 与 Loca 点柱输入不同；物理高度与业务高度需分别标识。[Prism](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocPrism) |
| 行政区边界展示 | `DistrictOverlay`，adcode | 明确行政编码和覆盖范围，配合统计展示 | 一个 adcode 边界展示不自动完成任意多区域数据 join；没有覆盖时用自有 Area。[DistrictOverlay](https://lbs.qq.com/webApi/visualizationApi/visualizationDoc/visualizationDocDistrictOverlay) |

TMap GL 另有 `TMap.MarkerCluster` 用于屏幕点聚合。它和 Grid/Hexagon 的统计网格不是同一种表达；如果用户要逐条查看高密度门店，可用聚合而非热力。[点聚合](https://lbs.qq.com/webApi/javascriptGL/glDoc/glDocCluster)

## 关键实现约束

- 不存在统一的“所有层都吃 GeoJSON”契约：Dot/Heat 使用命名 lat/lng；Arc 用 from/to LatLng；Trail 用纬度在前数组；Area/Prism 再按各自对象规范转换。保留源数据只创建目标副本。
- Heat 的自动聚合预处理会影响分布，不能把性能开关当作无数值影响。零权重记录应保留在业务数据/详情中；是否不参与热力另行说明，不能转成缺失或默认为1。
- 官方 Arc/Trail 提供 process/toggle 等动画配置，但“动画开关”与真实时间回放不同。Dot 和 Arc 的旧参数已出现迁移提示，具体使用新旧哪一套须对应当前加载版本。
- 每个图层的 addTo/setData/show/hide/remove/destroy 按其类参考管理。控制动画、拾取回调、切换清理与底图状态分别验收。

## 给 Agent 的选择建议

门店规模用 Dot；少量告警可用 Dot 动画，地理半径确有意义才选 Radiation；非负整数事件密度用 Heat；明细点数汇总用 Grid/Hexagon；物流关系用 Arc；有实体和时间的移动数据用 Trail。小数比率、负温度、已汇总网格不要勉强适配 count 契约。

新任务核对 GCJ02 来源及供应商切换见 [公共接入约定](../providers.md)，完成 [匹配规则](../selection.md) 的选型结果后生成代码。
