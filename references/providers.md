# 跨地图接入与兼容性

文档核查日期：2026-09-13。依据供应商官方文档；适配代码尚未使用真实 Key 对全部底图逐家验收。以下共同方案属于基于文档的工程设计，不能据此标记六家已实测通过。

## 共用实现与切换约定

采用“原始数据及 CRS → 规范化业务要素 → 目标地图坐标副本 → SDK 容器投影 → 共用 Canvas 渲染器”。采用共同屏幕投影时可从平面 2D、零俯仰实现开始：气泡、呼吸点、闪烁、光晕、二维流线可以共用相同视觉映射。同一份原数据不可被坐标转换覆盖；切换后保留字段映射、筛选、选中项、图例范围、动画开关。

- 默认的基准数据约定为 `[longitude, latitude]`，但必须保存 `sourceCrs`，不能根据数值范围猜测 WGS84/GCJ02/BD09。经纬度顺序与坐标系是两个问题。
- Google 与腾讯的构造器是 `LatLng(latitude, longitude)`；Mapbox、百度、高德以经度在前。适配器边界统一转换。
- `project()` 统一返回**地图外层容器左上角为原点的 CSS 像素**；Canvas backing store 使用 DPR 放大，逻辑绘制仍使用 CSS 像素。不要混用覆盖物 pane 像素和容器像素。
- 各家 zoom 数值不代表相同地面分辨率。优先保存规范化地理 bounds 并在新 SDK `fitBounds`/同义方法中恢复；直接复制 zoom 只能作为近似。
- 新实例验证加载后再替换旧实例；卸载旧实例时停止其 RAF/定时器、解绑事件与 ResizeObserver、销毁自建图层，再按 SDK 生命周期销毁地图；防止旧异步 loader 在新切换后重新挂图。全局 SDK 单页只加载一次；同厂商更换 key 或全局配置应重载页面或使用隔离 iframe，不能靠删除 script 假装 SDK 已卸载。
- 透明 Canvas 不能覆盖 SDK logo、版权、审图号与控件；交互穿透或使用明确的拾取处理。绘制需防止世界重复、跨日界线的长线，以及越出视口的几何。
- 本基线是屏幕上的二维效果，不具有建筑遮挡、地形贴合、真实三维高度或球体遮挡。原生增强必须按能力检测启用，不能把所有 SDK 都标成同等 3D 能力。

## 浏览器 SDK 与核心接口

