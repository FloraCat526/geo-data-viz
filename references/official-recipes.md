# 高德 Loca / 百度 MapVGL 图层实现

`assets/recipes/official-layers.mjs` 提供 `mountOfficialRecipe`，复用点、指标着色、线、面和计数热力的绑定、筛选、拾取与销毁逻辑。渲染归属为 **provider-official-extension**。它不负责加载 Key/SDK 或创建底图，也不替代图商能力文档。

| effect | 高德 Loca 2.x | 百度 MapVGL | 配方边界 |
| --- | --- | --- | --- |
| points / point-color | PointLayer | PointLayer | 支持固定、类别、连续/阈值颜色；等大点 |
| line | LineLayer | SimpleLineLayer | 原始线；不推断方向和轨迹时间；百度此配方不承诺线拾取 |
| fill | PolygonLayer | PolygonLayer | 原始环与洞保留；高度为 0；无指标用 colorBy: constant/category |
| heatmap | HeatMapLayer | HeatmapLayer | weight: count，每个输入点记录等权；二维，不表示数值等价的跨图商密度 |

代码依据：[Loca 2.x API](https://a.amap.com/Loca/static/loca-v2/doc/html/index.html)、MapVGL [PointLayer](https://mapv.baidu.com/gl/docs/PointLayer.html)、[SimpleLineLayer](https://mapv.baidu.com/gl/docs/SimpleLineLayer.html)、[PolygonLayer](https://mapv.baidu.com/gl/docs/PolygonLayer.html)、[HeatmapLayer](https://mapv.baidu.com/gl/docs/HeatmapLayer.html)、[拾取](https://mapv.baidu.com/gl/docs/Pick.html)、[View](https://mapv.baidu.com/gl/docs/View.html)。2026-09-21 核查接口，模拟 SDK 测试覆盖绑定、几何保留、过滤和清理；真实 Key 与具体 SDK 版本组合仍须在目标作品验收。

```js
import {mountOfficialRecipe} from './official-layers.mjs';
const layer = mountOfficialRecipe({
  provider: 'amap', map, SDK: Loca, data: normalized,
  spec: {effect: 'points', colorBy: 'category'},
  targetCrs: 'gcj02',
  coordinateEvidence: '填写该地域、数据来源与目标 SDK 的坐标依据',
  transformPosition: (position, from, to) => verifiedConvert(position, from, to),
  onPick: ({items}) => showSafeText(items)
});
layer.setFilter(f => f.properties.__viz.category === '餐饮');
// Loca 拾取：传地图容器内的 [x,y]，绑定并清理本页的地图事件。
layer.pick([x, y]);
// 百度点/面已通过 onClick 回调拾取；不要再重复绑定点击。
layer.destroy(); // 先销毁配方，再销毁底图
```

百度使用 `provider:'baidu', SDK:mapvgl`。源/目标 datum 必须明确；不同 datum 必须传转换函数，返回新的坐标副本。海外是否保留 WGS84 按该地域的图商契约填写；不因选择图商就盲目偏移，也不从坐标数值推断 CRS。模块不会联网转换或搜索凭证。

颜色规则与 [GL 配方](mapbox-recipes.md) 共用 `assets/shared/color-scale.mjs`。为使用各层已确认的常量样式契约，按颜色分组挂载；超过 64 组会要求使用分级色阶或按当前 SDK 实现逐要素样式，不静默降低色阶精度。过滤保持全量色域；MultiLineString/MultiPolygon 拆为保留业务 ID 的几何部分，洞不拆。计数热力的 max 固定为全量点部分数量，是可修改的起点，需按实际分布核验视觉灵敏度；此配方不支持业务加权热力、气泡面积、聚合、拉伸或动画，按对应能力文档另行实现。

使用时保持 `assets/recipes/official-layers.mjs` 与 `assets/shared/color-scale.mjs` 的相对目录关系，通过 HTTP 提供文件。`inspect()` 记录扩展归属、类名、图层数量和目标坐标系，其 pending-browser 状态不能作为实际底图验收成功。
