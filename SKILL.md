---
name: geo-data-viz
description: Analyze geographic CSV, Excel, JSON, or GeoJSON and generate runnable HTML maps, interactive globes, or geographic narratives. Use for geographic data visualization and user-requested map storytelling or video. Default to MapLibre + OpenFreeMap; honor explicit providers and authorized imagery or terrain resources.
---

# 地理数据可视化

在 Agent 对话中分析用户附件、选择合适的表达并交付这份数据的 HTML 地图。用户要求场景叙事或视频时，可编排章节、镜头与路线并输出 HTML 或 Remotion 视频工程。默认生成具体作品；只有用户要求时才开发上传平台或加入多图商切换。

能力只按以下三类组织。平面效果都作为平等、可独立选择的可视化组件；Agent 按问题和字段选组件，底层绘制方式只是实现细节。示例中的停车方格和图标点是按数据制作的页面效果，不等于另有通用组件 API。

| 类别 | 当前可复用能力 |
| --- | --- |
| 可视化组件 | 散点、分类点、数值着色点、气泡、点聚合、热力、线、区域设色、3D 拉伸，以及飞线、呼吸点、雷达扫描、平面／3D 蜂窝；可配置矢量、影像或地形底图 |
| 场景叙事组件 | 旅游规划、故事时间轴、场景镜头叙事；章节、镜头、路线揭示、地点讲解、图片、字幕与已有旁白；可选静态地图、MapTiler、Cesium 或 Remotion 视频输出 |
| 地球模式组件 | 球面飞线、全球区域设色、事件指标柱 |

可视化的数据仅来自用户在本任务提供的文件或明确提供的内容。Skill 不提供算路、地理编码或外部数据补全服务；地图 SDK 与底图资源的加载不等于补充用户数据。缺少坐标、路径几何或区域边界时，先做现有数据能够支持的展示，并说明缺项；不能自动请求第三方服务生成这些数据。

## 运行条件

- 数据分析和 HTML 生成需要 **Python 3.10+**。CSV、TSV、JSON、GeoJSON 使用标准库；Excel 仅支持 XLSX/XLSM，需要 `requirements-excel.txt` 中的 openpyxl。旧 XLS 先转换。
- 生成的 HTML 需要支持 WebGL 的浏览器及网络，以加载 SDK、字体和底图。默认 MapLibre 可视化无需安装 Node.js 或申请 Key；飞线和显式启用的散点加法叠加另从固定 CDN 加载 deck.gl（加法散点需 WebGL2）。地球模式使用独立 Globe.GL 与地球纹理，也需联网。
- 影像和地形是底图选项：只有任务需要时加载用户提供或已授权的影像瓦片、DEM 与对应 Key；默认 OpenFreeMap 矢量样式不自带卫星影像或高程。视频导出另需可选 Node.js/Remotion 工程与 Chromium，按[视频输出](references/video-export.md)准备，普通 HTML 不依赖它们。
- `SKILL_DIR` 指当前已安装 Skill 的实际路径，`WORK` 指本次任务工作目录。路径含空格时加引号。不要将用户数据或作品写回 Skill 安装目录。

## 1. 识别输入与分析目标

定位附件并读取必要样例，判断几何、记录粒度、指标单位、类别、时间及坐标来源。数据和目标明确时直接推进；只询问会影响结果的关键缺项（坐标系、指标含义或指定服务的凭据），继续不依赖答案的工作。

**先区分原始数据和已规范化数据：**

