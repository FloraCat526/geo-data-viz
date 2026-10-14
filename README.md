<p align="center">
  <img src="assets/brand/geo-data-viz.png" width="160" alt="Geo Data Viz：地图上的数据定位标记">
</p>

<h1 align="center">Geo Data Viz</h1>

<p align="center"><strong>上传一份数据，让 AI 帮你看见空间里的故事。</strong></p>
<p align="center">分析地理数据 · 生成交互地图 · 编排地理场景与视频</p>

<p align="center">
  <a href="#examples">示例体验</a> ·
  <a href="#getting-started">安装使用</a> ·
  <a href="#visuals">效果展示</a> ·
  <a href="#docs">文档</a> ·
  <a href="https://www.npmjs.com/package/@floracat/geo-data-viz">npm</a>
</p>

Geo Data Viz 是用于 **Codex、Claude Code 等 Agent 的地理数据可视化 Skill**。上传 CSV、Excel、JSON 或 GeoJSON，告诉 Agent 你想观察什么，它会检查数据、选择合适的地图表达，并生成可运行的 HTML 文件。需要讲述地点与路线故事时，可编排章节、镜头和媒体，按需生成 Remotion 视频工程并导出 MP4。

未指定地图服务且没有已授权 Key 时，默认使用 **MapLibre + OpenFreeMap**，无需申请 Key。指定 Mapbox 等服务时，沿用对应图商及已授权配置。

## 从数据到地图

- **先理解数据**：识别地理字段、坐标系、指标和空间分布，检查缺失值与异常值。
- **按问题选择表达**：用气泡比较规模，用热力观察密度，用路线呈现网络，用区域设色或 3D 展示空间差异；全球数据可选择球面飞线、区域设色与指标柱。
- **只处理用户提供的数据**：不会调用算路、地理编码或外部业务数据补全接口；缺少路径几何时仅展示站点顺序或明确标注的连接示意。
- **交付可使用的结果**：生成独立 HTML，按任务加入效果切换、搜索、筛选、悬停详情，以及深色／浅色主题。
- **让背景服务于表达**：地图数据组件可配置矢量、影像或真实地形底图；影像与 DEM 使用你提供或已授权的资源，默认 OpenFreeMap 仍无需 Key。
- **讲述空间里的故事**：用日期浏览行程，用时间轴展开事件，或用镜头、路线揭示、地点标注、图片、字幕和已有旁白制作地理解说；静态地图、MapTiler 和 Cesium 三维飞越都归入场景叙事。
- **尊重你的地图选择**：优先使用图商原生图层或官方扩展；能力不足时再用 deck.gl、ECharts、Canvas 等补充。多图商切换按需求加入。

数据和目标明确时直接推进；只在坐标系、指标含义、Key 等关键事项缺失时询问。具体效果取决于数据结构与所选地图服务，详见文末能力表。

<a id="examples"></a>

## 先体验一张地图

仓库附带 12 个可运行 HTML 示例，默认示例中心按**地图数据可视化、地球模式可视化、场景叙事可视化**三类浏览：

| 类别 | 代表数据 | 可视化与交互 |
| --- | --- | --- |
| 地图数据可视化 | 新加坡发光散点、私人住宅、历史航空飞线、出租车快照；美国公路历史事故、意大利及周边地震事件 | 柔光与颜色叠加、区域设色与 3D、飞线、指标线、呼吸点、分时热力、深色地图 / 卫星图切换 |
| 地球模式可视化 | 全球航空连接、人口、地震 | 球面飞线、区域设色、球面棱柱 |
| 场景叙事可视化 | 新加坡两日漫游、六章节故事、阿尔卑斯山地飞越 | 日期切换与地点详情；时间轴播放与轨迹展开；真实地形与 24 秒四章节镜头 |

```bash
git clone https://github.com/FloraCat526/geo-data-viz.git
cd geo-data-viz
npm run examples
```

