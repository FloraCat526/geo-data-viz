# MapTiler：场景叙事地图目标

核查日期：2026-10-08。本项目将 MapTiler 放在[场景叙事](../scene-narrative.md)的 SDK 目标中，使用其真实地图实例与已授权 Key。它基于 MapLibre，但不是把 `provider:'maptiler'` 传给只声明 MapLibre/Mapbox 的统一平面组件就能自动获得兼容性。

| 能力 | 实现依据 | 使用条件与边界 |
| --- | --- | --- |
| 地图与相机 | `new maptilersdk.Map`，按时间更新中心、zoom、pitch、bearing | 图商 Key 与样式在本任务已授权，SDK 与资源仍需联网。 |
| 影像背景 | 官方 `MapStyle.SATELLITE` / `HYBRID`，或明确授权的样式 URL | 用作地理上下文，不当成实时影像或补充用户业务事实。[卫星地图](https://docs.maptiler.com/sdk-js/examples/satellite-map/) |
| 地形背景 | 官方 `terrain:true`、`terrainExaggeration`，或 `enableTerrain()` | 需要实际高程资源；夸张比例是视觉设置，不改变用户指标。[3D 地形](https://docs.maptiler.com/sdk-js/examples/3d-map/)、[地形开关](https://docs.maptiler.com/sdk-js/examples/map-terrain/) |
| 用户路线、点与标签 | SDK GeoJSON source 与 line/circle/symbol 样式层 | 几何全部来自用户；按帧更新 source 和相机，不请求 Directions。 |
| 视频叙事 | 本项目 `SceneNarrativeViz` 与可选 Remotion 工程 | 等待地图资源后逐帧采样；真实 Key 画面和 MP4 输出另验收。 |

凭据放 `--config FILE` 或明确授权的 `--token-env NAME`，不写入场景数据、Skill、提交或截图日志。分享 HTML/源工程前移除 Key；保留 MapTiler 及数据资源要求的地图署名。

没有 Key 或资源权限时，不声称 MapTiler 场景已通过真实地图验收。官方能力可用与本任务场景实现、运行资源、导出结果是分别记录的证据。MapTiler 专属 API/样式以[当前官方参考](https://docs.maptiler.com/sdk-js/api/)为准。
