# Mapbox：数据可视化选型

核查：2026-09-13，Mapbox GL JS 3.x 官方文档。锁定任务实际使用的 JS/CSS 版本；文档中的最新示例版本不等于任务实际版本。文末记录的是历史独立作品的验证范围，不是当前发布包的逐项验收。常用原生层的代码入口见 [配方说明](../mapbox-recipes.md)。

## 能力与数据匹配

| 效果 / 适用数据 | 接口与来源 | 映射与选择要点 | 限制 / 备选 |
|---|---|---|---|
| 散点、分组点、数量气泡 | 原生 GeoJSON source + `circle` | `circle-radius` 用 px 半径；预计算 sqrt 规模，颜色用业务属性 | 不要给每条记录建 DOM Marker；缺失另编码，极值刻度需说明。[circle](https://docs.mapbox.com/style-spec/reference/layers/#circle) |
| 呼吸、发光点 | 原生 `circle` 样式动画组合 | 稳定核心 + 自己驱动的外环；原生 circle 图层由 SDK 绘制，Agent 仅更新样式属性 | 是原生层组合效果；叠加顺序需验证，暂停后停止样式更新。[circle 样式](https://docs.mapbox.com/style-spec/reference/layers/#circle) |
| 点聚合与展开 | 原生 GeoJSON source `cluster` | `clusterRadius`、`clusterMaxZoom`、聚合数量与展开缩放 | 聚合点计数不自动等于销售总额；自定义聚合属性需单独配置。[官方示例](https://docs.mapbox.com/mapbox-gl-js/example/cluster/) |
| 密度 / 加权热力 | 原生 `heatmap` | `heatmap-weight` 对应非负贡献，`heatmap-radius` 控制像素平滑范围；`heatmap-color` 取热密度 | radius、intensity 和缩放策略都会改变外观，不能与别家默认热力作数值等价对比。[热力示例](https://docs.mapbox.com/mapbox-gl-js/example/heatmap-layer/) |
| 方格 / 蜂窝统计 | 预计算 Polygon + 原生 `fill` | 固定格网与聚合规则；显示格网统计值 | Mapbox 样式规范没有通用 `hexagon` 图层类型，不发明；预计算是分析步骤，绘制仍用 fill。[fill](https://docs.mapbox.com/style-spec/reference/layers/#fill) |
| 区域分级设色 | 原生 `fill` + `line` | GeoJSON / vector source，基于属性或 feature-state 着色 | 区域边界与统计表先关联；切 style 后恢复自定义 source/layer 与选择态。[图层规范](https://docs.mapbox.com/style-spec/reference/layers/) |
| 路线、线宽/颜色/渐变 | 原生 `line` | 流量映射宽度、类别或变化映射色；渐变场景核实 `lineMetrics` | OD 必须先生成关系线几何；原生 line 不自动算驾车路线。[数据驱动线](https://docs.mapbox.com/mapbox-gl-js/example/data-driven-lines/) |
| 动态飞线 / OD 弧线 | 原生 line 几何与样式动画组合 | 起终点、流向和流量；是否需要 3D 弧高 | 不是内置 `PulseLinkLayer`；动态脉冲另实现，需真实 3D 弧高且原生路线不满足时可评估第三方 ArcLayer，记录缺口与集成版本。[line](https://docs.mapbox.com/style-spec/reference/layers/#line) |
| 时间轨迹、尾迹 | 按时间更新原生 source/marker/line | 按实体组织路径与相对时间，统一 currentTime | 不能把日期独立事件串成轨迹；大路径频繁 setData 需实测。原生更新无法满足目标尾迹能力时，可评估第三方 TripsLayer 补充并单独核验。[GeoJSON source](https://docs.mapbox.com/mapbox-gl-js/api/sources/#geojsonsource) |
| 区域/建筑拉伸 | 原生 `fill-extrusion` | footprint + `fill-extrusion-height` / base / color | 高度是米制空间量，若映射业务指标须标注比例；二维 fill 可作备选。[拉伸示例](https://docs.mapbox.com/mapbox-gl-js/example/3d-extrusion-floorplan/) |
| 栅格影像 / 栅格时间帧 | 原生 image/raster source + `raster` | 有地理范围的真实栅格或预生成帧 | 需要专门数据解析；不是把 Excel 数值随便贴成图片。[影像动画示例](https://docs.mapbox.com/mapbox-gl-js/example/animate-images/) |
| 原生层未提供的特殊 3D | 第三方或 CustomLayerInterface 自定义补充 | 记录原生缺口、实际库/shader、版本与投影条件 | 不能冒充 Mapbox 原生效果；核对遮挡、拾取、清理，保留符合目标的二维备选 |

## 关键实现约束

- 顺序是 source → layer → styles/events。数据更新优先更新 source；卸载先停动画与监听，移除依赖 source 的 layer，再删除 source。
- **点击结果的业务 ID 要实测**：本 Skill 规范化输出使用字符串 Feature ID。本次 GL JS 3.28.1 实测，直接传顶层字符串 ID 时，拾取结果的 `feature.id` 未保留。可将稳定 ID 复制到无冲突的属性（例如 `viz_id`），为 GeoJSON source 设置 `promoteId:'viz_id'`；或从事件的该属性回查业务对象。不要用会随过滤/顺序变化的 `generateId` 数组序号代替业务 ID。非聚合点用业务 ID，聚合展开仍用 `properties.cluster_id`。[GeoJSON source 规范](https://docs.mapbox.com/style-spec/reference/sources/#geojson-promoteId)
- 统一统计与阈值保存于业务层；表达式不让 `null` 自动变 0。点半径、线路宽度、柱高度的单位分别处理。
- 地图 style、projection、terrain、pitch 会影响自定义图层和绘制顺序；标准底图的 slot 与旧样式的 beforeId 不是同一约定。查目标样式文档后实现，不固定插到猜测的图层 ID。
- 原生 `heatmap` 是二维密度着色，不因地图俯仰就变成 3D 热力曲面。高度场应单独选型，保留二维热力备选。

## 给 Agent 的选择建议

点线面统计使用原生数据驱动图层；点太密又需详情时以 cluster/分层可见性提升可读性；固定区域统计用共同预计算面，OD/时间轨迹通过公开原生层的数据/样式更新组合动画。跨平台时保持原始业务 Feature ID，不能把供应商临时 cluster ID 当实体 ID。

接入与切换生命周期见 [公共接入约定](../providers.md)，方案记录见 [匹配规则](../selection.md)。

实测补充（2026-09-13）：使用 NEA 新加坡小贩中心的完整 129 个位置，按熟食摊位数生成独立作品，已运行原生 circle 气泡、GeoJSON cluster/symbol 与 weighted heatmap；4 个真实零值保留。该案例证明上述路线在本次 GL JS 3.28.1 / Token / 浏览器组合下可运行，不代表所有能力或大规模数据性能已验证。

实测补充（2026-09-13，多几何案例）：190 条 INGV 地震事件通过恒定权重 1 的原生 heatmap / circle；89 段 NParks 连道通过原生分类 line 与模糊光晕；7,896 个 ISTAT 市镇面通过 fill / line 地区归属和派生面积固定五分位设色。逐一核对源几何，保留 336 个 MultiPolygon 和 56 个内环，并实测 Monreale 内环留空及其周围面可拾取。三例共 41 项端到端与 4 项专项检查通过。范围仍为 GL JS 3.28.1 / 本地 Chrome / 固定数据快照；不代表六家地图互切、任意文件或百万级性能已验证。

跨地图视野实测补充（2026-09-13）：Mapbox→百度→Mapbox 的 89 段新加坡连道验收发现，fitBounds 的 padding 残留及恢复视野时过低的 maxZoom 会改变范围。临时适配可用 `retainPadding:false`，恢复范围不要复用查看单条记录的缩放上限；真实互切需核对中心与跨度，并对不同投影保留合理精度边界。[CameraOptions](https://docs.mapbox.com/mapbox-gl-js/api/properties/#cameraoptions)。本次修正后的原生路线案例完成 12 项检查，不代表其他作品的互切路径已复验。