打开 **[http://127.0.0.1:8000/](http://127.0.0.1:8000/)**。需要 Node.js 20+，无需 `npm install`、构建或地图 Key；SDK、字体与底图需要联网。

端口被占用时运行 `npm run examples -- --port 8001`。也可使用 Python：

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory examples
```

发光散点、住宅、航空飞线与地震呼吸点使用统一组件接口；公路事故的指标线宽与出租车的快照切换属于页面定制。每个示例的实际调用方式见[示例清单](examples/README.md)。Skill 的完整能力列表见文末，默认示例中心只展示精选作品。地球模式使用独立 Globe.GL WebGL 渲染器，无需地图 Key，但并非 MapLibre 原生图层；[组件说明](references/globe-effects.md)列出字段、语义与限制。

[示例运行与重建](examples/README.md) · [数据来源与统计口径](examples/SOURCES.md)

示例用于体验生成结果，不是 Skill 的运行依赖，也不随 npm 安装器复制。GitHub 中的 HTML 文件需下载后通过本地服务打开。

<a id="getting-started"></a>

## 安装使用

### 1. 安装到你的 Agent

需要 Node.js 20+。选择对应的技能目录：

**Codex**（默认安装至 `~/.agents/skills/geo-data-viz`）：

```bash
npx @floracat/geo-data-viz@latest install
```

**Claude Code**：

```bash
npx @floracat/geo-data-viz@latest install --dir ~/.claude/skills
```

**WorkBuddy 或其他兼容 Agent**：使用宿主配置的技能目录；`--dir` 指向其父目录，安装器会追加 `geo-data-viz`。

```bash
npx @floracat/geo-data-viz@latest install --dir /path/to/skills
```

> npm 安装的是已发布版本，可能落后于本 README 所描述的源码能力。要体验仓库当前的免 Key、主题与交互功能，请在克隆后的仓库根目录运行 `node bin/geo-data-viz.mjs install`；Claude Code 等宿主沿用上面的 `--dir` 参数。已有安装需加 `--force`，安装器会先备份旧版本。

安装后若 Agent 未识别 Skill，重启或重新加载技能。安装器只复制 Skill 文件；数据分析另需 Python 3.10+，Excel 的可选依赖见下方说明。

### 2. 上传数据，描述你想观察什么

在 Codex 中上传文件并输入：

```text
使用 $geo-data-viz 分析这份门店 CSV。
经纬度为 WGS84，我想比较各门店订单量，并观察门店集中在哪些区域。
选择合适的可视化方式，支持深浅主题，生成可交互的 HTML 地图。
```

Claude Code 可通过 `/geo-data-viz` 调用；其他 Agent 按宿主的 Skill 调用方式使用。

想使用已有图商配置时，可以补充：

```text
使用 Mapbox，读取本任务已授权的 MAPBOX_ACCESS_TOKEN 环境变量。
根据数据选择合适的原生图层，生成 HTML 地图。
```

已有的授权配置会复用。明确指定图商但缺少 Key 时，Agent 会补充必要配置，不会静默更换图商。只有地址的数据需要先完成地理编码。

需要地形或视频时，可这样描述：

```text
使用我上传的旅游地点和路线，按日期编排章节与镜头。
使用本任务提供的影像/DEM 配置展示地形，保留原始路线几何。
生成可播放的 HTML；再生成 Remotion 工程并导出 30 FPS 的 MP4。
```

普通 HTML 无需 Remotion。视频工具先生成独立工程，实际导出另需 Node.js 20+、依赖和支持 WebGL 的 Chromium；图片/旁白使用已提供的文件。地图资源与视频的实际验证范围见[底图](references/basemaps.md)及[视频输出](references/video-export.md)。

### 3. 打开生成结果

默认交付 `map.html`，内嵌必要数据与业务代码，SDK 和底图仍需联网。需要 HTTP 服务或外部大文件时，Agent 会同时交付相关文件与启动命令。

Agent 应验证地图是否实际显示、数据是否正确落位，以及本次需要的交互是否可用；仅生成文件或成功加载 SDK 不等于完成展示。

<details>
<summary>安装到当前项目、更新与预览安装清单</summary>

```bash
# 安装到当前项目的 .agents/skills/geo-data-viz
npx @floracat/geo-data-viz@latest install --project

# 更新默认安装，自动备份旧目录
npx @floracat/geo-data-viz@latest install --force

# 更新自定义目录时，保留原来的目录参数
npx @floracat/geo-data-viz@latest install --dir /path/to/skills --force

# 仅查看目标与文件清单，不写入
npx @floracat/geo-data-viz@latest install --dry-run --force
```

默认安装的备份位于 `~/.agents/.geo-data-viz-backups/`。安装包检查方法见 [安装包下载与校验](references/installation-review.md)。

</details>

<details>
<summary>Excel 依赖与手动数据分析</summary>

CSV、JSON、GeoJSON 的基础分析无需额外 Python 依赖。Excel XLSX/XLSM 可在虚拟环境中安装：

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r "$HOME/.agents/skills/geo-data-viz/requirements-excel.txt"
```

通常由 Agent 调用分析脚本，也可以手动运行：

```bash
python3 "$HOME/.agents/skills/geo-data-viz/scripts/profile_geo.py" \
  /path/to/stores.csv --out-dir ./work/profile \
  --crs wgs84 --lng-field longitude --lat-field latitude --value-field orders
```

按实际安装目录、数据字段与坐标系调整命令。

</details>

<a id="visuals"></a>

## 效果展示

以下预览来自仓库附带的公开示例，点击名称可查看对应 HTML 源码，下载后通过示例中心运行。预览与示例中心共用图片，避免重复保存历史截图。

| | |
| --- | --- |
| **[新加坡发光散点](examples/maps/point-glow.html)**<br>![新加坡发光散点](examples/assets/thumbnails/point-glow.jpg) | **[新加坡住宅 · 3D](examples/maps/housing.html)**<br>![新加坡住宅三维地图](examples/assets/thumbnails/housing.jpg) |
| **[新加坡历史航线 · 飞线](examples/maps/flights.html)**<br>![新加坡历史航线地图](examples/assets/thumbnails/flights.jpg) | **[意大利地震 · 波纹](examples/maps/quakes.html)**<br>![意大利地震地图](examples/assets/thumbnails/quakes.jpg) |

<details>
<summary>地球模式与场景叙事</summary>

| | |
| --- | --- |
| **[全球航空连接](examples/maps/globe-flights.html)**<br>![球面航空飞线](examples/assets/thumbnails/globe-flights.jpg) | **[球面棱柱](examples/maps/globe-earthquakes.html)**<br>![球面地震指标柱](examples/assets/thumbnails/globe-earthquakes.jpg) |
| **[新加坡两日漫游](examples/maps/travel-itinerary.html)**<br>![新加坡旅游规划](examples/assets/thumbnails/travel-itinerary.jpg) | **[阿尔卑斯山地飞越](examples/maps/mountain-flyover.html)**<br>![阿尔卑斯山地飞越](examples/assets/thumbnails/mountain-flyover.jpg) |

</details>

<a id="docs"></a>

页面支持中文与英文（`locale: zh-CN | en`）；记录列表默认隐藏，按需启用。配置拼写错误会返回修正提示，临时地图资源错误恢复后会自动更新状态。

## 文档与开发

| 你想做什么 | 从这里开始 |
| --- | --- |
| 理解 Skill 的完整工作流 | [SKILL.md](SKILL.md) |
| 理解统一组件接口与源码职责 | [类参考手册](references/class-reference.md) · [组件清单](references/visualizations.md) · [实现架构](references/architecture.md) |
| 检查字段、坐标系与指标语义 | [数据契约](references/data-contract.md) |
| 选择适合数据的可视化 | [选型指南](references/selection.md) |
| 生成 HTML、配置图商与凭证 | [生成指南](references/generation.md) |
| 配置影像、地形与高程来源 | [底图配置](references/basemaps.md) |
| 编排章节、镜头、路线与媒体 | [场景镜头组件](references/scene-narrative.md) |
| 生成 Remotion 工程并导出 MP4 | [视频输出](references/video-export.md) |
| 调整深浅主题、布局与交互 | [主题](references/themes.md) · [布局与交互](references/presentation.md) |
| 处理轨迹、OD 与区域关联 | [数据转换](references/transforms.md) |
| 核对效果的渲染来源 | [原生优先与补充效果](references/provider-rendering.md) |
| 查看已验证范围与版本变化 | [验证边界](references/verification.md) · [更新日志](CHANGELOG.md) |

仓库中，`scripts/` 提供数据分析、HTML 和视频工程生成入口，`references/` 提供选型和图商知识，`assets/components/visualizations.mjs` 提供平面可视化组件的统一注册表和接口，`assets/recipes/` 是组件内部复用的 SDK 图层实现，`assets/shared/` 保存颜色、图例/统计、主题和底图等公共逻辑；`assets/video/` 是可选 Remotion 模板，`examples/` 保存可运行示例。

欢迎通过 [GitHub Issues](https://github.com/FloraCat526/geo-data-viz/issues) 提交问题或建议；反馈地图问题时，请提供脱敏数据样例、图商、预期效果和错误信息，不要附上私密凭证。

中国地图相关任务须遵循适用的地图合规要求，保留必要的版权、地图标识和审图信息；宿主提供内置地图合规 Skill 时，按其指导执行。示例数据的来源和许可单独记录在 [来源说明](examples/SOURCES.md)。

## 许可证

项目代码与文档采用 [MIT License](LICENSE)，版权署名为 FloraCat526。复制或分发本项目代码时保留许可声明；生成器会将声明内嵌在 HTML 注释中，不占用地图界面。Remotion、第三方地图 SDK、影像、DEM、字体、媒体和示例数据遵循各自许可与服务条款，用户上传的数据不因使用本 Skill 而改变权属或许可。

## 地图服务商与第三方可视化能力

本 Skill 覆盖 MapLibre + OpenFreeMap 免 Key 组合及以下地图服务商，并为场景叙事增加 MapTiler、Cesium 与静态地图目标。优先使用所选引擎/图商的原生图层或官方可视化扩展；确认不支持目标效果时，可采用第三方库或自定义渲染补充，并说明能力缺口、实际渲染来源及限制。

### 地图服务商

| 服务商 | 主要可视化路线 | 能力参考 |
| --- | --- | --- |
| MapLibre + OpenFreeMap | 开源渲染引擎 + 免 Key 矢量底图；原生点线面与聚合；可配置授权影像、DEM 地形；场景镜头 | [MapLibre](references/capabilities/maplibre.md) · [底图](references/basemaps.md) |
| Mapbox | 原生点线面与聚合；授权卫星影像、地形和场景镜头 | [Mapbox](references/capabilities/mapbox.md) |
| Google Maps | 标记、聚合、Data 点线面、行政区设色、路径；连续热力采用补充方案 | [Google Maps](references/capabilities/google.md) |
| 高德地图 | JSAPI + Loca：点线面、呼吸、热力、网格、脉冲、拉伸 | [高德](references/capabilities/amap.md) |
| 百度地图 | JSAPI + MapVGL：点线面、聚合、热力、波纹、飞线、拉伸 | [百度](references/capabilities/baidu.md) |
| 腾讯地图 | TMap + visualization：散点、热力、弧线、轨迹、网格、区域面 | [腾讯](references/capabilities/tencent.md) |
| MapTiler | 场景叙事 SDK 目标；授权样式、影像、地形与逐帧相机 | [MapTiler](references/capabilities/maptiler.md) |
| CesiumJS | 场景叙事引擎；影像、真实地形和 3D Tiles 的三维镜头 | [Cesium](references/capabilities/cesium.md) |

上述为选型与生成代码的参考路线，实际可用性取决于 SDK/扩展版本、Key 权限、区域覆盖和运行环境。Loca、MapVGL、腾讯 visualization 按官方扩展记录，与通用第三方渲染库区分。

### 当前生成路线的成熟度

| 路线 | 当前状态 |
| --- | --- |
| MapLibre + OpenFreeMap | 通用 HTML 生成器与当前页面交互已有真实浏览器验收 |
| Mapbox | 共用原生生成器；历史底图实测与本次新增交互的验收分别记录 |
| 高德 Loca / 百度 MapVGL | 部分可复用图层配方与模拟 SDK 测试；页面按任务生成 |
| Google / 腾讯 | 能力文档与接入参考；按任务生成并验证所需效果 |
| 影像 / 地形底图 | 已封装配置校验与原生背景挂载；具体源、Key、贴地和遮挡按任务验收 |
| 场景镜头 / Remotion | 已提供场景组件、HTML 与视频工程入口；MP4 导出与视觉验收分别记录 |
| MapTiler / Cesium | 已接入场景目标；真实 Key、影像/DEM/3D Tiles 资源与视频按任务验证 |

能力边界见 [验证范围](references/verification.md)，不把文档覆盖当成所有组合已验收。

### 第三方与自定义补充

| 方案 | 可评估的补充能力 | 当前资源状态 |
| --- | --- | --- |
| deck.gl | 散点加法叠加、连续热力 HeatmapLayer、OD 弧线 ArcLayer、轨迹尾迹 TripsLayer、柱体等 | 已封装飞线与可选散点加法叠加；其他 API 按任务核验版本和地图集成 |
| Globe.GL | 独立 WebGL 地球：球面飞线、国家区域设色、事件指标柱 | 已封装三个组件及 HTML 生成入口；不是 MapLibre 或商业图商原生层 |
| Remotion | 场景叙事的镜头、章节、字幕、图片、已有音频与 MP4 输出 | 可选独立工程模板；普通 HTML 不依赖其 Node 包 |
| ECharts | 图商能力不足时，按任务选择适用的可视化表达和地图联动方案 | 已允许作为补充；尚未提供现成地图适配器或可复用效果配方 |
| 独立 Canvas / SVG | 定制二维数据效果 | 由 Agent 按任务实现，核验投影、相机同步、拾取与清理 |
| 自定义 WebGL | 原生能力不足时的特殊三维效果 | 由 Agent 按任务实现，核验投影、遮挡、拾取与兼容性 |

第三方或自定义实现不标为图商原生能力。缺 Key、网络错误或底图加载失败也不等于图商缺少可视化能力。详细规则见 [渲染优先级与补充效果](references/provider-rendering.md)。

## 三类组件

公开组件共 **19 个**：13 个地图数据组件、3 个场景叙事组件、3 个地球模式组件。影像、地形与视频是背景或交付选项，不另外计入数据组件。

### 可视化组件

用于回答地点分布、数量对比、密度、连接与区域差异等问题。散点、分类点、数值着色点、气泡、点聚合、热力、线、区域设色、3D 拉伸、飞线、呼吸点、雷达扫描、平面／3D 蜂窝均有独立的 effect 与组件类，可由同一入口选择。它们是本项目按数据表达定义的名称，**不是各图商的同名 SDK 类**。蜂窝支持边长调整及点数/总和/均值聚合；雷达扫描以已知站点和可配置半径绘制示意扇区，半径不自动代表真实覆盖。散点支持可配置点大小、透明度、柔和光晕和颜色加法叠加。默认图商下，飞线和显式启用的散点加法叠加由 deck.gl 补充渲染，其余效果使用 MapLibre 原生图层；Mapbox 点线面默认使用其原生图层，加法散点也明确使用 deck.gl 补充。详见[统一组件清单及图商名称对照](references/visualizations.md)与[选型表](references/selection.md)。用户指定其他图商时，仍优先使用该图商的原生或官方能力。

底图作为这些组件的共同背景，可选 `vector`、`imagery`、`terrain`。影像需要实际瓦片来源，高程需要真实 DEM；OpenFreeMap 默认提供清晰矢量地图。地形夸张和数据柱高分别配置，贴地、遮挡、署名与具体资源权限需实际验证。[底图结构与接入](references/basemaps.md)。

### 场景叙事组件

旅游规划组件 `TravelItineraryLayer` 使用 MapLibre 原生点线与文字图层，提供整个行程概览、按日期切换、地图常驻地点名及点击详情；只有站点顺序时以虚线表示示意连接。用户的 CSV、TSV、JSON 或站点 GeoJSON 可先通过 `scripts/prepare_itinerary.py` 明确日期、顺序、坐标和可选真实路径，再由 `scripts/build_itinerary_html.py` 生成独立 HTML。输入、命令和边界见[旅游规划组件](references/travel-itinerary.md)。

故事讲述组件 `StoryTimelineLayer` 使用 MapLibre 原生点线和标签图层，按章节时间轴逐段展开轨迹，支持播放、暂停、拖动和点击地点跳章。原始点位表可先经 `scripts/prepare_story.py` 整理，再用 `scripts/build_story_html.py` 生成独立 HTML；没有真实路线时仅使用明确标识的虚线示意连接。输入和时间语义见[故事时间轴组件](references/story-timeline.md)，[示例作品](examples/maps/story-timeline.html)使用虚构章节。

镜头叙事组件 `SceneNarrativeViz` 把章节、相机、用户路线揭示、地点高亮、字幕、图片和已有旁白放进统一场景数据。已有故事/行程可用 `prepare_scene.py` 转为可编辑计划，支持镜头沿提供路线跟随。可选择 MapLibre、Mapbox、MapTiler、Cesium 或具有地理范围与明确投影的静态地图；`build_scene_html.py` 生成可播放 HTML，`build_scene_video.py` 生成可选 Remotion 工程并按需导出 MP4。摄影机路线是取景安排，业务路线仍来自用户数据；三维山地/城市需要可用 DEM 或 3D Tiles。[组件接口](references/scene-narrative.md) · [视频导出](references/video-export.md)。

### 地球模式组件

未指定图商而明确需要全球球面视角时，可复用 `GlobeFlightLayer`、`GlobeChoroplethLayer`、`GlobeSpikeLayer`，或用 `scripts/build_globe_html.py` 从已核实 WGS84 的 OD/GeoJSON 直接生成作品。类别颜色与数值色阶按本次数据生成，不套用示例的震级阈值。三个[地球示例](examples/README.md)分别使用历史航线、World Bank 人口与 USGS 地震数据。使用独立 Globe.GL 渲染器，组件与输入约束见[地球模式说明](references/globe-effects.md)；用户指定图商时仍按其能力路线实现。


## 源码与分发目录

- `SKILL.md`、`agents/`、`references/`：Skill 入口、Agent 配置与使用指导。
- `assets/components/`、`assets/recipes/`、`assets/shared/`、`assets/adapters/`、`scripts/`：公开组件、内部图层实现、共享逻辑、图商适配和生成工具。
- `examples/`：随 GitHub 源码提供的可运行示例，保留数据、脚本和许可文件；不进入 npm Skill 安装包。
- `assets/brand/`：正式图标；README 预览复用 `examples/assets/thumbnails/`。
- `assets/video/`：场景叙事的可选 Remotion 工程模板，随 Skill 提供代码，实际视频依赖安装在用户输出工程中。
- `work/`：本地预览、历史草稿、验证日志与临时环境，已忽略，不提交。

npm 发布文件由 `package.json` 的 `files` 白名单限定。`.gitignore` 排除本地凭据、依赖、缓存、测试输出和根目录压缩包，但不会移除已经跟踪的文件。提交前检查 `git status --short`，并用 `npm pack --ignore-scripts --dry-run` 核对安装包；不要把项目旁边的历史输出目录一起上传。

上传 GitHub 时保留上述源码、公开示例及其数据许可。不要上传实际 Key／Token、安全密钥、私有数据、`.env` 等本地配置，以及 `node_modules/`、虚拟环境、缓存、日志、内部验证材料、内部示例和渲染输出。需要分享配置时只提供不含真实凭据的示例模板。

直接压缩文件夹不会应用 `.gitignore`。通过 ZIP 交接源码时，须排除 `.git/` 和所有被忽略的本地产物；保留 `examples/`，对方才能解压后运行示例中心。
