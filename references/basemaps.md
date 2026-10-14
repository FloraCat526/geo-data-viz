# 矢量、影像与地形底图

底图配置属于**地图数据可视化**的背景能力，独立于散点、热力、线和区域等 13 个数据组件。选择依据是用户要观察的上下文；不因更换背景改变指标、聚合、色阶或原始几何。默认仍为 MapLibre + OpenFreeMap 矢量地图，只有用户要求或地貌是本次解释的关键因素时才加入影像/地形。

## 类型与资源

| `type` | 地图表达 | 必需资源 |
| --- | --- | --- |
| `vector` | 原有深/浅矢量底图 | MapLibre 默认 OpenFreeMap；Mapbox 使用已授权样式。可显式传 `styleUrl`。 |
| `imagery` | 卫星/航空影像背景，可保留底图标签 | 明确授权的 raster TileJSON 或 HTTPS Web Mercator XYZ 瓦片与署名；Mapbox 的内置 satellite 样式或 MapTiler 官方 satellite 样式可使用对应浏览器 Key。 |
| `terrain` | DEM 驱动的真实地形，可选阴影及影像纹理 | raster-dem RGB 高程源与正确编码；`imagery` 可叠加。Mapbox 使用官方支持的 Terrain-DEM。 |

OpenFreeMap 默认样式不自带卫星影像或高程；MapLibre 是渲染引擎，不会自动提供这些资源。影像覆盖、采集年份、分辨率与 DEM 编码须根据实际来源确认。`exaggeration` 是地形视觉夸张倍数，指标组件的 `heightScale` 仍单独定义，两者不能混用。

## 配置结构

`build_visual_html.py` 将它放在页面 spec 顶层的 `basemap` 中；不要放进各组件的视觉 `spec`，也不要填写在 `alternatives` 中。例如，页面 `spec.json`：

```json
{
  "title": "用户提供的山地路线",
  "effect": "line",
  "lineWidth": 3,
  "theme": "light",
  "basemap": {
    "type": "terrain",
    "terrain": {
      "url": "https://your-authorized-host.example/terrain.json",
      "encoding": "terrarium",
      "tileSize": 256,
      "attribution": "高程资源的实际署名",
      "exaggeration": 1.5
    },
    "showHillshade": true
  }
}
```

以上 URL 是结构示意，需替换为本任务实际可用且授权的资源。MapLibre 的影像配置示意：

```json
{
  "type": "imagery",
  "imagery": {
    "tiles": ["https://your-authorized-host.example/imagery/{z}/{x}/{y}.jpg"],
    "tileSize": 256,
    "attribution": "影像资源的实际署名",
    "maxzoom": 18
  }
}
```

明确需要免 Key 地形时，可以使用 MapLibre 官方示例采用的公共 Mapterhorn DEM；这是独立高程来源，不是 OpenFreeMap 自带地形：

```json
{
  "type": "terrain",
  "terrain": {
    "url": "https://tiles.mapterhorn.com/tilejson.json",
    "encoding": "terrarium",
    "tileSize": 512,
    "attribution": "<a href=\"https://mapterhorn.com/attribution\">© Mapterhorn</a>",
    "exaggeration": 1.5
  },
  "showHillshade": true
}
```