| 提供商 | 官方加载约定及额外参数 | 坐标与容器投影 | 生命周期与事件 |
|---|---|---|---|
| Google Maps JS | `https://maps.googleapis.com/maps/api/js?key=…&loading=async&callback=…`；也支持 `importLibrary`；普通 2D Canvas 无需 map ID。`@googlemaps/js-api-loader` v2 用 `setOptions`/`importLibrary`，勿复制旧 `new Loader` 用法 | WGS84；创建 `OverlayView` 后在 `draw`/投影准备完成时取 `getProjection().fromLatLngToContainerPixel(new google.maps.LatLng(lat,lng))` | `OverlayView.setMap(null)` 调用 `onRemove`；移除监听句柄/`google.maps.event.clearInstanceListeners`、自建对象和 DOM。无公开 `Map.destroy()`，不可猜造。 |
| Mapbox GL JS | npm 或匹配版本的 JS+CSS CDN；使用用户浏览器 public access token，配置 `accessToken` 与 style URL；实现应锁定经核验版本，勿用无版本 latest | WGS84；`map.project([lng,lat])` 返回容器像素；共用基线明确 `projection:'mercator'`、pitch/bearing 为 0 | `on`/`off`；`move`、`resize` 等触发重绘；`map.remove()` 释放 DOM、事件、WebGL 资源。 |
| 百度 | **新项目推荐 JSAPI 4.0**：`https://api.map.baidu.com/api?v=4.0&ak=…&callback=…`。默认 `BMap`，兼容 `BMapGL`；历史 GL 为 `v=1.0&type=webgl`，已被官方标记为历史版本 | 国内默认 BD09；官方 4.0 文档指出非中国地区 WGS84。`pointToPixel(Point)` 为容器像素；`pointToOverlayPixel` 是 pane 坐标，外层 Canvas 不使用后者 | `addEventListener`/`removeEventListener`；`moving`、`zoomend`、`resize`；`destroy()`。4.0 新推荐 `setMapStyle`、`addLayer`/`removeLayer`；勿把 `setMapStyleV2` 当最新接口。 |
| 高德 AMap JS 2.0 | 推荐在线 `AMapLoader.load({key,version:'2.0'})`；SDK 只能在线加载。海外地图需额外获得世界地图能力，并显式设置 `showOversea:true`。2021-12-02 后申请的 key 需安全密钥，加载前设 `_AMapSecurityConfig`；`serviceHost` 代理用于避免前端暴露安全密钥，开发可按官方配置 `securityJsCode` | GCJ02；`map.lngLatToContainer(new AMap.LngLat(lng,lat))`；`AMap.convertFrom` 可将 gps/baidu/mapbar 转为高德坐标（单次最多 40 对） | `on`/`off`；`mapmove`、`zoomchange`、`resize`；`map.destroy()`；附加 Loca 也要先清理。 |
| 腾讯 TMap GL | `https://map.qq.com/api/gljs?v=1.exp&key=…&callback=…`；动态加载使用 callback，同步 script 不加；`libraries=visualization` 为可选可视化附加库，基线 Canvas 不依赖它 | GCJ02；`map.projectToContainer(new TMap.LatLng(lat,lng))` → `Point`，官方明确原点是容器左上角。`Point.getX/getY` 是公开读取方式 | `on`/`off`；`bounds_changed`、`zoom`、`resize`、`idle`；`map.destroy()`。`DOMOverlay` 使用 `onInit/createDOM/updateDOM/onDestroy`，`destroy()` 调用资源释放钩子。 |
| Maptec | 用户/项目确认的 SDK 与配套 CSS；设置 `Maptec.apiKey` 后 `new Maptec.Map({container,style,center,zoom,pitch:0,bearing:0})`；默认示例用 dark，但正式环境需核实 | 坐标传 `[lng,lat]`；本次参考 Demo 使用 `map.project`；底图 datum 由实际环境声明，不从类名推测 | `load` 后绘制、`on/off`；销毁按实际版本 `destroy/remove` 检测；不混用其他 SDK 内部接口 |

## 近期变更与坐标限制

