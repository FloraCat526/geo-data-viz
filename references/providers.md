# 跨地图接入与兼容性

文档核查日期：2026-09-13。依据供应商官方文档；适配代码尚未使用真实 Key 对全部底图逐家验收。以下共同方案属于基于文档的工程设计，不能据此标记六家已实测通过。

## 共用实现与切换约定

采用“原始数据及 CRS → 规范化业务要素/统一统计 → 目标地图坐标副本 → 当前图商原生数据层或官方可视化扩展”。共用数据、指标、图例和筛选状态；优先创建对应 SDK 数据层，确认图商不支持目标效果后允许接入适配该地图的补充渲染器。完整边界见 [渲染归属](provider-rendering.md)。

- 保存 sourceCrs，不能从数值猜测 WGS84/GCJ02/BD09；不得覆盖原坐标。Google 与腾讯 LatLng 构造器纬度在前，其余按各自契约传入。
- 按地理 bounds 恢复范围，各家 zoom 不直接等价。样式及俯仰按所选原生层支持情况配置，不能为了共用屏幕层一律锁死为零俯仰。
- 新 SDK 和对应数据层就绪后替换旧实例；先清理旧图层、事件与动画，再销毁地图。迟到 loader 或数据请求不得重新挂载旧图层。
- 单页 SDK 全局配置可能不能重绑定 Key；同厂商切配置按契约用重载/隔离 iframe。不能靠删除 script 假装 SDK 已卸载。
- 保留厂商版权、logo 与审图号；3D、地形、遮挡按实际图层能力验收，不声称六家相同。

## 浏览器 SDK 与原生接入

| 提供商 | 加载与数据层入口 | 坐标与清理 |
| --- | --- | --- |
| Google | Maps JS API / importLibrary；按需创建 Data、Polyline、AdvancedMarker；聚合加载官方维护的 markerclusterer | WGS84；按各类 setMap(null)、移除实例或事件句柄清理；无通用 Map.destroy |
| Mapbox | 固定版本且匹配的 JS/CSS，public accessToken、style；GeoJSON addSource → 原生 addLayer | WGS84；removeLayer → removeSource，解绑事件后 map.remove；Mapbox 配方直接使用这一流程 |
| 百度 | 按当前 JSAPI 4.0/兼容版本创建原生覆盖物，或加载与其兼容的 MapVGL | 国内与境外 datum 按官方契约；先清理 overlay/MapVGL，再销毁地图，不能混用两类接口 |
| 高德 | AMap JSAPI 2.0；按需加载 Loca 2.x，生成原生覆盖物或 Loca 图层；安全配置必须匹配 Key | GCJ02；先清理 Loca 和覆盖物再 map.destroy；海外 showOversea 与权限分别核验 |
| 腾讯 | TMap GL，使用 visualization 时按官方加载方式启用该扩展；创建 Dot/Heat/Arc 等具体图层 | GCJ02；数据层先清理，再解绑事件并 map.destroy |
| Maptec | 获准 SDK/CSS 和明确 dataCrs；创建公开 GeoJSONOverlay、HeatmapOverlay 等对应覆盖物 | 按部署契约传坐标；版本核实后用原生挂载/更新/清理 API，不依赖私有 project 自绘 |

各类参数和能力边界以对应能力文档及本次 SDK 为准。这是接入约定，不是六家全部效果的现成渲染器。

## 近期变更与坐标限制

