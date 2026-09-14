# 渲染优先级与补充效果

优先使用所选地图服务商的原生图层/覆盖物或官方可视化扩展。图商不支持目标效果时，允许独立 Canvas、deck.gl、ECharts、其他适用库或自定义 WebGL 补充。先说明具体能力缺口与补充来源，信息明确就继续实现，无需为已允许的补充方式重复询问。

## 如何判断需要补充

1. 先核对当前图商与目标 SDK/扩展版本是否支持所需数据和效果。Mapbox 已有 circle/cluster/heatmap/line/fill/fill-extrusion 等时使用对应原生能力；不能因为熟悉某库或想共用代码就全部外置渲染。
2. 缺口可以是该效果不存在、已退出，或已核实的接口/版本限制无法满足必要表现。资料尚未查清不等于不支持；继续核实。缺 Key、底图加载失败、网络错误不能靠第三方渲染解决。
3. 原生图层样式/数据更新可以组成动画；如仍不能满足目标，再选择适合的补充。优先保留用户选择的底图服务及数据语义，不静默换图商。
4. 若用户对某次任务额外要求“只能原生/禁止第三方”，遵守该任务限制；否则本 Skill 已允许能力不足时补充。全部路线不可行、或还缺影响结果的必要输入时，再明确说明缺项。

## 渲染来源必须准确

- provider-native：厂商 SDK 的原生图层或覆盖物，包括原生图层的属性动画组合。
- provider-official-extension：厂商发布/维护的可视化扩展，例如 Loca、MapVGL、腾讯 visualization。按本次版本与维护主体核实。
- third-party：deck.gl、ECharts 等外部库，即使被图商官方文档推荐也不会变成图商原生能力。
- custom：独立 Canvas/SVG/WebGL，或通过 CustomLayerInterface / WebGLOverlayView 等接口接入自定义渲染。SDK 接入接口不等于 SDK 实现了效果。

SDK 内部使用 Canvas/WebGL、图标/纹理作为图层资源均是正常实现；HTML/CSS 面板、图例和详情也无需标成自定义地图数据层。归属应追踪真正绘制业务数据的库与 API，不能只看 DOM 标签。

## 选型记录

每层记录 provider、rendererOwner、SDK/扩展/库版本、具体类或 type、图层 ID/实例、挂载/更新/拾取/清理 API、依据与验证状态；不记录 Key。补充层增加 fallbackReason（为什么原生/官方扩展不能满足）、能力缺口依据和显示限制。

例如 Google 连续热力可记录：Google JSAPI 旧 HeatmapLayer 已退出 → third-party 的 deck.gl HeatmapLayer + GoogleMapsOverlay（版本和集成核验后填写）。不能写成 Google 原生 HeatmapLayer 已恢复。

清洗、网格聚合、OD 几何预计算是数据准备。最终用 fill/Data 绘制仍是原生层；需准确称为网格统计，不能将其命名为连续热力。

## 运行验收与切图商

- 原生层核对 SDK/官方扩展真实实例、source/layer 类型及挂载调用；Mapbox getSource/getLayer/getStyle 可用于核查。配方中的 inspect() 只验证其原生层，不能当成所有补充实现的通用判据。
- 补充层核对实际库、已记录缺口、投影与 datum、容器 CSS 像素/DPR、相机/resize 同步、拾取与交互穿透、暂停与清理。二维屏幕 Canvas 不自动具备建筑/地形/球体遮挡；ECharts/deck.gl 的地图集成与版本兼容必须验证。
- 真实底图和数据层分别验收。注册成功或声明来源不等于真实地图可见，不能将空底图补画成已交付。
- 切到 B 时重新判断 B 的能力：支持所需效果则使用 B 原生层/官方扩展；B 也不支持时可以重用或重建经适配验证的补充层。保存业务 ID、指标域、筛选与地理范围，清理旧监听和渲染资源。不要将“补充层跨底图复用”描述为“两家原生数据层切换”。
- 模块测试、类型检查、来源标签与实际地图验收分别记录；不把某一项通过推广到全部图商。
