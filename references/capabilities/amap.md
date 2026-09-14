# 高德：JSAPI 与 Loca 可视化选型

核查：2026-09-13。基础采用 AMap JSAPI 2.0；高级路线采用 **Loca 2.x 官方扩展**，不是全部内置在 AMap 中。Loca 1.x 与 2.x 不混用；锁定实际 SDK 与 Loca 小版本，真实 Key 的本地国内底图与海外权限检查见文末；Loca 各层尚未逐项验收。[版本关系与接入](https://developer.amap.com/api/loca-v2/intro)

## 能力与数据匹配

下表 Loca 类与参数依据 [Loca 2.x API](https://a.amap.com/Loca/static/loca-v2/doc/html/index.html)，规则列是面向本 Skill 的选型建议。

| 效果 / 适用数据 | 接口与来源 | 映射重点 | 限制 / 备选 |
|---|---|---|---|
| 批量散点 / 数量气泡 | 扩展 `Loca.PointLayer` | Point GeoJSON，radius 与 color 的数据映射；面积对应数量 | 尺寸单位与高度分别配置；少量业务标注可直接用 AMap.Marker/CircleMarker |
| 告警呼吸 / 贴地光晕 | 扩展 `Loca.ScatterLayer` | Point 数据；颜色分级、size 与 duration、动画控制 | ScatterLayer 是动画效果路线，不能与 PointLayer 的 radius 参数混写；屏幕姿态需按业务选 |
| 图标与标签 | 扩展 `IconLayer` / `LabelsLayer` | 位置、分类图标、必要文字 | 逐条可读标签需要碰撞与可见级别策略，不给所有密集点强制全标签 |
| 线统计 / 真实路径 | 扩展 `LineLayer`；原生 AMap.Polyline | LineString，线宽与颜色按业务绑定 | 路径应已存在，不能用演示曲线假装路网 |
| OD 高亮弧线 / 连接 | 扩展 `LinkLayer` | OD 转成适配的线几何，线宽/高度/颜色 | 不把标量 count 当路径；弧高一般为装饰 |
| 动态轨迹方向强调 | 扩展 `PulseLineLayer` | 有序线几何 + 脉冲样式 | 脉冲匀速动画不是按真实采样时间回放；真实回放用业务时钟或 MoveAnimation |
| 动态 OD / 飞线 | 扩展 `PulseLinkLayer` | 两端关系 + 流量，保留方向 | 与 Maptec PulseLinkOverlay 名称/数据契约不同；无动画时退为 Link/Line |
| 二维 / 3D 热力 | 扩展 `HeatMapLayer` | value、radius、min/max、gradient；height 控制曲面表达 | 类名是 Heat**Map**Layer；二维时明确 height；数量热力不自动适合比例/温度 |
| 网格 / 蜂窝聚合 | 扩展 `GridLayer` / `HexagonLayer` | radius、unit、value 回调、颜色及 height | 聚合回调需确认 feat 内容；严格跨图比较先统一格网，不能各自默认重聚合 |
| 区域设色 / 面拉伸 | 扩展 `PolygonLayer`；原生 AMap.Polygon | Polygon + 指标、topColor、height | 真实区域边界与数据关联；统计高度需解释单位换算 |
| 点位置上的柱状体 | 扩展 `PrismLayer` | 点位置 + 尺寸/高度/色，表达区域或实体规模 | 3D 容易遮挡，可配二维气泡；不能将其点输入和 PolygonLayer 面输入混淆 |
| 辅助强调 / 相机动画 | 扩展 `LaserLayer` / `ViewControl` | 重点目标与镜头叙事 | 仅在能帮助理解时启用；相机飞行不构成数据时间变化 |

点聚合还有 JSAPI 插件 `AMap.MarkerCluster`，按距离聚合；`AMap.IndexCluster` 按索引维度聚合。两者与 Loca Grid/Hexagon 的统计表达不同。原生聚合的 `weight` 还可影响聚合中心，不能据此推断显示值就是业务权重总和。[聚合指南](https://lbs.amap.com/api/javascript-api-v2/guide/amap-massmarker/marker-cluster)、[权重点示例](https://developer.amap.com/demo/javascript-api-v2/example/mass-markers/markerclusterer-weight)

真实小车路径回放可使用 JSAPI 2.0 的 `AMap.MoveAnimation` 插件与 Marker 的 moveAlong/moveTo，具体按已选版本核查时间/分段配置；速度不能由没有时间的轨迹推造。[JSAPI 插件表](https://lbs.amap.com/api/javascript-api-v2/guide/abc/plugins-list)

## 接入与数据约定

- JSAPI 2.0 加载与安全配置完成后创建 `Loca.Container({map})`，数据常用 `Loca.GeoJSONSource({data})`，通过所选层的 `setSource` 与 `setStyle` 绑定。GeoJSON 的位置是经度在前，但叠到高德时需经过明确的目标坐标转换。[Loca API](https://a.amap.com/Loca/static/loca-v2/doc/html/index.html)
- GeoJSON 是载体，不意味着所有图层接受同种 geometry。点层、线层、面层分别匹配几何；格网输入通常为点，不把已聚合面再次当原始点。
- ScatterLayer 的动画需要合适的**序列帧纹理**，设置 `animate`/`duration` 并启动 `loca.animate.start()`；仅设颜色和 animate 不会自动生成呼吸效果。使用自有或已获授权的纹理，缺资源时生成自有纹理交给 Loca 绘制，或改用 AMap.Circle 原生覆盖物并准确说明效果差异，不热链无关图片。
- 暂停/停止与图层销毁一起管理。部分 `setStyle` 会把省略字段恢复默认值，不能按增量 patch 心智随意更新，否则固定图例与映射可能改变。
- `px` 与 `meter`、size 与 radius、altitude 与 height 都要按具体类解释；不要把 Loca 1.x 的配置复制到 2.x。版本已有废弃字段时采用匹配的新参数。

## 给 Agent 的选择建议

气泡用 PointLayer，类似 BreathingPoints 的装饰强调用 ScatterLayer；密集事件看分布选 HeatMapLayer，需要可核对统计值选 Grid/Hexagon 或预计算区域；物流 OD 用 PulseLinkLayer，真实道路方向用 PulseLineLayer，真实时间回放另行组织时间。

如果用户只需少量标注或纯二维比较，基础覆盖物即可。若 Loca 不可用，按 [能力索引](index.md) 的降级约定改用公开基础层或共同二维实现，明确失去的动画/3D 能力。安全密钥与其他加载信息见 [公共接入约定](../providers.md)。

## 海外数据的接入门槛与实测

- 使用包内适配器时，将布尔值 `showOversea: true` 放入传给 `createProvider('amap', ...)` 的运行配置；适配器会转交给 `AMap.Map`，默认保持关闭。
- 新加坡、意大利等海外案例，除 JSAPI Key 和安全配置外，还需世界地图能力。创建 `AMap.Map` 时显式设置 `showOversea:true`；这只是启用开关，不会给 Key 自动开通权限。官方将世界地图列为高级能力，通过工单申请：[世界地图指南](https://lbs.amap.com/api/javascript-api-v2/guide/map/world-map)。官方页面的完整示例可核对 `showOversea` 参数。
- **`complete` 不代表底图可用**：2026-09-13 使用用户提供的 Key / securityJsCode，本地 JSAPI 2.0 的北京底图实际显示道路与标注；新加坡未开 `showOversea` 时仅显示网格，但仍触发 `complete`，且 89 条原生 Polyline 可画。开启后 SDK 返回 `FlyDataAuthTask error: INSUFFICIENT_PRIVILEGES`，因此这组 Key 未通过海外底图验收。不能把“覆盖物可见 + complete”记成地图成功。
- 此情况下保持已有供应商的可用结果，报告海外能力未获准；不要把新加坡数据移动到中国、伪造背景、或把空网格当成海外地图。Key 获得权限后，再验收海外真实底图和 A→B→A 状态保留。
- 本次只确认国内底图可用与海外权限不足；没有据此验证 Loca 热力/面层、国内业务坐标转换，或多供应商切换。安全配置只保存在项目外的本地开发配置中。