- Google 官方弃用总表明确：`google.maps.visualization.HeatmapLayer` 于 2025-05 弃用、2026-05 起不可用。新 Skill 禁止生成此 API；官方推荐的 deck.gl 是可评估的第三方补充路线，需核验集成与版本并标明非原生；原生聚合/Data 网格统计也可按目标选择，但不能冒充连续热力。热力旧指南仍保留代码不代表 API 仍可用。[弃用总表](https://developers.google.com/maps/deprecations)
- 百度 4.0 默认命名空间为 `BMap`，`BMapGL` 为兼容入口；如复用 GL 代码，可在任何地图创建前设置 `BMapGL.apiVersion='gl'`，且运行期间不能修改。新代码应针对 4.0 测试。[升级指南](https://lbs.baidu.com/docs/jsapi?title=jsapi4/upgrade)
- 高德未提供任意坐标系转回 GPS 的官方接口。若输入是 GCJ02/BD09，要显示在 WGS84 地图上，不能声称“无损官方转换”。可保留原坐标并提示转换方法与精度边界；优先使用用户提供或授权的 WGS84 源。[转换说明](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)、[官方常见问题](https://lbs.amap.com/faq/search?s=%E9%AB%98%E5%BE%B7%E5%9D%90%E6%A0%87%E8%BD%AC%E6%8D%A2)
- 百度全球数据不要无条件 WGS84→GCJ02→BD09。其当前文档明确非中国地区使用 WGS84；矩形判断是否在中国只是一种近似，不能称为精确国家边界判断。[百度坐标约定](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/concept/coord)

## 按平台查可视化能力

具体效果、类/图层、输入要求、依赖与限制已独立维护，避免在本文件重复一份会漂移的简表：

- [能力总表](capabilities/index.md) 与 [数据匹配规则](selection.md)。
- [Google](capabilities/google.md)、[Mapbox](capabilities/mapbox.md)、[Maptec](capabilities/maptec.md)。
- [百度](capabilities/baidu.md)、[高德](capabilities/amap.md)、[腾讯](capabilities/tencent.md)。

本文件只负责共同坐标、加载和生命周期。历史 assets/adapters/providers.mjs 为旧二维投影接口保留，不是新作品的可视化入口；优先使用各家公开数据图层或官方扩展，能力不足时按渲染归属要求接入补充层。

## 来源与实现检查入口

- Google：[加载](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)、[OverlayView 与 projection](https://developers.google.com/maps/documentation/javascript/reference/overlay-view)、[坐标标准](https://developers.google.com/maps/documentation/javascript/coordinates)。
- Mapbox：[Map API](https://docs.mapbox.com/mapbox-gl-js/api/map/)、[坐标类型](https://docs.mapbox.com/mapbox-gl-js/api/geography/)、[归属标识](https://docs.mapbox.com/help/dive-deeper/attribution/)。默认保留 Mapbox logo 与文字归属，不能隐藏后换自写小字。
- 百度：[4.0 Map API](https://lbs.baidu.com/jsapi/refdoc/v4/classes/BMap.Map.html)、[4.0 展示地图](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/map/show)、[4.0 loader](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/concepts/load)。当前参考已核实 `pointToPixel`、`destroy`、`setViewport`、`moving/zooming/zoomend/resize` 和事件解绑。兼容模式的官方顺序是加载 4.0 → `BMapGL.apiVersion='gl'` → 创建地图；`setMapStyleV2` 已不在 4.0 参考列出，升级指南说明旧版接口继续兼容，仍应进行方法检测。4.0 loader 文档还提供 `@baidumap/jsapi-loader` 的 `load({ak,version:'4.0'})`，resolve 默认 BMap；异步 script 示例含遗留 GL URL，应以同页“与同步地址一致、额外 callback”的说明和升级指南为准。
- 高德：[loader](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)、[安全配置](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)、[2.0 类参考](https://a.amap.com/jsapi/static/doc/index.html)、[基础坐标](https://lbs.amap.com/api/javascript-api-v2/guide/abc/basetype)。
- 腾讯：[Map 正确路径](https://lbs.qq.com/webApi/javascriptGL/glDoc/docIndexMap)、[基础入门](https://lbs.qq.com/webApi/javascriptGL/glGuide/glBasic)、[基础类](https://lbs.qq.com/webApi/javascriptGL/glDoc/glDocClass)。因网页正文动态加载，本次通过其官方公开 `api/site/category/infoByMap` → `api/site/article/list` → `api/site/article/content` 读取上述页面正文，仅提取需要的 API 说明。

所有厂商默认保留 SDK 生成的 logo、版权/审图信息；共用面板应给这些元素留空间。浏览器 key 不是服务端 secret；配置需要对应浏览器平台、域名限制、开通状态和用户可用额度。不要从仓库、历史记录或其他项目搜 key；不要把用户 key 写进技能包、提交、日志或演示数据。实际验收应逐家记录“未配置 / 加载失败 / SDK 已加载 / 底图可见 / 交互已验证”，不能仅靠构造器成功标记通过。

## Maptec 版本核查笔记

参考的 BubbleChart 使用 GeoJSONOverlay 圆样式；BreathingPoints 使用 CircleOverlay 的稳定核心和动态外圈，样式字段为 strokeWidth。可选适配模块兼容 center/zoom 属性与 getCenter/getZoom 方法。map.project 在参考版本中源码标为私有，新作品优先采用公开原生覆盖物；补充渲染也应使用有文档依据的公开投影接口，不依赖该私有方法。接口存在性检测不能替代稳定公共 API 保证。

SDK/CSS 地址、style 与 dataCrs 由部署环境决定，项目不内置私有环境地址、浏览器 Key 或供应商 SDK 源文件。
