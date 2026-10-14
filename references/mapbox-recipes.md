# Mapbox 原生图层实现细节

按需读取：Agent 已选 Mapbox，并确定点、数量气泡、聚合、热力、线、面或拉伸方案时使用。默认模式使用 Mapbox GeoJSON source 与原生样式层；散点柔光也采用原生圆图层。显式启用 `blendMode: additive` 时，公开组件由 deck.gl 补充加法叠加，并保留原生拾取源，详见[散点外观](class-reference.md#散点外观光晕与颜色叠加)。此模式必须使用 `PointViz/createViz`，直接 `mountRecipe` 会拒绝而非生成空白图。`layer.inspect()` 返回当前地图实际注册的 source/layer 类型，供验收；该检查仅针对本原生配方，不能拿它否定另行实现且已声明的补充层；注册通过仍不等于真实底图可见。当前起点固定 GL JS/CSS 3.28.1；其他版本需核查兼容性。官方接口依据：[source/layer](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/)、[聚合](https://docs.mapbox.com/mapbox-gl-js/example/cluster/)、[热力](https://docs.mapbox.com/mapbox-gl-js/example/heatmap-layer/)、[拉伸](https://docs.mapbox.com/mapbox-gl-js/example/3d-extrusion-floorplan/)。

## 选择与打包

本页适用于明确使用 Mapbox 的任务。未指定图商且没有已授权配置时使用 [MapLibre 免 Key 配方](capabilities/maplibre.md)；新统一入口及授权配置文件用法见 [生成指南](generation.md)。旧 Mapbox 打包器不改变图商默认值。模块复用时须同时保留 `gl-layers.mjs` 依赖。

先生成 `profile.json` / `normalized.geojson`，确定业务含义，再写本次 spec，例如：

```json
{
  "title": "门店订单规模",
  "description": "每条记录是一家门店，面积比较订单量；点击查看详情。",
  "sourceLabel": "来源：本次上传的门店表",
  "effect": "bubble",
  "unit": "单",
  "alternatives": [{"effect": "cluster"}, {"effect": "heatmap", "weight": "value"}]
}
```

备选按用户问题确定，不机械复制。上例加权热力仅在订单量可作为非负空间贡献、用户关心贡献分布时成立。没有切换需求时不填 alternatives；聚合默认展示位置记录数，不会把圆内数字伪装成订单总量。

```bash
python3 "SKILL_DIR/scripts/build_mapbox_html.py" "WORK/profile/normalized.geojson" \
  --spec "WORK/map-spec.json" --out "OUTPUT/map.html" \
  --token-env MAPBOX_ACCESS_TOKEN
```

路径替换为实际值。`--token-env` 只能指定用户授权读取的变量，不自动搜索其他变量/项目。工具只接受 `pk.` 浏览器 Token；会将它写入本地 HTML，分享前移除。省略该参数仍生成页面，状态为 pending-key，且不请求 SDK。输出已存在时拒绝覆盖，可选择新路径或由 Agent 有意识地更新产物。

输入必须是已核实 WGS84 的规范化数据。工具检查几何、指标、稳定 ID，内嵌展示字段并安全转义 JSON，不把完整源属性全部带进网页。图例和详情是可修改起点，用户语言、发现、布局由 Agent 调整。独立文件依赖联网 SDK/底图；最终仍按生成指南实际启动与验收。

## 配方数据条件

| effect | 几何 | 明确条件/参数 |
| --- | --- | --- |
| points | Point | 等大点；默认固定色，可设 colorBy: category/value |
| point-color | Point | 有限指标 + unit；等大点，连续或阈值色阶 |
| bubble | Point | 有限非负规模 + unit；半径按 sqrt(value)，面积固定全量域。正负变化需显式 sizeMode: absolute，颜色保留符号 |
| cluster | Point | 每个位置记录的计数含义明确；点击可分页读取成员、展开缩放，同位置实体不会因无法展开而丢失 |
| heatmap | Point | weight: count 或 value；value 需非负可加贡献 + unit。缺失不填零，计数模式不读取业务数值 |
| line | LineString / MultiLineString | 原始线几何；固定宽度。OD 须注明关系，方向/流量宽度与时间动画另实现 |
| fill | Polygon / MultiPolygon | 默认有限指标 + unit；无指标时明确 colorBy: constant/category；连续/阈值色阶见下 |
| extrusion | Polygon / MultiPolygon | 非负指标 + unit + heightScale（每指标单位映射多少米）；注明真实高度或指标映射 |

混合几何、MultiPoint 不会静默筛掉或自动复制指标，先按 [转换配方](transforms.md) 明确各层与指标归属。零值气泡用空心定位符，缺失用灰点；热力色带只表达相对密度，不能标成精确测量。拉伸缺失值另画灰色面。

## 自定义页面时复用模块

```js
import {mountRecipe} from './mapbox-layers.mjs';
const layer = mountRecipe(map, normalized, spec, {
  onPick(result) { /* result.items 或聚合 count/loadLeaves/expand；使用安全文本 */ },
  onError() { /* 显示可处理的错误，不回显原始带 Token URL */ }
});
layer.setFilter(feature => feature.properties.__viz.category === '餐饮');
// layer.legend 是全量固定数值域；修改筛选不改变色阶。
// 先保存业务选中 ID/范围，再切图商；卸载 recipe 后才能移除所属 map。
layer.destroy();
```

模块监听样式、数据就绪和 idle，在 style.load 后恢复图层与当前筛选，提供稳定 ID 拾取和逆序清理。聚合异步成员/展开回调会检查源是否仍有效。更换数据应重新计算一次 spec/domain 并重建；切地图供应商保留原始数据、指标域、筛选和选择态，需要由作品控制器实现，该模块不包办各家切换。

当前资源仅是这些明确范围的起点；Google、百度、高德、腾讯继续依据各自能力文档生成。原生线不自动规划驾车路线，拉伸不等于三维热力，配方不含轨迹调度或脉冲动画。


## 颜色配置与可靠切换

`colorBy` 为 constant / category / value。points、line 默认 constant；point-color、bubble、fill、extrusion 默认 value。无指标的区域仍可使用 `fill, colorBy: constant/category`，并明确颜色不表示数值。类别取规范化的 `__viz.category`，指标取 `__viz.value`。类别模式默认最多 12 色；更多类别须显式提供足够的颜色或改变展示方式。color 与 missingColor 使用 #RRGGBB。气泡的正负规模保留 value 着色。

```json
{"effect":"point-color","unit":"℃","colorScale":{"type":"continuous","domain":[0,20,40],"colors":["#2563eb","#facc15","#ef4444"]}}
```

连续 domain 为升序数值节点，颜色数与节点数相同，超出端点使用端点色；单值数据允许两个相同端点。分级使用 `{"type":"threshold","breaks":[10,50],"colors":["#22d3ee","#a78bfa","#fb7185"]}`，三个区间为 `<10`、`10≤值<50`、`≥50`。分类使用 colorBy: category，配可选 `{"type":"categorical","domain":["A","B"],"colors":["#22d3ee","#a78bfa"]}`，显式域必须覆盖所有非空类别。缺失统一用 missingColor；零不是缺失。色域与图例基于全量数据，筛选不重算。

自定义页面可以复用 `createRecipeSwitcher`（从 gl-layers.mjs 导出）：

```js
const controller = createRecipeSwitcher(map, normalized, {provider:'maplibre', onPick});
const layer = await controller.show(spec); // 新层就绪后才移除旧层
// 连续切换时，旧请求返回 null；失败抛错并保留原层。
if (layer) layer.setFilter(predicate);
controller.destroy();
```

模块依赖 `assets/shared/color-scale.mjs`，自定义页面需一并分发；旧 `assets/recipes/color-scale.mjs` 仅为路径兼容入口。单独 mountRecipe 暴露 ready Promise：成功 true，失败或销毁 false。切换默认等待 15 秒；用户页面应报告失败，不留下永远 loading 的状态。

聚合计数同步：包含 cluster 的 GL 页面初始化 Map 时设置 `fadeDuration: 0`，避免圆拆分后旧计数继续淡出；计数 symbol 使用 `text-allow-overlap: true` 和 `text-ignore-placement: true`。fadeDuration 是地图级设置，会同时关闭该页面底图文字的放置淡入淡出，不影响相机缩放动画。自定义页面复用聚合配方时也须配置此项。

热力默认采用透明蓝色→青色→绿色→黄色→少量橙红热点色带，图例与图层共用色阶。`heatRadius` 控制像素扩散半径（默认 22）。未指定 `heatIntensity` 时，基于全量数据的 Mercator 网格邻域贡献估算第 95 百分位密度，生成随缩放变化的强度曲线，降低密集点叠加饱和；这是近似视觉校准，不是每平方公里的绝对密度。筛选及主题切换保持全量基准，同一缩放下可比较；不同数据集需共享手动参数后再作颜色比较。`heatIntensity` 可显式指定固定强度（大于 0 且不超过 10），覆盖自动校准。先核对 weight=count/value，权重比例不改变、不裁剪极值；极端离群密度仍可能饱和，须浏览器检查首屏和缩放。辅助拾取圆透明显示，不叠加可见散点；拾取仅代表原始位置，不代表热力像素精确值。

气泡可选 `bubbleEntrance: true`（默认关闭）：数据层就绪后进行一次 2000ms ElasticOut 半径放大入场，同时 600ms 淡入，结束后保持静止；入场半径从 0 放大，短暂弹性回落后精确恢复指标映射半径，不添加扩散环或持续呼吸。缩放和筛选不重播；减少动态效果偏好下直接显示，隐藏页面或切换主题时直接完成，销毁时取消动画。使用 SDK 原生 circle 半径与透明度实现，无独立覆盖画布。
