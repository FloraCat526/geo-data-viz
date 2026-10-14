# 按数据生成地图作品

这个 Skill 可以单独安装运行。运行不依赖演示平台。Agent 每次根据附件、用户问题和所选平台生成适合该数据的作品；代码辅助资源用于降低接入错误，不规定 UI。

## 一次任务的实现顺序

1. 读取 profile.json，确认有效/无效记录、源 CRS、绑定指标与几何类型。
2. 按 [数据匹配规则](selection.md) 与 [所选平台的能力文档](capabilities/index.md) 形成选型说明。定义本次 visualSpec：指标字段、单位、颜色/面积/宽度映射、阈值、动画含义、筛选与图例。跨平台共用同一 spec，过滤时不偷偷重算色阶。
3. 按选型说明的具体 API/扩展与版本实现。每家可以使用不同底层图层，保持业务映射一致；能力清单是生成依据，不是已内置的运行时图层注册表。每个数据层都需满足 [渲染归属](provider-rendering.md)，不能把共用 Canvas 作为默认路线；仅当对应图商能力不足时采用有依据的补充方案。
4. 生成的页面直接读取该数据与已授权的运行配置。若用户选择多个地图，加入简洁的切换控件；单平台作品不必出现各家按钮、Key 管理后台或再次上传入口。
5. 按数据范围设置相机，加载成功后绘制，保存同一份业务状态。连接失败给出具体可处理的信息。验证实际结果后交付。

## HTML 交付

中小数据默认交付 `map.html`：内嵌必要数据、CSS 和业务 JavaScript，直接呈现用户附件。远程 SDK、字体、底图仍可能需要网络；独立文件不等于离线。确认 SDK、模块和 Key 来源限制是否允许 `file://`，不能承诺任意环境双击即用。

需要 fetch 外部文件、模块导入或数据较大时，交付 `index.html` 与完整依赖目录，使用实际可用的 Python 启动，例如 `python3 -m http.server 8000 --bind 127.0.0.1 --directory OUTPUT_DIR`，给出本次端口和 URL。输出目录不包含无关文件或私密配置，避免通过本地服务暴露。

- Key 仅从用户已授权的值或指定配置读取。浏览器无法直接读取 shell 环境变量；需要生成时注入已授权浏览器 Token，或由明确的运行配置提供。服务端 secret 不进入前端。包含 Token 的 HTML 是本地产物，分享前移除。
- 内嵌 JSON 转义 `<`，避免数据里的 `</script>` 结束脚本；上传文本用 textContent 等安全文本方式显示。只带展示所需字段，避免无关个人数据随 HTML 外发。
- 保留图例单位、固定数值域、缺失编码、数据来源与必要统计说明。最终回复给出 HTML 链接、启动方式、主要发现、选图理由和验证状态；profile 与选型说明留在工作目录。
- 所选服务需要 Key 且缺失时完成数据与代码，显示具体待接入原因；免 Key 路线直接加载地图。不能把空网格当地图。宿主无浏览器时标记视觉验收未完成。

## 默认路由与平面可视化统一入口

未指定图商、没有本任务已授权配置时，使用 [MapLibre + OpenFreeMap](capabilities/maplibre.md)，直接生成 HTML，无需 Key。明确指定图商时始终保留选择；缺少该服务必要配置才询问，不能静默切换。未指定图商但已有唯一适用的授权配置时沿用对应服务。

平面可视化先从[组件清单](visualizations.md)选 effect，再调用 `scripts/build_visual_html.py`：

```bash
# 默认免 Key；输入已由 profile_geo.py 规范化
python3 SKILL_DIR/scripts/build_visual_html.py WORK/profile/normalized.geojson --spec WORK/spec.json --out OUTPUT/map.html
# 本任务明确指定 Mapbox，读取明确授权的配置
python3 SKILL_DIR/scripts/build_visual_html.py WORK/profile/normalized.geojson --spec WORK/spec.json --out OUTPUT/mapbox.html \
  --provider mapbox --config /path/to/runtime.local.json
# 或使用用户明确授权读取的环境变量名
python3 SKILL_DIR/scripts/build_visual_html.py WORK/profile/normalized.geojson --spec WORK/spec.json --out OUTPUT/mapbox-env.html \
  --provider mapbox --token-env MAPBOX_ACCESS_TOKEN
```

配置 JSON 可含 `{"provider":"mapbox","mapboxToken":"<浏览器 public Token>"}`，不提交真实值。工具仅读取显式传入的配置/变量，不扫描其他项目、历史文件或全部环境变量。图商选择来自 `--provider` 或 `spec.provider`（二者冲突时报错），其次为配置中的 provider，最后根据明确的 Mapbox 凭证来源或无配置决定。明确 MapLibre 时忽略无关 Mapbox 凭证。Mapbox 缺 Token 生成 pending-key 页面，不会请求 OpenFreeMap；明确变量名却为空时提示配置错误，不悄悄降级。对 Google/百度/高德/腾讯，统一入口会拒绝并指向相应能力文档，Agent 应继续按该图商原生 API 生成 HTML。

MapLibre 与 Mapbox 对已支持的效果分别加载各自 SDK 和底图，并适配不同聚合接口。`assets/recipes/gl-layers.mjs` 是若干组件的内部共用实现，`maplibre-layers.mjs` / `mapbox-layers.mjs` 锁定引擎；单独复制模块时需带上共用模块及 `assets/shared/color-scale.mjs`。`scripts/gl_html.py` 是打包器共用依赖。[实现架构](architecture.md)说明公开组件与内部模块的关系。飞线、呼吸点、雷达和蜂窝同样由 `build_visual_html.py` 选择；目前仅能直接导出 MapLibre 版本。

### 影像与地形底图

