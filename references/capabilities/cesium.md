# CesiumJS：三维场景叙事目标

核查日期：2026-10-08。需要地形飞越、地球到地区的镜头或三维城市讲解时使用。Cesium 在本项目归属**场景叙事组件**的镜头目标；球面飞线、全球设色与指标柱仍使用[地球模式组件](../globe-effects.md)。

| 能力 | 引擎入口 | 必需资源与语义 |
| --- | --- | --- |
| 镜头与地理实体 | `Cesium.Viewer`、`camera.setView`、Entities | 已核实 WGS84 地点与路线；相机 `height` 为米制取景高度，不是业务高度或观测结果。 |
| 影像 | 明确配置的 imagery provider | 影像来源、覆盖与署名已确认；Cesium 引擎本身不等于免费全球高分影像。 |
| 地形 | 真实 terrain provider，如已授权 Cesium ion 资源或用户托管服务 | 地形数据格式、URL/asset 与凭据可用；无 DEM 时仅椭球面，不能称真实地形。 |
| 三维城市或模型 | 明确的 3D Tiles URL/ion asset | 用户已提供或授权资源；不自动查找城市三维模型或补建建筑。 |
| 路线揭示与地点讲解 | 按章节采样，更新 Entity 几何与相机 | 原始路线可复用；缺路径时保留示意属性，不用相机轨迹冒充实际路线。 |
| Remotion 逐帧渲染 | 场景 `seek(seconds)` → 请求绘制 → 等待引擎完成当前画面 | 节点采样和浏览器渲染均需验证；持续加载的远景瓦片需合理确定超时和清晰度。 |

Cesium ion 资源需要对应授权 Token；当前 `terrain:{world:true}` 使用已授权 `ionToken` 加载 World Terrain。自托管资源使用 `imagery:{url,attribution}`、`terrain:{url,attribution}`、`tiles3d:{url}`，地形 URL 要符合 CesiumTerrainProvider 格式，不是 MapLibre raster-dem TileJSON。当前未封装任意 ion asset ID 的通用转换。凭据使用运行配置，资源信用标识由 Viewer 保留。输入高程、相机高度、地形高程采用的垂直基准可能不同，不能未经核实混用。

准确运行配置与命令见[场景镜头](../scene-narrative.md)及其当前生成器。不同 SDK、投影、资源、Key 与网络条件分别验收；代码通过不意味着真实山地/城市或 MP4 已运行。官方依据：[Quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/)、[Camera API](https://cesium.com/learn/cesiumjs/ref-doc/Camera.html)、[3D Tiles 入门](https://cesium.com/learn/cesiumjs-learn/cesiumjs-3d-tiles/)。
