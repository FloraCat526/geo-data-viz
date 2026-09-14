# Maptec：数据可视化选型

核查：2026-09-13。证据来自用户授权的 Maptec 文档仓库与 SDK 源码，不是对所有线上环境的发布保证。当前源码包版本 `1.2.0`，快照 `maptec-js@a6ff59b1`；文档与 Demo 快照 `maptec-docs@132fcb1`。本文件不随包分发供应商源码、SDK、Key 或私有加载地址。

生产接入补测：同日使用线上文档配套 SDK/CSS（资源指纹 `cbb3705e`）及用户授权的生产浏览器 Key，在 localhost 演示中 SDK 加载成功；鉴权返回 `10015 / Referrer 受限`，底图与高级图层未通过验收。接入必须核对 Key 的允许来源，不能将 HTTP 200 当作业务鉴权成功，也不能通过伪造来源绕过限制。

## 能力与数据匹配

| 效果 / 适用数据 | 接口与来源 | 映射与选择要点 | 限制 / 备选 |
|---|---|---|---|
| 批量散点 / 分类点 / 数量气泡 | 原生 `GeoJSONOverlay`，`circleStyle` | Point Feature；`circleRadius`/`circleColor` 属性与公共圆样式；半径取数量平方根 | `BubbleChart` 是 Demo 名称，不是构造器；绘制属性写入派生副本，保留原属性与业务 ID。证据 M1/M2 |
| 少量距离圈、光晕 | 原生 `CircleOverlay` | `centers`、`radius`、`unit`、fill/stroke；实际范围用地理单位 | `pixels` 的视觉大小不是服务半径。证据 M1/M2 |
| 呼吸 / 波纹告警 | `CircleOverlay` 组合 | 稳定核心 + 外环，由动画更新半径/透明度；样式字段是 `strokeWidth` | `BreathingPoints` 不是内置类；动画是装饰，不证明告警实时刷新。大量逐点 RAF 要评估。证据 M2 |
| 点聚合、点击展开 | 原生 `GeoJSONOverlay.pointCluster` | enabled、clusterRadiusPixels、clusterMaxZoom 等；区分原始点 ID 与 cluster ID | 不能把其他 SDK 的 cluster 配置名直接搬来；共用统计网格不依赖原生 cluster 成员。证据 M1/M2 |
| 二维密度 / 非负加权热力 | 原生 `HeatmapOverlay` | `points: [{position, weight}]`，radius、minWeight/maxWeight、gradient、intensity | 权重是数量/贡献，非默认风险率；高密度与高权重可叠加，逐点详情宜辅以点层。证据 M1/M3 |
| 3D 热力曲面 | 原生 `Heatmap3DOverlay`（源码快照已导出） | 同类点权重；height、unit、depthTest、heightAnimate 等 | 构造器在用户目标 SDK 中存在才选；高度是热度表达，不是地形/建筑实高。降级二维热力。证据 M1/M3 |
| 普通路径 / 路段统计 | 原生 `PolylineOverlay` 或 `GeoJSONOverlay` 线样式 | 已有路径；颜色与宽度映射业务值，流向箭头按版本核实 | 不把首尾直连当道路；不假定支持全部 Mapbox line-* 表达式。证据 M1/M4 |
| OD 弧线与脉冲飞线 | 原生 `PulseLinkOverlay`（源码快照已导出） | `links: [{start,end,properties}]`；lineWidth、lineColors、height、pulseSpeed | 与腾讯 from/to、高德 GeoJSON 均不同；pulseSpeed 是视觉速度，不自动对应真实物流速度。降级二维方向线。证据 M1/M3 |
| 区域分级设色 / 批量面 | 原生 `GeoJSONOverlay` / `PolygonOverlay` | Polygon/MultiPolygon + 指标；保留洞、稳定 ID、边界版本 | 不默认把面转质心点；多部件事件及变更后的数据更新要验收。证据 M1/M4 |
| 区域/建筑指标柱 | 原生 `PrismOverlay` | 底面 positions 与 altitude、topColor、sideColor | 当前接口 altitude 与 Loca height 命名不同；真实高度和指标缩放分开。可退为面色阶。证据 M1/M4 |
| 有时间的轨迹 / 小车移动 | 原生 `PointKeyFrameTrack` / `PolylineKeyFrameTrack`，配套相机 track | 先按实体与时间组成轨迹，再生成关键帧与控制播放 | 需读当前动画类参数，不能把其他厂商 moveAlong 当 Maptec API；相机动画不等于数据时间轴。证据 M1/M4 |
| 方格 / 蜂窝分析 | 分析端预计算 + `GeoJSONOverlay` 面，或按需求构建 Prism | 固定网格成员、计数/求和/比率口径，派生显示坐标 | 本次未确认专用 Grid/Hexagon 构造器，不编造；已聚合单元不能再默认按点数聚合。证据 M1 + 工程组合 |