`basemap` 是完整页面 spec 的底图配置，独立于 `effect`、指标与统计。用户要求影像/地形时按[底图配置](basemaps.md)准备 raster/DEM 来源；地图引擎负责显示，底图资源不补全业务数据。影像或 DEM 缺失时保持原始分析与图商选择，说明该背景尚待资源，不把平面纹理称为真实地形。

## 场景叙事与视频交付

旅行日期浏览和事件时间轴分别使用已有旅游/故事生成器。需要镜头、章节、媒体和路线同步时，可用 `scripts/prepare_scene.py` 将已有规范化故事/旅游数据生成可编辑计划，或按[场景镜头](scene-narrative.md)直接编排 `scene.json`，再调用 `scripts/build_scene_html.py`。它按目标创建真实地图 SDK、Cesium Viewer 或具有地理范围及投影的静态图片场景。转换默认不补路线；只有明确要求示意连接才启用 `--schematic-links`。

用户明确要求 MP4 时，按[视频输出](video-export.md)用 `scripts/build_scene_video.py` 生成可选 Remotion 工程，并执行其实际渲染命令。工程和 HTML 可复用同一场景数据；工程生成不等于视频导出成功。保留媒体和地图资源许可，分享源工程前清除浏览器凭据；视频画面保留地图服务要求的可见署名。

## Mapbox 兼容入口

Mapbox 已支持效果的底层参数见[图层实现](mapbox-recipes.md)。`assets/recipes/mapbox-layers.mjs` 与 `scripts/build_mapbox_html.py` 保留为兼容入口；新任务先从统一组件清单和生成入口开始。布局与选型仍由 Agent 决定。

旧入口仍仅生成 Mapbox，缺 Token 时维持 pending-key；默认免 Key 任务使用上方统一入口。

## 历史接入辅助代码的边界

`assets/adapters/providers.mjs` 是保留兼容旧作品的北向二维 SDK 加载/投影封装，不包含各家原生数据图层，也未提供完整原生图层接入接口。它本身不是数据渲染器；原生路线不能照搬 project → 自绘流程。能力不足需要二维 Canvas 补充时，可核验这些接口后复用；当前封装锁定北向二维，不适合直接作为通用 3D/全平台补充层。新作品优先创建所选 SDK 地图及该图商的数据层，Mapbox 可用上方原生配方，其他图商按对应能力文档实现。

`assets/adapters/coords.mjs` 的坐标转换可按来源契约单独复用，它是数据准备而非渲染；近似公式不能声称测绘精度。高德海外数据须设置 showOversea: true 并核验 Key 权限；开关或 complete 事件不等于真实海外地图可见。跨图商视野按地理范围恢复，不复制各家的 zoom 数字。

## 验收重点

- 分析：有效数 + 无效数可核对；数值零/负值/缺失不同；同坐标不同实体保留；多点/多线/多面正确展开；不将地址或轨迹缺口补造为坐标。
- 表达：气泡面积与数量一致，缺失单独编码；图例单位和阈值准确；重叠点能访问详情；线面和 OD 连线含义明确；日期线与 Web Mercator 极区处理有依据。
- 归属：保存所选 SDK/官方扩展、具体图层类/type/ID 与挂载调用；原生数据进入该图商 source/layer；补充层记录 fallbackReason 与真实库/类，验证相机同步、拾取、清理。切图商重新判断原生能力；双方都有缺口时可复用经适配验证的补充层，但不能据此声称原生互切。
- 接入：真实底图可见，已知点位正确，缩放与拖动无漂移，标识未被遮挡；Key/网络/配额失败能理解和恢复。
- 切换：数据 ID、字段、筛选、图例、选择及地理范围保留；旧实例清理，迟到请求不覆盖新状态。
- 交互：暂停/后台恢复、空结果、窗口 resize 和所需屏幕尺寸；大数据性能按实际设备评估，不套固定点数上限。

记录哪些真实平台和效果已测试、哪些仅做了脚本或模拟 SDK 验证。模块模拟测试不证明商业底图在用户 Key 与网络下能运行。


## 生成失败的可处理信息

两个 HTML 命令行入口都向 stderr 返回 JSON：`{"error":{"code":"OUTPUT_EXISTS","message":"...","hint":"..."}}`，退出码 2。Agent 按 code/hint 修复，不重复盲试，也不回显配置和 Key。

常见 code：UNKNOWN_SPEC_FIELD（修正未知配置字段与拼写）、LOCALE_CONFIG（使用 zh-CN 或 en）、OUTPUT_EXISTS（更换输出路径）、CRS_UNRESOLVED（核实坐标/转换）、METRIC_REQUIRED（绑定指标和单位或改用位置/边界表达）、GEOMETRY_EFFECT_MISMATCH（选择几何层）、COLOR_SCALE（校正色域和颜色数量）、TOKEN_MISSING（仅核查指定授权来源）、PROVIDER_RECIPE_REQUIRED（读取所选图商能力文档与配方，保持选择）、INVALID_JSON/INVALID_OBJECT（修复输入结构）。


页面风格支持 spec 顶层 `theme: dark|light` 与 `themeSwitcher: true|false`，配置和底图切换生命周期见 [主题说明](themes.md)。

布局、当前筛选统计、详情字段、可视图例与像素参数见 [布局与交互](presentation.md)。`scripts/html_template.py` 与 `assets/shared/view-model.mjs` 是生成器的共用依赖，分发时需一起带上。

## 许可声明

生成器将项目 MIT 许可写入 HTML 注释；分享包含本项目代码的作品时保留该声明。Agent 手工复制或改写本项目实质代码时，同样保留根目录 LICENSE 的版权与许可。声明不需要占据业务面板；图商要求可见的版权标识仍须保留。用户数据与第三方资源遵循各自权属、许可及服务条款。
