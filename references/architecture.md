# 组件架构

对 Agent 和调用者只有三类能力：**可视化组件、场景叙事组件、地球模式组件**。平面地图的所有可视化效果在[统一清单](visualizations.md)中平等选择。用户问题、字段语义、必要几何、聚合口径和图商能力决定选择；源码目录和底层绘制方式不构成能力等级。

```text
用户数据与分析目标
  → profile_geo.py / 必要的数据准备 → references/selection.md 选效果
  → build_visual_html.py（平面可视化统一 HTML 入口）
    → assets/components/visualizations.mjs（统一注册表和生命周期）
      → assets/recipes/gl-layers.mjs（内部复用的点线面实现）
      → assets/components/maplibre-effects.mjs（内部复用的飞线等实现）
      → assets/components/point-glow.mjs（散点可选加法叠加，deck.gl 补充）
  → HTML → 浏览器验收
场景叙事
  → scene_plan.py → 场景数据（章节、镜头、用户地点/路线、媒体）
  → build_scene_html.py → SceneNarrativeViz → 所选地图 SDK / 静态图片
  → build_scene_video.py → assets/video/Remotion 工程 → 按帧渲染 → MP4
```

`assets/components/visualizations.mjs` 导出各个独立组件类与 `createViz(map, {effect, data, ...})`。所有平面组件提供 `ready`、`setData`、`setFilter`、`setTheme`、`inspect`、`destroy`，拾取事件以 `{effect, kind, items, count}` 返回；仅对需要的组件附加 `pause/play`、`setCellSize` 等方法。类别点 `category-points` 与数值着色点 `point-color` 是不同组件。公开入口不要求调用者判断内部绘制路径。

`assets/recipes/` 是内部复用模块：`gl-layers.mjs` 实现点线面等 SDK 图层和数据绑定，`maplibre-layers.mjs` / `mapbox-layers.mjs` 锁定引擎，`official-layers.mjs` 为部分高德 Loca / 百度 MapVGL 效果提供官方扩展封装。旧路径保留兼容。新能力应在统一注册表中拥有独立 effect、输入校验与生命周期，再选择合适的底层实现；不能因共用代码把效果分成另一类供 Agent 决策。

`assets/components/maplibre-effects.mjs` 实现飞线、呼吸点、雷达、蜂窝；`travel-itinerary.mjs`、`story-timeline.mjs` 与 `scene-narrative.mjs` 实现场景叙事；`globe-effects.mjs` 使用独立 Globe.GL。`assets/shared/` 提供颜色、图例/统计、主题及 `basemap.mjs` 底图逻辑，`assets/adapters/` 提供坐标和旧作品适配，均不决定可视化方案。底图配置是现有组件的地图背景，不作为新的业务组件。`scripts/build_map_html.py`、`build_effect_html.py` 是统一平面入口复用的打包器，不是供 Agent 先选“基础或独立”的分流入口。

公开类共 19 个：13 个可视化组件、3 个场景叙事组件、3 个地球模式组件。`SceneNarrativeViz` 使用同一场景数据按时间采样；HTML 播放和 Remotion 逐帧渲染共享章节、路线进度及相机定义。Remotion 模板放在 `assets/video/`，仅生成视频工程时使用；安装 Skill 不安装它的 Node 依赖。Cesium 属于场景叙事的三维镜头引擎，独立 Globe.GL 数据地球仍保留在地球模式类别。

统一平面组件的当前可直接生成范围为 MapLibre 全部已列效果、Mapbox 中经验证的点线面等效果。高德、百度、腾讯、Google 应先查各自能力文档，使用该图商原生或官方扩展；存在能力缺口才按[渲染归属](provider-rendering.md)补充，不能实例化 MapLibre 专属组件假称其他图商实现。

示例页里的停车方格、图标点仍是页面专用表达，未注册前不宣称通用组件。发布包包含 Skill 指令、参考资料、脚本与运行所需 `assets/`；`examples/` 保留在 GitHub 源码仓库，不是安装 Skill 的依赖。
