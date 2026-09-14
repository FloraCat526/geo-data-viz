# Mapbox 原生图层与 HTML 配方

按需读取：Agent 已选 Mapbox，并确定点、数量气泡、聚合、热力、线、面或拉伸方案时使用。所有配方使用 Mapbox GeoJSON source 与原生样式层，不创建独立数据 Canvas、第三方图层或 custom layer。`layer.inspect()` 返回当前地图实际注册的 source/layer 类型，供验收；该检查仅针对本原生配方，不能拿它否定另行实现且已声明的补充层；注册通过仍不等于真实底图可见。当前起点固定 GL JS/CSS 3.28.1；其他版本需核查兼容性。官方接口依据：[source/layer](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/)、[聚合](https://docs.mapbox.com/mapbox-gl-js/example/cluster/)、[热力](https://docs.mapbox.com/mapbox-gl-js/example/heatmap-layer/)、[拉伸](https://docs.mapbox.com/mapbox-gl-js/example/3d-extrusion-floorplan/)。

## 选择与打包

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
| points | Point | 等大点，仅位置，无需数值 |
| bubble | Point | 有限非负规模 + unit；半径按 sqrt(value)，面积固定全量域。正负变化需显式 sizeMode: absolute，颜色保留符号 |
| cluster | Point | 每个位置记录的计数含义明确；点击可分页读取成员、展开缩放，同位置实体不会因无法展开而丢失 |
| heatmap | Point | weight: count 或 value；value 需非负可加贡献 + unit。缺失不填零，计数模式不读取业务数值 |
| line | LineString / MultiLineString | 原始线几何；固定宽度。OD 须注明关系，方向/流量宽度与时间动画另实现 |
| fill | Polygon / MultiPolygon | 有限指标 + unit；两档或正负色表达是起点，需要连续色/分位数时按任务调整并同步图例 |
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

模块在 style.load 后恢复图层与当前筛选，提供稳定 ID 拾取和逆序清理。聚合异步成员/展开回调会检查源是否仍有效。更换数据应重新计算一次 spec/domain 并重建；切地图供应商保留原始数据、指标域、筛选和选择态，需要由作品控制器实现，该模块不包办六家切换。

当前资源仅是这些明确范围的起点；Google、Maptec、百度、高德、腾讯继续依据各自能力文档生成。原生线不自动规划驾车路线，拉伸不等于三维热力，配方不含轨迹调度或脉冲动画。
