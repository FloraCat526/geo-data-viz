# 旅游规划组件：TravelItineraryLayer

用于回答“每天去哪里、按什么顺序、各站有什么值得说明”，提供**整体行程概览、日期切换、地图常驻地点名称、站点时间线与地点详情弹窗**。它不是导航、算路、行程优化或真实时间轨迹播放组件。默认 MapLibre + OpenFreeMap 时使用 `assets/components/travel-itinerary.mjs`；用户指定其他图商时保留同一数据语义，以该图商原生线、点和信息窗口实现，不实例化 MapLibre 组件。

## Agent 从用户数据建立输入

需要已核实 WGS84 的站点经纬度、站点名、稳定 ID、所属日期或天序、日内顺序。日期没有原始值时使用“第 1 天”等天序标签，**不编造日历日期**。时间、简介、标签、结构化详情均可选；没有时间就不显示时间。即使附件有很多列，也只显式选择与本次叙事有关的文本字段，不默认复制整个记录。当前可复用组件只覆盖 MapLibre；指定其他图商时仍需按其原生 API 单独实现并验收。

```json
{
  "title": "两日漫游",
  "days": [
    {
      "id": "day-1",
      "label": "第 1 天",
      "date": "2026-10-12",
      "color": "#37699c",
      "stops": [
        {
          "id": "garden",
          "name": "植物园",
          "coordinates": [103.8159, 1.3138],
          "time": "09:00",
          "tag": "散步",
          "summary": "用户提供的简短介绍",
          "details": [{"label": "提示", "text": "用户提供的补充说明"}]
        }
      ]
    }
  ]
}
```

若用户另附 GPX 或 GeoJSON 路径，先解析并核对它与日期的关联，再为相应 day 增加 `"route":{"type":"LineString","coordinates":[[lng,lat],...]}`；这时绘制实线并保留原始顶点。只有站点和顺序时，组件生成**虚线示意连接**，页面明确标注“非实际道路”；不能凭直线猜出步行路线、路程、用时或到达时间。路径跨日期变更线时先按来源分段处理；本组件拒绝一段内直接跨越日期变更线的路线。

来源可能是多表：站点表按 `day_id`、`order` 关联说明表，轨迹文件按可靠的日期或路线 ID 关联当天。关联缺少依据时保留站点视图，不把不相干的线配给当天。地理编码、算路和外部数据补全不属于本 Skill。

### 将上传的数据整理为组件输入

`prepare_itinerary.py` 接受 CSV、TSV、JSON 记录数组或含 Point/LineString 的 GeoJSON，按明确的列映射生成上述 `days` 结构。执行前根据来源确认坐标是 WGS84；`--crs wgs84` 是已核实事实的声明，不会转换坐标。默认列名为 `day`、`order`、`name`、`longitude`、`latitude`。示例为不同列名显式绑定：

```bash
python3 SKILL_DIR/scripts/prepare_itinerary.py WORK/stops.csv \
  --crs wgs84 --day-field travel_day --order-field visit_order \
  --name-field place_name --lng-field longitude --lat-field latitude \
  --time-field arrival_time --summary-field note \
  --out WORK/itinerary.json
python3 SKILL_DIR/scripts/build_itinerary_html.py WORK/itinerary.json \
  --out WORK/travel.html
```

对于 GeoJSON 站点，坐标取 Point 几何；可在同一文件加入当天的 LineString，或用 `--routes WORK/routes.geojson` 提供另一个含 LineString 的文件。路线要有与站点一致的日期/天序属性；列名不同用 `--route-day-field` 指定。没有日内顺序列时，只有用户明确表示文件行序即游览顺序，才加 `--row-order`；只有一天且没有日期字段时加 `--single-day`。`--detail-field '提示=tip'` 可多次提供，把用户指定的说明列放到地点详情中。工具拒绝重复顺序、无法关联的路线和非 WGS84 声明，不会请求路线服务，也不会把两点间直线当作真实道路。

## 视觉与交互

| 状态 | 地图 | 行程面板 |
| --- | --- | --- |
| 总览 | 所有日期各自着色、各天站点、名称标签与连接同时可见；不跨日连线 | 日期卡片列出站点数量与首末地点 |
| 指定日期 | 只显示当天点线和名称标签，自动调整视野 | 当天时间线；无时间时只显示顺序 |
| 选中站点 | 点击圆点或名称标签均可打开详情；原生 circle 高亮，镜头定位 | MapLibre Popup 展示名称、时间、简介与结构化详情 |

整页使用 OpenFreeMap 的 Positron 浅色底图与 MapLibre 原生 `line`、`circle`、`symbol` 图层。地点名称是带浅色圆角背景的原生 symbol，按东西侧优先放置，并由地图引擎处理文字碰撞；密集或窄屏时可以按天查看，手机默认显示第 1 天，仍可切换总览。页面只展示行程标题、日期、地点与必要的路线语义，不在地图上堆放操作说明或重复标题。每个日期颜色固定；路线是否真实由线型区分，不能把虚线当道路或速度。弹窗通过 DOM `textContent` 建立，不执行上传 HTML。地图署名默认收起为信息按钮，点击后仍可查看完整来源与链接。桌面使用紧凑右侧面板，窄屏改为底部面板并提供内部滚动。

## 构建与接口

```bash
python3 SKILL_DIR/scripts/build_itinerary_html.py WORK/itinerary.json \
  --out OUTPUT/travel.html
```

输出为独立 HTML，内嵌本次行程数据与组件代码；MapLibre SDK、OpenFreeMap 底图、字体和瓦片仍需联网。已经是规范化行程 JSON 时，可直接运行本节构建命令。示例从 `examples/data/travel-itinerary-stops.csv` 生成 `examples/data/travel-itinerary.json`，可运行页面是 `examples/maps/travel-itinerary.html`。示例地点与时间为演示行程，不是用户上传数据或实际导航建议。

用户要求影像或地形时可加 `--basemap WORK/basemap.json`，配置见[底图](basemaps.md)。需要相机、图片、旁白或 MP4 时，将这些已提供的站点、日期和真实/示意路径编排为[场景镜头数据](scene-narrative.md)，再用场景 HTML/视频入口；`TravelItineraryLayer` 自身仍负责交互行程浏览，不自动导出视频。

```js
import {TravelItineraryLayer} from './travel-itinerary.mjs';
map.on('load', () => {
  const itinerary = new TravelItineraryLayer(map, {data, onSelect: stop => showDetails(stop)});
  itinerary.fit();
  itinerary.setDay('day-1');
  itinerary.selectStop('garden');
  // itinerary.setDay(null) 返回总览；切换底图前 destroy()，样式就绪后重建。
});
```

`normalizeItinerary` 验证唯一 ID、点/线路坐标、日期字符串和文本长度；`itineraryGeoJSON` 只从已规范化数据派生图层输入。`inspect()` 报告日期、站点、真实路径与示意连接数量及选中状态。组件持有的 source、layer、事件在 `destroy()` 中释放。组件目前针对区域行程的 Mercator 地图，不自动处理全球或极区路线。

## 验收与边界

先检查默认总览、每个日期、最后一天、单站日期、站点弹窗与地图点选；再检查窄屏、无时间/无详情、只有站点顺序和已提供路径几何两种线型。地图加载成功不代表数据正确，仍要核对站点位置、日期归属、顺序、线形是否与附件一致。卫星或地形作为可选资源接入，不影响行程数据契约；贴地、遮挡与具体影像/DEM 实际显示仍需单独验收。
