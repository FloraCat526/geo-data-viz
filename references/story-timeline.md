# 故事讲述组件：StoryTimelineLayer

用于历史叙述、人物行程、事件发展等**按已知顺序讲述地点**的任务。它与旅游规划组件分开：旅游组件按日期选择当天站点；故事组件通过播放、暂停、拖动时间轴与章节跳转，让地图轨迹逐段展开。

## 输入与语义

最少需要已核实 WGS84 坐标、稳定 ID、事件标题和明确顺序。日期、章节名、简介及结构化详情可选。若有可信的相邻事件路径，提供 `routeFromPrevious` 的 LineString，首尾必须与两事件坐标一致；否则组件只用虚线连接事件地点。虚线是**叙事顺序**，不是道路、航线或历史行军路线。动画按章节均匀展开，不表示实际行进时刻、速度或路径上任意时刻的位置。真实时间轨迹回放仍是另一类任务。

```json
{
  "title": "出征记",
  "metadata": {"dataCrs": "wgs84"},
  "events": [
    {"id": "start", "title": "启程", "date": "2026-01-01", "coordinates": [103.8, 1.3], "summary": "第一章"},
    {"id": "arrival", "title": "抵达", "date": "2026-01-03", "coordinates": [101.7, 2.7],
     "routeFromPrevious": {"type": "LineString", "coordinates": [[103.8, 1.3], [102.5, 2], [101.7, 2.7]]}}
  ]
}
```

上例坐标和故事内容仅用于说明结构。实际任务不能凭地名补坐标或编造日期。原始 CSV/TSV、JSON 记录数组或 Point GeoJSON 可先转换：

```sh
python3 SKILL_DIR/scripts/prepare_story.py WORK/events.csv --crs wgs84 \
  --order-field sequence --title-field place --out WORK/story.json
python3 SKILL_DIR/scripts/build_story_html.py WORK/story.json --out WORK/story.html
```

默认列名 `order,id,title,longitude,latitude,date,chapter,summary`，每条记录一个事件；`order` 必须是唯一整数。其他列可通过对应 `--*-field` 显式绑定。转换器只处理点，不推断路线；真实 LineString 可在规范化 JSON 中逐段补入并校验端点。`--crs wgs84` 是来源核实后的声明，脚本不会转换坐标。发布日期或史料仅在来源明确时填写到日期与叙述中。

## 地图和交互

`assets/components/story-timeline.mjs` 的 `StoryTimelineLayer` 使用 MapLibre 原生 `line`、`circle`、`symbol` 图层。`setProgress(0..1)` 展开已提供路线或示意连接；`seekEvent(index)` 跳章；`play({duration})`、`pause()` 控制动画；`fit()` 调整视野；`inspect()` 给出真实/示意路段数量；`destroy()` 清理事件、图层和数据源。页面播放从当前进度继续，到末尾后重新播放；切换后台自动暂停。地图上的点和地点名称可点击跳章。

`build_story_html.py` 生成内嵌数据和组件代码的独立 HTML，默认使用 MapLibre + OpenFreeMap 浅色底图，联网加载 SDK、字体和瓦片。示例见 `examples/maps/story-timeline.html`。用户指定其他图商时沿用同一故事数据契约，但应使用该图商原生线、点、标签与事件能力实现并验收，不实例化 MapLibre 组件。地图版权控件仍保留并收起为右下角信息按钮。

用户需要地貌背景时可加 `--basemap WORK/basemap.json`，按[底图](basemaps.md)加载授权影像或 DEM。需要不同镜头、照片、旁白或 MP4 时，将事件、已提供路径和叙述编排为[场景镜头](scene-narrative.md)的 `scene.json`；镜头时长与历史日期分别表达。视频使用[Remotion 入口](video-export.md)，不依赖故事组件实时 `play()` 的时钟来采帧。

生成后检查首章、末章、播放/暂停、拖动、点击地图标签、日期显示、真实/示意线型、窄屏和浏览器缩放。数据没有路径时页面必须说明“示意连接”；日期缺失时只展示章序，不能凭播放时钟给它补上历史时间。
