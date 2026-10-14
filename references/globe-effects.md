# 地球模式：组件与生成入口

用户明确需要全球球面视角、跨洲连接或球面上的三维指标时使用。本模式使用独立的 [Globe.GL](https://globe.gl/) WebGL 渲染器，`rendererOwner: third-party`；不是 MapLibre 图层，也不把 Globe.GL 效果冒充指定图商的能力。默认的区域/城市平面地图仍为 MapLibre + OpenFreeMap。用户指定 Mapbox 等图商时，先核查其球面/自定义层能力与已授权 Key；只有确认目标效果缺口后才按 [渲染归属](provider-rendering.md) 加第三方效果，并清楚说明实际底图与渲染来源。

| 效果 | 适合的问题 | 必需输入 | 实际编码 | 不适用 |
|---|---|---|---|---|
| `flight` · `GlobeFlightLayer` | 全球 OD 网络连接与方向 | 唯一 ID、WGS84 起终点、可选类别 | 球面弧线和流动亮段；目的地同色点 | 只有位置点、需要真实道路或航迹、需要准确航班量但无流量字段 |
| `choropleth` · `GlobeChoroplethLayer` | 全球行政区非负指标对比 | Polygon/MultiPolygon、区域关联键、非负数值及单位 | 球面区域对数颜色；缺失灰色，零值保留 | 负值/发散指标、无真实边界、分母不一致的比例、区域内细节比较 |
| `spikes` · `GlobeSpikeLayer` | 全球位置事件的强度对比 | Point、非负或明确域的数值、单位 | 柱高与颜色共同编码；位置落在球面 | 点过密而需要精确逐条比较、把柱高误认成物理海拔或影响范围 |

球体只能同时看到一个半球；若要精确比较数值或研究一个城市，配套平面图与明细通常更合适。飞线弧高、流光速度与柱高是视觉参数，不能写成真实轨迹、速度、震源深度。区域设色须区分总量与密度、缺失与零；样例人口使用对数色阶，不是按面积标准化的人口密度。

入口 `scripts/build_globe_html.py`，组件源码 `assets/components/globe-effects.mjs`。输入为分析后、已确认 WGS84 的 OD JSON 或 GeoJSON；对于原始数据，先按 [数据契约](data-contract.md) 与 [转换](transforms.md) 核实坐标、ID、指标，不能仅凭坐标范围猜 CRS。仓库的 `examples/` 有完整演示数据，但不随 Skill 安装；下面的输入格式可在独立安装后直接使用。

### 输入格式

坐标统一为 `[经度, 纬度]`。飞线接受 OD 数组；每条连接的 `id` 必须唯一。`category` 可用于按目的地分色，但不表示连接流量。

```json
[{"id":"SIN-ROM","source":[103.994,1.350],"target":[12.251,41.800],"label":"Rome","category":"Europe"}]
```

区域设色和指标柱接受 GeoJSON FeatureCollection。区域用 Polygon/MultiPolygon 和 `properties.__viz.value`；指标柱用 Point 和数值。`__viz.label` 用于拾取详情，数值缺失的区域保留 `null`；已绑定的 `__viz.value` 或显式 `value` 为 `null` 时，不回退到其他源列。源属性也可通过 `--value-field`、`--label-field` 显式绑定；只有区域设色允许缺失指标。

```json
{"type":"FeatureCollection","metadata":{"dataCrs":"wgs84"},"features":[{"type":"Feature","id":"AAA","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]},"properties":{"__viz":{"label":"Area A","value":1200}}}]}
```

```json
{"type":"FeatureCollection","metadata":{"dataCrs":"wgs84"},"features":[{"type":"Feature","id":"quake-1","geometry":{"type":"Point","coordinates":[142.5,38.2]},"properties":{"__viz":{"label":"Event 1","value":5.4}}}]}
```

```bash
python3 SKILL_DIR/scripts/build_globe_html.py WORK/routes.json \
  --effect flight --title '全球连接' --out WORK/globe.html
python3 SKILL_DIR/scripts/build_globe_html.py WORK/regions.geojson \
  --effect choropleth --title '区域人口' --unit 人 --out WORK/globe.html
python3 SKILL_DIR/scripts/build_globe_html.py WORK/events.geojson \
  --effect spikes --title '全球事件' --unit M --out WORK/globe.html
```

直接用源字段时传 `--value-field`、`--label-field`；已绑定 `properties.__viz` 时无需再传。`--center LAT LNG ALT` 控制初始球面视角；`--unit` 让详情和指标柱图例标明单位；`--count-label` 可调整统计文案。`spikes` 可加 `--min-value`、`--max-value` 固定指标域；未指定时从数据计算，单一数值也可生成。类别颜色、飞线图例及指标柱色阶根据实际数据形成，不使用演示数据的固定震级阈值。已有输出需明确传 `--overwrite`；输出路径不能与输入数据相同。输出 HTML 内嵌数据与组件业务代码，但 Globe.GL 固定版本和地球纹理仍需联网；无需地图 Key。自定义页面可调用 `createGlobe(host)`，再 `new GlobeFlightLayer(globe, {onPick}).setData(rows)`，另两种组件同理。组件支持 `inspect()`、`pause()`、`play()`、`destroy()`；暂停控制自动旋转与飞线流光。离线或生产部署时需按第三方许可自行托管并重新验收依赖资源。

浏览器验收应覆盖地球纹理、弧线/面/柱的实际可见性、另一半球旋转、拾取、暂停、复位、窄屏布局与 GPU 负载。全球数据量大时先按已说明的业务规则聚合或抽样，不静默丢点。
