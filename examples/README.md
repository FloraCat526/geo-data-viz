# Geo Data Viz 示例

默认示例中心包含 12 个独立地图作品，供快速体验和修改。它们不是 Skill 的运行依赖，也不是上传数据的平台。仓库已包含可运行 HTML，无需 Key、npm install 或构建。示例既有统一组件作品，也有为特定数据制作的页面效果，下面逐项标明。

## 运行

下载 GitHub 仓库（或解压 Download ZIP），进入仓库根目录：

```sh
npm run examples
```

需要 Node.js 20+。访问 http://127.0.0.1:8000/。退出用 Ctrl+C。

端口占用时：

```sh
npm run examples -- --port 8001
```

不使用 Node.js 时，Python 3 也可以：

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory examples
```

SDK、字体和底图瓦片仍需联网；地球示例另从 CDN 加载 Globe.GL 和地球纹理。地图空白时先检查网络及页面错误提示，无需申请地图 Key。GitHub 的文件浏览页不会执行 HTML，需下载运行。示例服务器仅监听本机并只提供 examples 目录；不是生产托管服务。

## 地图数据可视化

| 示例 | 数据 | 主要交互 |
| --- | --- | --- |
| [新加坡发光散点](maps/point-glow.html) | 晚间快照的 2,605 个可用出租车位置 | 普通 / 柔光 / 加法叠加散点，通过统一组件切换 |
| [新加坡私人住宅](maps/housing.html) | 1,988 个 250 m 网格，458,975 套私人住宅 | 区域设色 / 3D、类别筛选、点击详情、深浅主题 |
| [新加坡历史航空飞线](maps/flights.html) | 125 条历史连接 | 飞线与目的地 |
| [美国公路历史事故](maps/highways.html) | 20,592 个道路要素 | 风险色阶与指标线宽 |
| [意大利及周边地震事件](maps/quakes.html) | 190 次 2025 年地震 | 呼吸点、位置点、深色地图 / 卫星图切换与点击详情 |
| [新加坡出租车快照](maps/taxis.html) | 早 / 中 / 晚三个快照 | 热力与位置点 |

接口核查：发光散点与住宅通过统一 `build_visual_html.py` 重建，在页面使用 `createVizSwitcher`。历史航空飞线与地震的主要动效调用 `createViz`，其中出发点、普通位置点、地震底图切换等辅助图层与交互仍为页面定制。公路事故与出租车快照使用专门的页面代码，展示数据驱动的 MapLibre 图层；其特殊指标线宽与快照交互**尚无对应的通用组件接口**。不能把这些页面定制效果计入已封装组件清单。

## 地球模式可视化

| 示例 | 数据 | 主要交互 |
| --- | --- | --- |
| [球面航空连接](maps/globe-flights.html) | 125 条历史航线 | 球面弧线、洲别颜色、端点拾取 |
| [球面全球人口](maps/globe-countries.html) | 177 个国家或地区，169 个有数值 | 2024 年人口总量对数色阶、缺失区分 |
| [球面棱柱](maps/globe-earthquakes.html) | 591 次 M 4.5+ 事件 | 震级柱、位置拾取 |

## 场景叙事可视化

| 示例 | 数据 | 主要交互 |
| --- | --- | --- |
| [新加坡两日漫游](maps/travel-itinerary.html) | 2 天、6 站的示例行程 | 总览、日期切换、站点讲解与虚线顺序连接 |
| [沿着海峡，写下六个章节](maps/story-timeline.html) | 6 个机场点位及虚构故事章节 | 时间轴播放、拖动、跳章、轨迹逐段展开 |
| [阿尔卑斯山地飞越](maps/mountain-flyover.html) | 24 秒、4 章节、6 个地标；SWISSIMAGE 航片与真实 DEM | 播放 / 暂停、拖动、跳章与三维地形镜头 |

主页内嵌地图默认收起面板，突出地图；点“展开”即可使用筛选与效果切换，“单独打开”可使用完整窗口。

两日漫游由[手工编排的 CSV 站点表](data/travel-itinerary-stops.csv)生成行程 JSON 和 HTML，用来演示上传表格后的转换流程。漫游的时间和说明不是实际出行建议，虚线不代表道路。住宅高度是数量的视觉映射，不是建筑楼高；热力不代表客流。完整来源、许可与转换说明见 [SOURCES.md](SOURCES.md)，它随 HTML 一起分发。

故事时间轴的地点坐标取自仓库中的 OpenFlights 历史机场数据；章节、日期和情节是虚构演示，虚线仅表示叙事顺序，不代表实际行程或速度。

地震示例默认使用深色地图，左下角可切换卫星图；事件与 NASA 底图日期不同，影像显示范围最高使用 8 级瓦片。山地飞越使用 SWISSIMAGE 最新可用正射航片镶嵌，并通过 Mapterhorn 的 swissALTI3D 高程呈现地形；航片不是实时卫星图，镜头关键帧不是实际旅行轨迹。

## 修改与重新生成

`data/` 保存规范化 WGS84 数据，`specs/` 保存效果、字段和布局配置。

发光散点复用 `data/taxis.json` 的晚间位置快照，通过统一 `PointViz` 接口切换普通、柔光与颜色叠加效果。颜色叠加使用 deck.gl 补充渲染，普通散点和柔光使用 MapLibre 原生圆图层。重建不依赖桌面上的原始文件。

修改后在仓库根目录执行：

```sh
python3 examples/build.py
```

只需 Python 标准库。这会重建默认示例中心的 12 个页面及其共享脚本。先将手动修改过的页面另存，再重建。山地飞越也可单独重建：

```sh
python3 examples/build_mountain_flyover.py
```

部分页面内嵌数据，其他页面加载 `assets/` 脚本和 `data/` 文件；请保留整个 `examples/` 目录，通过本地 HTTP 服务运行。分发时保留 `SOURCES.md` 和 `licenses/`。

新增示例：准备符合所选组件输入契约的数据和 spec，再调用仓库 `scripts/build_visual_html.py`，在主页添加指向新 HTML 的链接。仅替换数据时需重新核对几何、指标、单位、坐标系，不能把任意数据直接套入旧指标定义。

## 分发范围

本目录随 GitHub 源码提供；不复制到用户安装的 Skill 目录，不增加 npm Skill 安装体积。页面不包含商业地图凭证，不会上传数据到服务端进行分析。地图服务会接收加载底图资源的普通网络请求。

部分示例读取 `data/` 下的数据，使用本地 HTTP 服务运行。点、线、面与呼吸点使用 MapLibre 原生图层；三维流光飞线由 deck.gl 补充。重建命令仍为 `npm run examples:build`。平面组件已统一从 `build_visual_html.py` 与 `createViz` 选择；页面定制效果仍应按具体作品单独验收。

地球示例由 `scripts/build_globe_html.py` 与 `assets/components/globe-effects.mjs` 生成。球面由 Globe.GL 绘制，实际渲染归属为第三方，不是 MapLibre 或任意商业图商的原生图层。组件输入与复用方式见 [地球模式说明](../references/globe-effects.md)。弧线与柱高是示意视觉参数；人口为总量，不是密度。球体一次只能显示一个半球，旋转查看另一侧。

航空飞线与地震呼吸点分别通过统一 `createViz` 入口调用 `FlyLineViz` 和 `RippleViz`。公开类与参数见[类参考手册](../references/class-reference.md)；底层渲染实现由组件内部管理。示例构建时把组件源码打包到 `examples/assets/visualizations.js`；不要直接修改该生成文件。
