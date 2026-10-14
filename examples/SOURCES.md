# 数据来源与统计口径

事件与指标示例数据均为快照，不自动更新；在线底图按各服务提供的版本加载。展示不代表来源机构背书。保留本文件与派生 HTML 一起分发。

## 新加坡私人住宅

- 来源：[URA No of Dwelling Units / data.gov.sg](https://data.gov.sg/datasets/d_be71daeab5930f96b90ad2857454d876/view)。访问日期 2026-09-11，许可：[Singapore Open Data Licence 1.0](https://data.gov.sg/open-data-licence)。
- 统计期为 **Q4 2022**。门户文件日期不等于新的住宅普查日期。包括空置和已入住私人住宅，不涵盖全部 HDB 公屋，不表示人口或入住率。
- 原始 83,541 条位置记录汇总为 1,988 个有记录的 250 m 网格，共 458,975 套住宅：有地 73,535 套、非有地 346,010 套、执行共管公寓 39,430 套。
- 上游按 `floor(X_ADDR/250), floor(Y_ADDR/250)` 聚合，网格 ID 保留行列。仓库从 ID 还原 SVY21 / Singapore TM (EPSG:3414) 方格边界，用 pyproj 转换到 WGS84；验证每个上游加权位置在所属网格内、分类总和及全部记录数守恒。不能将加权位置当作方格的几何中心。这里提供转换后的 GeoJSON，重建 HTML 不再需要 pyproj。
- `__viz.value` 是每格全部类型住宅套数；类别是套数最多的住宅类型。筛选“执行共管公寓”选出以该类型为主的网格，显示这些网格**全部类型**住宅之和，而非只统计 EC。网格详情列出类型分项。
- 颜色分级 50 / 150 / 300 / 600 / 1000 套用于视觉比较，无政策等级含义。3D 高度为 0.6 米/套，不是实测楼高。未出现的网格不等于已核实为零；方格不是建筑轮廓或行政边界。
- 上游网格 JSON SHA-256：`a5185c644f043ca7b1b0f3a574756d5d0ea6a807ccd8486a624c19fbeea70a0d`。

## 新加坡出租车快照与发光散点

Source: [LTA Taxi Availability](https://data.gov.sg/datasets/d_e25662f1a062dd046453926aa284ba64/view), accessed 2026-09-11, under the [Singapore Open Data Licence 1.0](https://data.gov.sg/open-data-licence). Contains information from LTA; this example is not endorsed by LTA.

| Requested Singapore time | Actual observation (+08:00) | Records | Coincident coordinates |
| --- | --- | --- | --- |
| 2026-09-10 08:00 | 07:59:49 | 1,869 | 104 |
| 2026-09-10 14:00 | 13:59:34 | 1,500 | 64 |
| 2026-09-10 20:00 | 19:59:49 | 2,605 | 27 |

API returns a MultiPoint geometry and taxi_count; the script verifies agreement, WGS84 [longitude, latitude], Singapore bounds, finite coordinates and an observation within five minutes before each request. No positions are generated, shifted, rounded or dropped. Coincident coordinates are retained: there is no vehicle ID with which to distinguish co-located vehicles from duplicate records. recordIndex is only an array index, not a vehicle ID. Each record has weight 1. Snapshots are displayed separately with fixed normalization (minWeight 0, maxWeight 1); records across times must not be added to count unique vehicles or form trajectories.

This shows available taxis at the recorded time, not all taxis, passenger demand, orders, or live availability. Heat colors express relative screen-space density, not a calibrated number of taxis per square kilometre.

原始查询：`https://api.data.gov.sg/v1/transport/taxi-availability?date_time=2026-09-10T08:00:00`（将 08 替换为 14 和 20 获取另两份快照）。`data/taxis.json` 保存这三个规范化快照；发光散点示例复用晚间的 2,605 个位置，未新增或移动点。柔光与颜色加法叠加的亮度受像素半径、缩放和点重叠影响，不是实测亮度或人口密度。

The GeoJSON metadata preserves request URLs, exact observation timestamps, counts and input SHA-256 hashes.

## 新加坡历史航空飞线

Contains information from [OpenFlights](https://openflights.org/data.php), available under the [Open Database Licence (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/); individual database contents are available under [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/). This derived database is distributed under the same ODbL/DbCL terms. Download the machine-readable derivative from `data/flights.json`; `data/flight-source-routes.csv` contains all selected original route rows. The demo provides visible attribution and a data download link.

### Historical scope

OpenFlights states that its route-data provider stopped updates in **June 2014**. This dataset illustrates a historical airport-connection network. It is not a current schedule, flight availability, traffic volume, real-time aircraft position or navigational flight track. Aviation company listings include codeshares and do not indicate frequency.

Source snapshot: [`jpatokal/openflights@4b969f8e91eb800c45f0e0e2355a0fbb93de27e4`](https://github.com/jpatokal/openflights/tree/4b969f8e91eb800c45f0e0e2355a0fbb93de27e4/data), downloaded 2026-09-11. The repository version is not the route-data period.

### Method and validation

- Select `routes.dat` rows with source code SIN and `stops=0`: **408** airline/codeshare records.
- Resolve airport coordinates by OpenFlights airport ID; where ID is missing, require an unambiguous IATA match. Three HYD rows use this fallback. All 408 records resolve.
- Preserve historical destination codes. IST points to airport ID 1701 (Atatürk), whose current airport-table IATA is ISL; do not replace it with the newer IST airport. `currentIata` records the airport-table value separately.
- Merge by destination airport: **125 unique connections** across **40 countries or territories**, retaining airline codes, names and codeshare flags. No routes were invented or randomly sampled.
- Regions: Asia 102, Europe 12, Oceania 10, Africa 1. Regional grouping is for display; this demo groups the Moscow airport in Europe and Istanbul in Asia for a simple four-way selector.
- Every connection has longitude span under 180°. This selection contains no Americas destinations and no date-line crossing; the demo does not invent modern American services to fill the map.
- Current bundled file sizes and SHA-256 hashes are recorded in `manifest.json`.

## 意大利及周边地震事件

Source: INGV FDSN Event service / ISIDe. Retrieved 2026-09-11.

- Query: https://webservices.ingv.it/fdsnws/event/1/query?starttime=2025-01-01&endtime=2026-01-01&minlatitude=35&maxlatitude=48&minlongitude=6&maxlongitude=19&minmagnitude=3&format=text
- Service documentation: https://github.com/INGV/openapi
- Attribution: ISIDe Working Group, Italian Seismological Instrumental and Parametric Database (ISIDe), Istituto Nazionale di Geofisica e Vulcanologia (INGV). https://doi.org/10.13127/ISIDe
- License: CC BY 4.0. https://data.ingv.it/docs/legal-notes.html

`data/quakes.json` contains 190 earthquakes of magnitude >=3 in the 6–19 E / 35–48 N bounding box during 2025. This includes neighboring countries and offshore events; it is not an Italy-only boundary filter. Magnitude types ML (123), Mw (34), Md (33) are preserved, not normalized to a common scale. Times are UTC. Depth is kilometres. Wave radius is a visual symbol, not seismic propagation, hazard or an impact estimate.

### 可切换的卫星底图

`maps/quakes.html` 展示上述 190 次事件，保留原始坐标、震级、震级类型与深度。页面默认使用 OpenFreeMap 深色地图，可通过左下角图层控件切换到卫星图，继续展示同一组地震事件。卫星底图来自 [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/)，图层 `MODIS_Terra_CorrectedReflectance_TrueColor`，日期 **2018-06-01**；使用 EPSG:3857 WMTS、`GoogleMapsCompatible_Level9`、256 px JPEG，示例配置 `maxzoom: 8`。这是区域尺度真彩色影像，与 2025 年地震快照日期不同，不是实时或高清城市卫星图，也不用于观察震后变化。

影像使用遵循 [NASA Earthdata 数据使用与引用政策](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy)和 [GIBS 使用与致谢说明](https://nasa-gibs.github.io/gibs-api-docs/#data-use-guidance-and-acknowledgements)。我们致谢 NASA Earth Science Data and Information System（ESDIS）旗下 GIBS 提供的影像服务；地图保留 NASA GIBS / MODIS Terra 及日期署名。NASA 开放数据政策不替代上述 INGV 数据的 CC BY 4.0 条件。

## 美国公路历史事故

Source files are from [visgl/deck.gl-data](https://github.com/visgl/deck.gl-data/tree/77274a651b73e438edc0999e2f6d41418c9736c0/examples/highway), retrieved on 2026-09-10.

- `roads.json`: 20,592 GeoJSON features, 125,998 paths, 404,879 vertices (12,028,224 bytes).
- `accidents.csv`: 29,342 records for 1990, 1995, 2000, 2005, 2010 and 2015 (546,545 bytes).
- `LICENSE`: upstream MIT license, Copyright (c) 2017 Uber Technologies, Inc.

The [deck.gl highway example](https://deck.gl/examples/geojson-layer-paths) attributes the underlying accident data to [NHTSA](https://www.nhtsa.gov/). This is a historical demonstration dataset, not current traffic information.

仓库将道路文件保存为 `data/highways.json`，保留原始 `data/accidents.csv`，并提供页面使用的 `data/accidents.json`。Join using `state-type-id`, plus `year` for accident records. The metric `fatalities / length * 1000` expresses fatalities per 1,000 miles. 本示例将未匹配年份统计保留为缺失并显示灰色，不将其补为零；缺失不代表该路段没有事故。

## 地球模式派生数据

- **球面飞线** `maps/globe-flights.html` 复用 `data/flights.json` 的 125 条从新加坡出发的历史机场连接；来源、2014 年数据时效及 ODbL / DbCL 条件同上。颜色表示目的地洲，弧高与流光不表示实际航迹、航班频次或速度。
- **球面区域设色** `data/globe-countries.geojson`：177 个国家或地区的边界来自 [Natural Earth 1:110m Admin 0](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/)，公共领域；按 ISO3 关联 [World Bank WDI 2024 年总人口 SP.POP.TOTL](https://data.worldbank.org/indicator/SP.POP.TOTL)。169 个区域有值，8 个保持 `null`，未以零填充或编造。World Bank 指标遵循其[开放数据使用条款](https://www.worldbank.org/ext/en/legal/terms-conditions/datasets)，通常为 CC BY 4.0。边界是小比例尺示意，不用于法定边界或面积测量。颜色采用对数映射，代表人口总量，不是密度；不同国家统计口径差异不由本示例修正。
- **球面棱柱** `data/globe-quakes.geojson`：从桌面上保存的 [USGS 全球月度 GeoJSON 快照](https://earthquake.usgs.gov/earthquakes/feed/)筛选震级 **M ≥ 4.5** 的 591 条事件，输入文件实际有 10,807 个 Feature，源元数据生成时间为 **2026-09-15 02:05:01 UTC**。只保留事件 ID、坐标、地名、震级和时间；USGS 数据为[美国政府公共领域资料](https://www.usgs.gov/information-policies-and-instructions/acknowledging-or-crediting-usgs)。不同震级类型未统一；柱高按视觉比例缩放，不是震源深度、海拔或影响范围。示例不是实时监测。

## 新加坡两日漫游

`data/travel-itinerary.json` 是为了说明旅游规划组件而手工编排的**示例行程**。地名与坐标用于定位展示；日期、时间、文字说明和站点顺序不是公开机构发布的行程数据，也不代表营业时间、可达性或推荐导航路线。未提供道路几何，所以地图虚线仅表示同一天站点的先后关系。示例不调用算路或地理编码服务。

## 故事时间轴

`data/story-timeline.json` 的六个地点坐标取自仓库的 `data/flights.json` 中 OpenFlights 历史机场数据，原始数据库按 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 许可，数据库内容按 [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/) 许可；该派生点位集随本仓库按相同条件提供。故事章节、日期与叙述为本项目编写的虚构演示，并非真实旅行、历史事件或航班记录。连接线只表示叙事顺序，不表示真实路径或速度；示例不调用算路或地理编码服务。

## 阿尔卑斯山地飞越

- 影像：[SWISSIMAGE 正射航片](https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10)，由瑞士联邦地形局提供。使用 `ch.swisstopo.swissimage / default / current`、EPSG:3857 XYZ、256 px JPEG、0–20 级；配置依据 [WMTS GetCapabilities](https://wmts.geo.admin.ch/EPSG/3857/1.0.0/WMTSCapabilities.xml?lang=en) 和 [XYZ 文档](https://docs.geo.admin.ch/visualize-data/xyz.html)。`current` 是不同采集年份航片的最新可用镶嵌，不是实时卫星图或统一拍摄日期。遵循 [swisstopo OGD 条款](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices)，地图保留可见署名 ©swisstopo。
- 高程：[Mapterhorn DEM](https://mapterhorn.com/data-access/)，[TileJSON](https://tiles.mapterhorn.com/tilejson.json)，Terrarium RGB、512 px。瑞士区域来源为 swissALTI3D，保留 [Mapterhorn 来源署名](https://mapterhorn.com/attribution/)。地形夸张 1.2 倍用于取景。
- 地点：从 [Wikidata EntityData P625](https://www.wikidata.org/wiki/Wikidata:Licensing) 提取六个 WGS84 地点坐标，CC0：格林德瓦 Q64004、小夏戴克 Q869540、艾格峰 Q4425、僧侣峰 Q16525、少女峰山坳 Q665676、少女峰 Q15312。`data/mountain-landmarks.geojson` 保留原始坐标、实体 ID、来源 URL、实体版本及访问日期，没有调用地理编码或路线规划。
- 24 秒、4 个章节的相机中心、倾角、朝向和缩放为镜头关键帧编排，相邻章节首尾连续，业务路线为空；不代表实测飞机 / 无人机轨迹、徒步计划或实际旅行轨迹。通过原生 MapLibre `raster` / `raster-dem` / `setTerrain` 加载航片和真实高程，`SceneNarrativeViz` 播放镜头；组件不提供 DEM 避障或离地高度保证。
- 资源获取日期：2026-10-08。`data/mountain-landmarks.geojson` 保存地点来源，`specs/mountain-flyover.scene.json` 保存地形、影像配置与章节镜头编排；重建入口为 `build_mountain_flyover.py`。

## 地图服务

平面矢量底图使用 MapLibre GL JS 与 OpenFreeMap，页面保留其地图资源所需的归属文字（包含 OpenMapTiles、OpenStreetMap）；地震示例的卫星底图与山地飞越使用上述影像 / DEM 来源。地球示例使用独立 Globe.GL 渲染器与示例纹理。仓库示例默认不含商业图商 Key。数据文件的大小与 SHA-256 见 [manifest.json](manifest.json)。
