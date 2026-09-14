# 百度地图：JSAPI 与 MapVGL 可视化选型

核查：2026-09-13，百度地图 JSAPI 4.0 / 历史 GL 文档及 MapVGL 官方参考。**JSAPI、MapV、MapVGL 是不同层次的能力**。本清单区分 JSAPI 原生能力与 MapVGL。JSAPI 4.0 的真实底图及原生路线已完成文末限定范围的验收，MapVGL 组合仍待逐项验证。

## 先处理版本组合

新基础地图可选 JSAPI 4.0，默认 BMap，兼容 BMapGL；MapVGL 快速入门仍展示历史 GL 加载方式。两份文档都存在，不代表可以直接把历史实例换成 4.0 后声称全图层兼容。记录实际 JSAPI、命名空间/兼容模式、MapVGL 版本、额外包，先用最小点层与目标层验收。不要为了套 Demo 无说明地降低用户 SDK 版本。[4.0 升级](https://lbs.baidu.com/docs/jsapi?title=jsapi4/upgrade)、[MapVGL 入门](https://mapv.baidu.com/gl/docs/index.html)

## 能力与数据匹配

| 效果 / 适用数据 | 接口与来源 | 映射与选择要点 | 限制 / 备选 |
|---|---|---|---|
| 少量业务标记、线、面、距离圈 | JSAPI 原生覆盖物 | 数据位置、类别、基础样式与点击 | 按 4.0 或历史 GL 的对应参考实现，不混用加载/添加方法。[JSAPI 导航](https://lbs.baidu.com/docs/jsapi?title=jsapi4/index) |
| 批量散点、气泡、分类点 | 官方扩展 `mapvgl.PointLayer` | Point 几何 + 业务属性；size、color、unit；大小先按面积规则算 | 逐点取值方式按当前图层契约核验，必要时分组；不是 BMap 原生 BubbleChart。[PointLayer](https://mapv.baidu.com/gl/docs/PointLayer.html) |
| 波纹 / 告警强调 | 扩展 `RippleLayer` | Point，size、color、duration；使用稳定点层辅助定位 | 波纹周期不代表业务采样；m 与 px 表达不同，暂停退静态点。[RippleLayer](https://mapv.baidu.com/gl/docs/RippleLayer.html) |
| 点聚合与展开 | 扩展 `ClusterLayer` | Point；clusterRadius、showText、聚合点击 | 要详情时核实 enablePicked 与返回 dataItem/children；默认计数不是指标汇总。[ClusterLayer](https://mapv.baidu.com/gl/docs/ClusterLayer.html) |
| 二维密度 / 3D 热力 | 扩展 `HeatmapLayer` | 点分布、gradient、min/max、size、height | 权重先按当前具体契约绑定；height 默认0更适合二维，三维需验证版本/遮挡。[HeatmapLayer](https://mapv.baidu.com/gl/docs/HeatmapLayer.html) |
| 独立点热度强调 | 扩展 `HeatPointLayer` | 单点热效果而非区域总量结论 | 与连续核密度不同，不能混称计算等价。[HeatPointLayer](https://mapv.baidu.com/gl/docs/HeatPointLayer.html) |
| 网格 / 蜂窝聚合 | 扩展 `HeatGridLayer` / `HoneycombLayer` | 点聚合；核实尺寸、数值字段、颜色和高度 | 跨平台严格比较应预计算共同网格；不能只保证同色就当同值。[HeatGridLayer](https://mapv.baidu.com/gl/docs/HeatGridLayer.html)、[HoneycombLayer](https://mapv.baidu.com/gl/docs/HoneycombLayer.html) |
| 路径、批量线 | 扩展 `SimpleLineLayer` 或 JSAPI 折线 | LineString + 线的业务值 | 已有路径与 OD 示意分开，详情须按具体层的拾取能力实现。[SimpleLineLayer](https://mapv.baidu.com/gl/docs/SimpleLineLayer.html) |
| 动态飞线 / OD 关系 | 扩展 `FlyLineLayer` | LineString，颜色、纹理宽度/长度、移动步长 | 此层额外依赖 **mapvgl.threelayers**；两点关系不等于真实轨迹，也不自动包含测得弧高。[FlyLineLayer](https://mapv.baidu.com/gl/docs/FlyLineLayer.html) |
| 区域统计色阶 | 扩展 `PolygonLayer`，或 JSAPI 多边形 | Polygon/MultiPolygon + 关联指标 | 保留环/洞，核验输入支持；区域名称不能代替边界。[PolygonLayer](https://mapv.baidu.com/gl/docs/PolygonLayer.html) |
| 立体面 / 指标拉伸 | 扩展 `ShapeLayer` | Polygon footprint，properties.height 与样式 | 高度映射和物理楼高区分；特效材质不替代数值图例。[ShapeLayer](https://mapv.baidu.com/gl/docs/ShapeLayer.html) |
| 栅格值 / 高程着色 | 扩展 `PixelLayer` 与相关 JSAPI 影像层 | 有地理范围/分辨率的图像或栅格，noData 与颜色计算 | 需要额外解析源格式；不能把附件普通数值表当已定位栅格。[官方像素说明](https://lbsyun.baidu.com/docs/jsapi?title=jspopularGL/guide/PixelPersonalization) |

## 输入与生命周期

MapVGL 常见输入为含 `geometry` 与业务字段的数组，由 `View({map})` 管理图层，`view.addLayer(layer)` 后 `layer.setData(data)`。这不等于对所有图层直接传整个 FeatureCollection；具体读取顶层字段还是 properties 要按对应类确认。[入门](https://mapv.baidu.com/gl/docs/index.html)、[Layer 公共接口](https://mapv.baidu.com/gl/docs/Layer.html)

需要拾取、可见切换或动画暂停时，提前检查具体图层的方法，不能只凭存在同名属性推断支持。切图清理 View、附加图层、计时器、Three 资源及地图实例，失败回退要保留源数据与业务映射。

地图基础层和数据坐标分别处理；国内/境外的目标 datum 遵守 [公共接入约定](../providers.md)。不将 MapV Canvas 的 draw 配置写到 MapVGL 类上，也不从百度开发者社区的泛化文章猜造 `Viewer`、`HeatLayer`、`FlowLayer` 等未由本次官方参考确认的构造器。

## 给 Agent 的选择建议

用户要炫酷告警选 Point+Ripple，OD 选经过验证的 FlyLineLayer 路线，需要业务统计可核对时选面/共同格网；数据量大本身并不能证明要开启 Three 或3D。按真实时间回放必须另外核对所选轨迹图层的逐点时间契约；只有飞线动画能力时，不称为真实采样回放。

MapVGL 与目标 JSAPI 兼容未确认时，使用当前版本能验证的 JSAPI 原生点线面方案，并明确缺少的动画与3D效果。返回 [能力索引](index.md) 或 [匹配规则](../selection.md)。

## JSAPI 4.0 原生增强与实测边界

- 4.0 还提供原生 `BMap.LineLayer`：`map.addLayer(layer)`，`layer.setData(FeatureCollection)` 支持 LineString / MultiLineString，style 可用表达式按 properties 配色。它与 `mapvgl.SimpleLineLayer` 是不同接口，不必为所有批量线都引入 MapVGL。[原生 LineLayer 官方指南](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/layer/line)。该批量层仅文档核查，本次实测采用原生 Polyline。
- 2026-09-13，用户提供的 AK 在本地 JSAPI 4.0 默认 `BMap` 命名空间下，实际显示北京、新加坡与罗马底图；新加坡 89 条 NParks 连道以 `BMap.Polyline` 呈现，保留 WGS84 坐标，未误加国内偏移。依据：[百度坐标约定](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/concept/coord)、[Polyline 指南](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/overlayline/polyline)。
- 同一数据与 Mapbox GL JS 3.28.1 做 A→B→A，12 项检查通过：筛选、选中业务 ID、完整路径、模式、视野往返、旧实例销毁、百度原生拾取、空态恢复和移动布局。不同投影不声称逐像素等价；本次未验证百度热力、区域面层或 MapVGL 组合。
- 应用按钮应位于独立于 SDK 容器的 stacking context，避免百度内部交互 mask 遮住按钮；不要通过关闭 SDK 的 pointer events 修复。
- 恢复视野核对 `setViewport` 的 margins/zoomFactor 和实际地理范围，不只复制 zoom。它可能增加余量；新实例完成视野设置后再显示，维护逻辑地理范围，避免连续互切累计扩大。[Map.setViewport](https://lbs.baidu.com/jsapi/refdoc/v4/classes/BMap.Map.html#setViewport)

## 个性化底图与可视化配合

用户要求暗色、科技感路线时，底图也应纳入生成方案，不只给覆盖物加光晕。JSAPI 4.0 可使用 `map.setMapStyle({styleJson})` 应用本地维护的规则，控制陆地、水域、道路、标签与图标；也支持 `styleId`，但官方要求 styleId 与 AK 属于同一用户。不要使用不明来源的演示 Style ID，或把缺少 styleId 当成无法个性化的理由。[官方风格指南](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/map/style)。

2026-09-13，新加坡路线对照作品已用本地 JSON 应用深色底图并重做 12 项回归。基础道路的填充与描边都需处理，避免残留亮黄色、白色道路与业务线混淆；通过实际截图验证目标地域与缩放级别下的效果。版权/审图信息保留；不以整张地图的 CSS 反色滤镜代替要素样式。
