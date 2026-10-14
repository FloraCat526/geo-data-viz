# MapLibre + OpenFreeMap：免 Key 默认路线

核查日期：2026-09-21。MapLibre GL JS 是开源地图渲染引擎；OpenFreeMap 提供本路线的底图样式及资源服务。用户未指定图商且无已授权配置时直接使用，不询问 Key。明确指定 Mapbox 等服务时保留该选择，不以免 Key 路线替换。

## 接入与数据

当前配方固定 MapLibre GL JS **5.24.0**，从 `https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js` 及同目录 CSS 加载；不是“自动跟随最新版”。底图默认 `https://tiles.openfreemap.org/styles/dark`。不设置 accessToken，不加载 Mapbox SDK、商业 style URL 或需要 Token 的字体/瓦片。OpenFreeMap 官方也提供 liberty 等样式，按任务视觉风格调整时核对完整资源依赖。

输入为已核实 WGS84、经度在前的 GeoJSON，保存原坐标和稳定 ID。`map.addSource(id,{type:'geojson',data})` → `map.addLayer(...)` 是数据层入口；使用 `setData` 更新，解绑事件后先 removeLayer 再 removeSource，最后 map.remove。OpenFreeMap 不承担用户数据分析、地理编码或路径规划；上传的业务数据由本地 HTML 交给 MapLibre 绘制。

散点的柔和光晕使用原生 `circle-blur`；显式启用颜色加法叠加时由 deck.gl 补充，并保持地图相机同步、原生拾取和筛选。接口与限制见[散点外观](../class-reference.md#散点外观光晕与颜色叠加)。

## 数据 → 原生能力

| 数据目标 | 原生 API / type | 配方与边界 |
| --- | --- | --- |
| 位置散点、规模气泡 | `circle` + data-driven paint | `points` / `bubble`；数量映射面积，零值与缺失分别编码 |
| 密集点聚合、成员详情 | GeoJSON source `cluster: true`，`circle` + `symbol` | `cluster`；圆内为位置记录数，支持成员分页与展开 |
| 计数或非负贡献密度 | `heatmap` | `heatmap`；明确 `weight: count` 或 `value`；相对密度不是精确测量 |
| 已知路线、关系线 | `line` | `line`；不推断真实路网、移动方向或实时位置 |
| 行政区/网格指标 | `fill` + `line` | `fill`；先有面几何和明确指标；网格统计需先计算 |
| 区域指标三维高度 | `fill-extrusion` | `extrusion`；明确 `heightScale`，指标高度不能冒充建筑实测高度 |
| 呼吸、闪烁强调 | 更新原生 circle paint 的组合动画 | `pulse` 组件，由统一平面可视化入口选择 |
| 已知站点的雷达扫描示意 | `fill` / `line` / `circle` 加时间驱动的 GeoJSON source 更新 | 复用 `RadarScanViz`；扫描半径只作视觉参数，除非数据有真实覆盖依据 |
| OD 三维弧线、轨迹尾迹等 | `FlyLineViz` 使用 deck.gl 三维路径与尾迹 | 见 [视觉组件](../maplibre-effects.md)，third-party，不能把 custom layer 标成原生效果 |

原生配方模块 `assets/recipes/maplibre-layers.mjs` 与 Mapbox 模块共用 `gl-layers.mjs` 中的样式逻辑；与 `assets/shared/color-scale.mjs` 必须一起分发。MapLibre 的 `getClusterLeaves` 和 `getClusterExpansionZoom` 返回 **Promise**，Mapbox 配方使用 callback，不能直接交换 SDK 全局变量。模块已分别适配，并避免过滤/销毁后的迟到结果更新页面或相机。

## 生成单文件 HTML

先按[数据匹配规则](../selection.md)选择效果并准备符合组件契约的数据和显式 spec；点线面等参数见[图层实现细节](../mapbox-recipes.md)。使用：

```bash
python3 "SKILL_DIR/scripts/build_visual_html.py" "WORK/profile/normalized.geojson" \
  --spec "WORK/spec.json" --out "OUTPUT/map.html"
```

不传图商与凭证时默认免 Key，也可明确加 `--provider maplibre`。明确 MapLibre 时不会读取/内嵌无关的 Mapbox Token。脚本报告 provider、basemap、SDK 版本及不含凭证的验证状态；`pending-browser` 表示已生成，仍须实际打开验收。`layer.inspect()` 记录真实 source/layer 注册类型，MapLibre 原生层使用 rendererOwner: provider-native，provider: maplibre。

## 网络、归属与验收

SDK、样式、字体、sprite 和瓦片需要网络连接。网络或资源加载失败时检查实际错误，不提示用户申请 Mapbox Key，不静默改底图。保留 MapLibre、OpenFreeMap、OpenMapTiles、OpenStreetMap 的必要归属标识。

## 影像与地形背景

地图数据组件可通过页面顶层 `basemap` 配置叠加已授权 raster 影像，或使用 raster-dem 与 `setTerrain` 绘制真实高程。默认 OpenFreeMap 仍为矢量地图；卫星影像和 DEM 必须单独提供 URL、编码和署名。底图不补充业务地点或路线，地形夸张和指标高度独立。配置、原生层生命周期及贴地边界见[底图参考](../basemaps.md)。镜头/媒体叙事及视频输出见[场景镜头](../scene-narrative.md)。

实际检查底图地名及已知位置、图层注册、气泡数值映射、聚合成员/展开、热力切换、过滤、缩放拖动和清理。具体测试结果见 [验证范围](../verification.md)；一个地域的成功不代表任意网络与数据都通过。

官方依据：[OpenFreeMap 快速开始](https://openfreemap.org/quick_start/)、[服务说明](https://openfreemap.org/)、[MapLibre GeoJSONSource API](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/)、[样式层规范](https://maplibre.org/maplibre-style-spec/layers/)。