- Google 官方弃用总表明确：`google.maps.visualization.HeatmapLayer` 于 2025-05 弃用、2026-05 起不可用。新 Skill 禁止生成此 API；热力使用自己的 Canvas 实现或受支持的第三方集成（官方建议 deck.gl）。热力旧指南仍保留代码不代表 API 仍可用。[弃用总表](https://developers.google.com/maps/deprecations)
- 百度 4.0 默认命名空间为 `BMap`，`BMapGL` 为兼容入口；如复用 GL 代码，可在任何地图创建前设置 `BMapGL.apiVersion='gl'`，且运行期间不能修改。新代码应针对 4.0 测试。[升级指南](https://lbs.baidu.com/docs/jsapi?title=jsapi4/upgrade)
- 高德未提供任意坐标系转回 GPS 的官方接口。若输入是 GCJ02/BD09，要显示在 WGS84 地图上，不能声称“无损官方转换”。可保留原坐标并提示转换方法与精度边界；优先使用用户提供或授权的 WGS84 源。[转换说明](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)、[官方常见问题](https://lbs.amap.com/faq/search?s=%E9%AB%98%E5%BE%B7%E5%9D%90%E6%A0%87%E8%BD%AC%E6%8D%A2)
- 百度全球数据不要无条件 WGS84→GCJ02→BD09。其当前文档明确非中国地区使用 WGS84；矩形判断是否在中国只是一种近似，不能称为精确国家边界判断。[百度坐标约定](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/concept/coord)

## 按平台查可视化能力

具体效果、类/图层、输入要求、依赖与限制已独立维护，避免在本文件重复一份会漂移的简表：

- [能力总表](capabilities/index.md) 与 [数据匹配规则](selection.md)。
- [Google](capabilities/google.md)、[Mapbox](capabilities/mapbox.md)、[Maptec](capabilities/maptec.md)。
- [百度](capabilities/baidu.md)、[高德](capabilities/amap.md)、[腾讯](capabilities/tencent.md)。

本文件只负责共同坐标、加载和生命周期；上面的 Canvas 路线是可选二维基线。不要据此强制高级图层降成 Canvas，也不要将官方扩展或第三方库称为原生内置。

## 来源与实现检查入口

- Google：[加载](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)、[OverlayView 与 projection](https://developers.google.com/maps/documentation/javascript/reference/overlay-view)、[坐标标准](https://developers.google.com/maps/documentation/javascript/coordinates)。
- Mapbox：[Map API](https://docs.mapbox.com/mapbox-gl-js/api/map/)、[坐标类型](https://docs.mapbox.com/mapbox-gl-js/api/geography/)、[归属标识](https://docs.mapbox.com/help/dive-deeper/attribution/)。默认保留 Mapbox logo 与文字归属，不能隐藏后换自写小字。
- 百度：[4.0 Map API](https://lbs.baidu.com/jsapi/refdoc/v4/classes/BMap.Map.html)、[4.0 展示地图](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/map/show)、[4.0 loader](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/concepts/load)。当前参考已核实 `pointToPixel`、`destroy`、`setViewport`、`moving/zooming/zoomend/resize` 和事件解绑。兼容模式的官方顺序是加载 4.0 → `BMapGL.apiVersion='gl'` → 创建地图；`setMapStyleV2` 已不在 4.0 参考列出，升级指南说明旧版接口继续兼容，仍应进行方法检测。4.0 loader 文档还提供 `@baidumap/jsapi-loader` 的 `load({ak,version:'4.0'})`，resolve 默认 BMap；异步 script 示例含遗留 GL URL，应以同页“与同步地址一致、额外 callback”的说明和升级指南为准。
- 高德：[loader](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)、[安全配置](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)、[2.0 类参考](https://a.amap.com/jsapi/static/doc/index.html)、[基础坐标](https://lbs.amap.com/api/javascript-api-v2/guide/abc/basetype)。
- 腾讯：[Map 正确路径](https://lbs.qq.com/webApi/javascriptGL/glDoc/docIndexMap)、[基础入门](https://lbs.qq.com/webApi/javascriptGL/glGuide/glBasic)、[基础类](https://lbs.qq.com/webApi/javascriptGL/glDoc/glDocClass)。因网页正文动态加载，本次通过其官方公开 `api/site/category/infoByMap` → `api/site/article/list` → `api/site/article/content` 读取上述页面正文，仅提取需要的 API 说明。

所有厂商默认保留 SDK 生成的 logo、版权/审图信息；共用面板与 Canvas 应给这些元素留空间。浏览器 key 不是服务端 secret；配置需要对应浏览器平台、域名限制、开通状态和用户可用额度。不要从仓库、历史记录或其他项目搜 key；不要把用户 key 写进技能包、提交、日志或演示数据。实际验收应逐家记录“未配置 / 加载失败 / SDK 已加载 / 底图可见 / 交互已验证”，不能仅靠构造器成功标记通过。

## Maptec 版本核查笔记

参考的 BubbleChart 使用 GeoJSONOverlay 圆样式；BreathingPoints 使用 CircleOverlay 的稳定核心和动态外圈，样式字段为 strokeWidth。可选适配模块兼容 center/zoom 属性与 getCenter/getZoom 方法。map.project 在参考版本中可用但源码标为私有，因此接入时优先核实公开原生覆盖物；若使用屏幕投影，必须随 SDK 升级回归验证。接口存在性检测不能替代稳定公共 API 保证。

SDK/CSS 地址、style 与 dataCrs 由部署环境决定，项目不内置私有环境地址、浏览器 Key 或供应商 SDK 源文件。