[Mapterhorn](https://mapterhorn.com/) 提供公共全球高程瓦片，各地分辨率与来源许可不同，保留其[来源署名](https://mapterhorn.com/attribution/)。公共端点仍需联网且不等于可用性保证。免 Key 区域影像可按 [NASA GIBS 官方 MapLibre 示例](https://github.com/nasa-gibs/gibs-web-examples)选明确日期和 EPSG:3857 产品；其低分辨率背景适合区域镜头，不能称作城市级高清卫星图，具体瓦片地址需核对产品矩阵及缩放范围。

已授权 MapTiler 浏览器 Key 时，MapLibre/MapTiler 可直接使用其明确的官方影像样式，不必手抄样式内的瓦片：

```json
{
  "type": "imagery",
  "styleUrl": "https://api.maptiler.com/maps/satellite/style.json?key=YOUR_AUTHORIZED_BROWSER_KEY"
}
```

此处仅识别官方 satellite 样式；其他任意 style URL 不能自动宣称为影像，仍需明确 `imagery` 源。Key 在本地生成时使用，分享前移除，源样式自带的地图署名保留。

| 参数 | 约束与默认行为 |
| --- | --- |
| `type` | `vector`（默认）／`imagery`／`terrain`。vector 不接收 imagery/terrain 参数；影像＋高程使用 terrain。 |
| `styleUrl` | HTTPS 样式 URL；Mapbox 可用合法 `mapbox://styles/...`。MapLibre 缺省 Dark/Positron；Mapbox 按类型选 dark/light、satellite-streets 或 outdoors；MapTiler 必须明确授权样式。 |
| `imagery.url` / `imagery.tiles` | 二选一：HTTPS TileJSON 或 1–8 个 HTTPS XYZ 模板，每个模板有 `{z}/{x}/{y}`。 |
| `terrain.url` / `terrain.tiles` | 二选一：RGB DEM TileJSON/XYZ；Mapbox 当前限定 `mapbox://mapbox.mapbox-terrain-dem-v1`。MapLibre/MapTiler 须显式提供资源。 |
| `tileSize` | 与源相符的 256／512／514，默认 256。不能把普通影像当 DEM。 |
| `attribution` | 每个影像/DEM 源必填。支持纯文本及安全 HTTPS 链接；保留其要求的可见地图署名。 |
| `minzoom` / `maxzoom` | 可选 0–24 整数，min 不大于 max，遵循源覆盖。 |
| `terrain.encoding` | `mapbox`（默认）或 `terrarium`；须匹配源编码，Mapbox 仅支持本项目限定的官方 DEM。 |
| `terrain.exaggeration` | 默认 1.5，有限数 `(0,10]`。它不改变数据指标或统计结果。 |
| `showHillshade` | 可选布尔，仅 terrain 有效，默认 false。阴影源与地形源分开登记。 |

资源 URL 不接受账号密码、fragment 或非 HTTPS；不扫描其他项目或历史凭据。Key 缺失或配额失败不能当成图商没有该能力。输出中包含授权浏览器 Token 的页面仅作本地作品，分享前清理。

## 接入入口与生命周期

统一可视化入口沿用原命令：

```bash
python3 "SKILL_DIR/scripts/build_visual_html.py" "WORK/normalized.geojson" \
  --spec "WORK/spec.json" --out "WORK/map.html"
```

飞线等内部生成器以及旅游、故事生成器可使用 `--basemap WORK/basemap.json`；这是上述底图对象的独立 JSON，不是完整页面 spec。镜头叙事使用运行配置中的底图，见[场景组件](scene-narrative.md)。

手写地图页面可使用 `assets/shared/basemap.mjs`：

```js
const config = normalizeBasemap(userBasemap, {provider: 'maplibre', theme: 'light'});
const map = new maplibregl.Map({container: host, style: config.styleUrl});
const background = applyBasemap(map, config, {provider: 'maplibre'});
await background.ready;
// 再按已选组件添加用户数据；截图/视频仍需等待实际瓦片。
```

`applyBasemap` 返回 `{config,ready,inspect(),destroy()}`；基于原生 raster、raster-dem、hillshade 和 `setTerrain`，地图样式重载时恢复自己的背景层。`ready` 只确认资源登记，不表示瓦片/DEM 已下载。主题切换保留原有影像/DEM，不用 CSS 反色改变影像；页面 UI 与数据颜色可以深浅切换。卸载时先销毁数据组件和底图控制器，再移除地图。

## 验证范围

检查真实影像与 DEM 可见、署名保留、已知点位正确；倾斜和缩放后检查数据贴地、遮挡、标签可读性。原生 GL 点线面可由地图地形渲染，仍需按具体图层验收。deck.gl 发光加法散点和飞线当前没有额外采样 DEM 或使用地形扩展，**不保证山地端点自动贴地**；需要贴地时优先原生数据层，或按明确需求实现并验证补充层的地形适配。全球或极区需核对投影，当前 MapLibre/MapTiler 地形实现限定 Mercator；地形上的统计柱仍是指标，不称真实楼高。

视频采帧需等实际地图绘制结束，底图初始化/源登记成功不等于渲染完成。验收状态记录具体源与配置，缺授权资源时标注待运行验证。[验证边界](verification.md)。

官方依据：[MapLibre raster 源示例](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-raster-tile-source/)、[MapLibre 3D terrain](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)、[Mapbox terrain](https://docs.mapbox.com/mapbox-gl-js/example/add-terrain/)、[MapTiler 影像](https://docs.maptiler.com/sdk-js/examples/satellite-map/)。

底图控制器可通过 `applyBasemap(map, config, {timeoutMs})` 设置初始化等待时长（默认 20000，范围 1000–300000 毫秒）；叙事目标沿用运行配置 `timeout`，不会在地图资源未加载完成时继续截图。