## 已核实的输入差异

以下仅为接入契约示意，假定变量来自已验证数据，不是可独立运行的示例：

```js
// 热力：不是 GeoJSON 直接传给 points，也不是 {lng, lat, count}。
const heatPoints = features.map(f => ({
  position: f.geometry.coordinates,
  weight: f.properties.orders
}));
// OD：保留原业务属性，供按线样式回调和详情使用。
const links = odRows.map(row => ({
  start: row.origin,
  end: row.destination,
  properties: {id: row.id, volume: row.volume}
}));
```

当前热力构造选项为 `minWeight`/`maxWeight`，部分生成参考文档同时有 `minimumWeight`/`maximumWeight` 访问器说明，不能互换。CircleOverlay 与 GeoJSONOverlay 的样式字段也不相同。应以目标 SDK 对应声明与 Demo 为准。

## 证据定位与版本门控

这些是外部仓库的定位说明，不是本 Skill 的文件依赖；第三方安装者无需拥有这些仓库即可阅读本清单，但生成具体新接口代码前需取得匹配版本的公开文档、类型声明或用户提供的 SDK 信息。

| 标记 | 本次核查位置 | 能证明什么 |
|---|---|---|
| M1 | `maptec-js@a6ff59b1`：`src/index.ts`；`package.json` | 默认对象及 named exports 中可见 Circle/Polyline/Polygon/Prism/Heatmap/Heatmap3D/PulseLink/GeoJSON 与关键帧类；仅为当前源码快照 |
| M2 | `maptec-docs@132fcb1`：`apps/maptec-docs/public/examples/html/` 中 BubbleChart、BreathingPoints、PointClusterBasic | 气泡样式映射、核心+外圈组合、原生点聚合与独立光晕的实际写法 |
| M3 | `maptec-js@a6ff59b1`：`src/ui/overlay/heatmap_overlay.ts`、`heatmap_3d_overlay.ts`、`pulse_link_overlay.ts`、`pulse_link_geometry.ts`；对应 HeatmapBasic、Heatmap3D、PulseLink Demo | 输入类型、参数名、单位、动画及部分生命周期契约 |
| M4 | 文档仓库 `apps/maptec-docs/src/docs/zh-CN/javascript-api-reference/overlay/` 与 SDK 导出/动画声明 | 基础覆盖物与关键帧接口的参考；发布包仍需核验 |

生成前记录用户环境的 SDK URL/包版本、CSS、底图 datum 和所用类；针对所选路线核验构造器及关键方法。查不到声明、与部署版本不一致或运行时缺类时，标待核实并选有依据的降级路线。不要说“源码里有，所以所有线上 Maptec 都支持”。

参考版本中的 `map.project` 是私有接口；优先使用当前版本可核实的原生覆盖物。缺原生能力时可补充 Canvas/第三方层，但需有公开接入/投影依据，不能依赖该私有投影接口。真实底图的 style 切换、筛选更新、拾取、visible 与清理需要实际回归。

返回 [能力索引](index.md) 或 [数据匹配规则](../selection.md)。