- 原始 CSV/Excel/JSON/GeoJSON：运行分析脚本，读取摘要，再按业务含义显式绑定指标；数值候选不等于已选择指标。
- 已含稳定字符串 ID、`metadata.dataCrs` 和 `properties.__viz` 的 FeatureCollection：按 [数据契约](references/data-contract.md#reuse-normalized) 检查现有绑定是否符合本次目标。符合时直接交给生成器校验并复用，不重复运行 profiler。需要换指标时从原始字段显式重新绑定，保留原文件。
- 只有地址、OD 表、轨迹、多表或区域编码：按需读 [数据转换](references/transforms.md)，仅对用户提供的数据完成必要关联后再渲染；不编造或从外部补充坐标、路线、边界。

原始输入示例：

```bash
python3 "SKILL_DIR/scripts/profile_geo.py" "locations.csv" --out-dir "WORK/profile"
python3 "SKILL_DIR/scripts/profile_geo.py" "locations.csv" --out-dir "WORK/profile-bound" \
  --crs wgs84 --lng-field longitude --lat-field latitude \
  --value-field visits --label-field name --category-field type
```

检查 `status`、有效/无效记录和警告，不以退出码代替数据质量判断。CRS 来自源声明或可靠依据，不能从数值范围猜测；`--crs` 不执行转换。详细解析参数、缺失值和 CRS 冲突处理见数据契约。

## 2. 选择图商和可视化

平面地图的图商按以下顺序确定：用户明确选择 → 本任务唯一适用的已授权配置 → **MapLibre + OpenFreeMap**。用户明确要全球球面视角、未指定图商时，可按[地球模式](references/globe-effects.md)使用免 Key 的独立 Globe.GL 渲染器；不要将它标为 MapLibre 图层。明确选择商业图商却缺凭据时先完成分析及页面，保留所选服务，不静默换图商。凭据仅从本任务明确授权的值、配置或环境变量获取，不扫描其他项目或历史配置。

1. 阅读 [分析目标 → 字段 → 聚合 → 组件](references/selection.md#2-分析目标--字段--聚合--组件)，按用户问题淘汰不适用方案。分析脚本的 recommendations 是未排序的结构候选，不自动选第一项。
2. 已指定图商时阅读[能力索引](references/capabilities/index.md)和该图商文档，落实到具体 API、版本和依赖。优先原生图层或官方扩展；确认能力缺口后才用第三方补充，规则见[渲染归属](references/provider-rendering.md)。未指定图商且选择地球模式时直接读[地球组件](references/globe-effects.md)，无需虚构 MapLibre 底图。
3. 采用一个主方案，必要时提供最多两个有不同分析价值的备选。指标、聚合、颜色、面积和高度遵循 [视觉映射](references/visualization.md)，不能用视觉效果暗示数据未支持的业务结论。

底图类型与数据组件分别选择。用户要求卫星、山地或地形上下文时，读取[底图配置](references/basemaps.md)；影像不改变统计口径，DEM 地形不等于指标柱高。不要为常规统计地图默认增加地形、影像付费资源或视频依赖。

在工作目录保留简短 `viz-plan.json` 或等价说明，记录数据依据、聚合口径、固定域、图商、图层 API、渲染归属和待验证项；采用补充渲染时写明能力缺口。结构见选型文档，不记录 Key。

## 3. 生成作品

按分析目标在以下三类中选择入口，不默认读取所有参考资料。平面可视化从[统一组件清单](references/visualizations.md)平等选择；各组件的必要输入因其表达含义而异。直接编写组件调用或核对构造参数时读[类参考手册](references/class-reference.md)。[源码架构](references/architecture.md)仅用于开发，不决定业务选型。

### 可视化组件

| 任务 | 入口与按需参考 |
|---|---|
| 散点、分类点、数值着色点、气泡、聚合、热力、线、区域设色、3D 拉伸、飞线、呼吸点、雷达扫描、蜂窝 | `scripts/build_visual_html.py`；[组件清单、输入与统一 API](references/visualizations.md) |

### 场景叙事组件

| 任务 | 入口与按需参考 |
|---|---|
| 多日旅游行程、日期切换与站点讲解 | 原始站点表先用 `scripts/prepare_itinerary.py` 核实字段、顺序和路径关联，再用 `scripts/build_itinerary_html.py`；[旅游规划组件](references/travel-itinerary.md) |
| 故事讲述、历史事件或出征地点的章节时间轴 | 原始点位表先用 `scripts/prepare_story.py` 明确事件顺序与坐标，再用 `scripts/build_story_html.py`；[故事时间轴组件](references/story-timeline.md) |
| 镜头跟随、地理解说、山地/三维飞越或视频故事 | 已有规范化故事/旅游数据可先用 `scripts/prepare_scene.py`，或将已提供的地点、路径与章节编排为 `scene.json`，再用 `scripts/build_scene_html.py`；[场景镜头组件](references/scene-narrative.md)。用户明确要求 MP4 时再用 `scripts/build_scene_video.py`，见[视频输出](references/video-export.md) |

### 地球模式组件

| 任务 | 入口与按需参考 |
|---|---|
| 未指定图商、需要全球球面飞线、区域设色或指标柱 | `scripts/build_globe_html.py`；[地球组件与输入](references/globe-effects.md) |

指定其他图商时使用[接入配置](references/providers.md)、对应能力文档与[官方扩展实现](references/official-recipes.md)。各类作品的深浅主题、布局和交互见[主题](references/themes.md)与[成品布局](references/presentation.md)；数据内嵌、启动和交付见[生成与验收](references/generation.md)。

平面可视化生成命令：

```bash
python3 "SKILL_DIR/scripts/build_visual_html.py" "WORK/profile-bound/normalized.geojson" \
  --spec "WORK/visual-spec.json" --out "WORK/map.html"
```

已规范化输入可直接替换命令中的数据路径。飞线使用已核实坐标的 OD JSON，呼吸点、雷达与蜂窝使用 Point GeoJSON；详见组件清单。指定 Mapbox 时增加 `--provider mapbox`，以及本任务已授权的 `--config FILE` 或 `--token-env NAME`。该工具只对已有可验证实现的组件生成 Mapbox HTML；其余图商按相应能力文档实现，不静默换图商。旧生成器保留为内部实现或兼容入口。

- 默认交付 `map.html`，内嵌必要数据和业务代码；需要外部资源时提供完整目录及启动命令。按用户语言设置标题、单位、业务说明和 `locale`。
- 页面突出结果，只加本次有用的图例、详情、筛选和控制；记录列表默认隐藏。主题、筛选、图例和统计保持一致，避免大气泡遮挡、热力过饱和或缺失与零值混淆。
- 原始坐标保留，转换在适配边界生成副本。统计、稳定 ID、分类颜色和数值域保持一致；多图商切换仅按用户要求实现。
- 浏览器 Key 仅接入本地作品配置，分享前移除；服务端 secret 不进前端。Key 只用于本次选定图商的地图可视化，不用于请求地理编码、算路或外部业务数据。上传文本按数据安全渲染。
- 对大数据按实测选择聚合、Worker 或切片，不静默截断。动画提供暂停并尊重 reduced-motion；保留必要的数据许可和地图版权标识。
- 场景中的路线、地点及业务时间仍来自用户数据；镜头运动和章节时长只是叙事编排。无真实路径时标为示意连接；静态地图需地理范围才可定位叠加。三维飞越需真实 DEM/3D Tiles 资源，不用插值伪造地形。字幕、图片和旁白使用用户提供或明确授权的内容。
- 中国地图任务遵循适用地图合规要求；宿主提供内置地图合规 Skill 时按宿主方式读取，仅在具体实现受影响且信息不足时澄清。

## 4. 验证与交付

在浏览器检查真实底图、已知位置、数据层、图例、缩放、筛选、拾取和目标屏幕布局；检查动画暂停、空结果及资源清理。图层注册或 SDK 加载成功不等于画面通过。无浏览器或缺真实 Key 时明确标注尚未验收的部分，不假称通过。

视频还需检查实际渲染帧、路线首尾、章节切点与音画同步。只生成工程不称为 MP4 已导出；地图 Key、影像和 DEM 的运行验收与代码测试分别记录。

按 [生成与验收](references/generation.md) 记录实际结果，交付作品链接、源文件和启动方式，简述数据发现与效果选择。没有发布要求时不上传用户数据。组件和图商的已知限制见 [验证边界](references/verification.md)；仓库历史测试不代表本次作品或所有宿主均已验收。
