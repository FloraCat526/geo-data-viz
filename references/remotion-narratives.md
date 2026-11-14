# 原生 Remotion 地图叙事

用于电影感地图短片、真实时间轨迹、事件回放，以及需要动态指标、图表、字幕、音轨或转场的影片。交互式旅游/历史时间轴仍用 HTML；已有 `scene.json` 可继续走 [scene 视频导出](video-export.md)。不要为普通点位地图安装视频依赖。

## 职责与选择

Remotion 负责帧时间、React 编排、媒体和视频渲染；MapLibre 等引擎负责底图、投影、GeoJSON 与相机。直接使用 `Composition`、`useCurrentFrame`、`interpolate`、`spring`、`Sequence`，无需另造视频时间轴或把全部故事都转换为 scene schema。[官方地图教程](https://www.remotion.dev/docs/maps)

本 Skill 自带 `assets/remotion/`，是可编辑起点，不是最终创作的限制：

| 起点 | 输入与实际行为 |
| --- | --- |
| `overview` | 非空 GeoJSON FeatureCollection，完整展示原始点/线/面，自动取初始视野。颜色和大小默认不绑定业务指标。 |
| `track` | 单一移动对象的 Point 观测序列＋显式时间字段，按时间排序；仅位置插值，指标取最近且不晚于当前时间的原始记录。 |
| `events` | Point 事件＋显式时间字段，当前时间之前的事件才出现，累计数不包含未来记录。 |

多个对象的轨迹、复杂领域指标、分组统计、3D 地形或其他图商应在 Composition 中按实际数据适配；不假称起步模板已经封装。模板当前只创建 MapLibre。用户明确指定 Mapbox/MapTiler/Cesium 等时，使用已有 scene 目标或按其官方 SDK 编写 Composition，不能悄悄换图商。

## 从源数据到工程

将数据转为已核实 WGS84 GeoJSON，保留原始 properties、时间、单位和稳定 ID；不以“统一 schema”为由丢弃风速、震级、分类、预测模型等信息。时间模式需要 Point；第三维可保留在原数据，平面轨迹取前两维。输入须有 `metadata.dataCrs:"wgs84"`，或来源核实后显式传 `--data-crs wgs84`。

```bash
python3 "SKILL_DIR/scripts/create_remotion_project.py" "WORK/observations.geojson" \
  --out-dir "WORK/movie" --mode track --time-field observed_at --time-format iso8601 \
  --value-field wind_kt --value-label "最大持续风速 / kt" \
  --title "风暴的一生" --attribution "实际数据发布者与数据集"
```

字段名必须按实际输入选择。`--mode events --time-field timestamp --time-format number --time-label "UTC epoch 毫秒"` 可保留数字时间；NASA 等 UT 秒刻度保持数字并明确标签，不转成 UTC。`iso8601` 要求源值包含 Z/时区偏移，支持至毫秒精度，显示为 UTC；无时区文本会拒绝。不得把行号或等距离进度伪装成观测时间。

生成的 `src/project-config.json` 中，`timeDomain` 默认取首末实际观测时刻，并不等于查询窗口。故事需要完整的“72 小时”等区间时，按源口径设置包含这些记录的起止时间；ISO 模式使用 UTC epoch 毫秒，数字模式沿用源刻度。数字时间的日历或时分秒排版在 Composition 中显式完成，不从数值大小猜单位。

默认底图为 OpenFreeMap。已有获授权的区域 GeoJSON 背景可离线渲染：

```bash
python3 "SKILL_DIR/scripts/create_remotion_project.py" "WORK/events.geojson" \
  --out-dir "WORK/movie" --mode events --time-field timestamp --time-format number \
  --time-label "UTC epoch 毫秒" --data-crs wgs84 \
  --background "WORK/countries.geojson" --background-attribution "实际底图来源" \
  --title "事件的时间与空间"
```

`--background` 也须核实为 WGS84，`--data-crs` 对两个输入同时声明。原始 GeoJSON 的属性、顺序和精度保留在 `src/data.json`；Composition 在副本上排序。`--duration`、`--fps`、`--width`、`--height` 只控制影片，默认 24 秒、30fps、1280×720。H.264 宽高须为偶数。跨日期线的单一 track 起点会拒绝，需保留原点并在 Composition 中分段，不能静默裁掉一段。

当前模板的数据纬度范围为 ±85°；背景可含 ±90° 的极地区域边界，由 Web Mercator 裁切显示。极地业务数据应另选适当投影或球面 Composition。

已有目录不会覆盖。工程生成器不自动安装或渲染；但影片任务中 Agent 应继续编辑、安装和导出，而不是到这里就交付：

```bash
cd "WORK/movie"
npm install
npm run browser
npm run studio
npm run still -- --frame=180
npm run render
```

也可在生成时加 `--install --render`，用于模板基线或验证；实际成片仍需按用户故事调整。已有浏览器可通过 `--browser-executable` 传给生成器，或经 npm 命令传给 Remotion。完整输出与凭据/媒体原则见[视频导出](video-export.md)。

## 原生编排与共享能力

- `src/Composition.jsx`：故事的创作入口。数据时间在顶层用全局 frame 计算，再传给地图与指标。`Sequence` 内的 frame 是相对帧，适合字幕/章节入场，不能让业务时间随章节重置。[Sequence](https://www.remotion.dev/docs/sequence)
- `src/timing.mjs`：`dataTimeAtFrame` 映射影片帧到源数值时间；`sampleTimedTrack(records,time,{timeOf,coordinateOf})` 返回 `observed/index/point/coordinates/progress/segmentProgress`；`eventsThroughTime(records,time,{timeOf})` 返回截至当前时刻的原事件。访问器必须显式绑定。首记录之前没有 observed，不提前借用未来指标；同时间事件全部保留。这里只做时间采样，不代替领域统计。
- `src/MapStage.jsx`：`style`、`layers`、source ID 集合是创建时配置，更换它们用 React key 重挂载；`camera`、`sources`（id → GeoJSON）和 `project`（id → 经纬度）可逐帧变化。render-prop 返回 `{frame,points,ready}`，地理 SVG 标注只在 ready 时显示。相机最好每帧给完整 pose，保证乱序 seek 不依赖前一帧。

`MapStage` 使用明确视频尺寸初始化 WebGL，关闭符号淡入、paint transitions 和 raster fade。更新相机/数据后等待地图完整绘制，`flushSync` 提交投影位置，最后释放当前帧。避免用任意一次 render 事件、setData 返回或固定 sleep 作为完成信号。

导出使用 `useDelayRender`；Studio/Player 使用 `useBufferState().delayPlayback()` 并在就绪后 `unblock()`。**导出等待不是网页播放缓冲**。预览卸载清理地图，导出页面保留捕获所需 WebGL 生命周期。[缓冲机制](https://www.remotion.dev/docs/player/buffer-state)、[useDelayRender](https://www.remotion.dev/docs/use-delay-render)

需要网页中实时编辑/播放时，可复用同一 Composition 接入 [Remotion Player](https://www.remotion.dev/docs/player)，显式添加与 remotion 相同版本的 `@remotion/player`；本模板提供 Studio，未自带网页 Player 外壳。需要转场时可安装同版本 `@remotion/transitions`，使用 [TransitionSeries](https://www.remotion.dev/docs/transitions/transitionseries)，计算重叠帧对总时长的影响。优先让文字/画面叠层转场复用同一地图，避免不必要地同时运行多个 WebGL 实例。

当前固定 Remotion 4.0.534、MapLibre 5.24.0。参考[官方 Remotion Skills](https://www.remotion.dev/docs/ai/skills)和[地图 Skill](https://github.com/remotion-dev/skills/blob/main/skills/remotion-maps/SKILL.md)时核对版本；不把最新示例 API 直接套到旧依赖。本 Skill 自带完成上述流程的资源，不要求额外安装另一套 Skill。

## 创作与验收

在 `viz-plan.json` 或等价记录中明确：交付形式、源时间标度/筛选范围、指标/单位、镜头与业务时间的映射、底图来源、插值规则及待验证项。选择适合故事的视觉节奏，不强制每部影片同样章节数量或时长。

先做一段能说明数据变化的镜头，再完成整体编排。图例、计数与当前过滤状态一致；未发生事件不进入当前统计；光圈、粒子、日冕等装饰不能暗示不存在的受灾范围、流量或精确阴影。

检查首帧/中段/尾帧与章节切点，至少一次倒退 seek、一次实际短片导出；检查地图与 SVG/文字是否同帧、图例/署名是否可读、音画是否同步。数据单测、Studio 预览、完整 MP4、视觉检查分别记录。共享工程前处理用户数据、字体、媒体和图商凭据；无需为普通影片自动增加配音或外部服务。
