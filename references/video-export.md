# 场景叙事视频输出

用户明确要求地图视频、MP4 或视频工程时使用。普通 HTML 地图无需 Node/Remotion 依赖。先按[场景镜头](scene-narrative.md)形成用户地点、路径、章节、相机和媒体的 `scene.json`；视频与 HTML 复用这份数据，业务几何不因镜头编排改变。

已有规范化 `story.json` 或 `itinerary.json` 可先运行 `prepare_scene.py story.json --out scene.json`。默认保留真实路径并只为缺路径的地点编排镜头；明确要求示意连接才加 `--schematic-links`。在输出场景中调整章节、`camera.followRoute`、图片和音频，再生成视频工程；完整转换示例见[从已有故事或行程生成场景](scene-narrative.md#从已有故事或行程生成场景)。

## 生成工程与导出

Python 3.10+ 可生成独立工程，默认不安装 npm 包、不下载浏览器、不开始渲染：

```bash
python3 "SKILL_DIR/scripts/build_scene_video.py" "WORK/scene.json" \
  --out-dir "WORK/video-project"
```

根据用户明确的图商与本任务授权配置可传 `--provider maplibre|mapbox|maptiler|cesium|static`、`--config FILE`、`--token-env NAME`。场景的 `theme`、`basemap` 和 `attribution` 随工程保存；静态图的 projection 和 Cesium 资源仍来自所选运行配置。已有目录不会覆盖，应选新目录。

实际预览和导出需要 Node.js 20+、网络、Chromium 与可用 WebGL。生成工程锁定 Remotion **4.0.534**、MapLibre **5.24.0**。在输出工程目录执行：

```bash
npm install
npm run studio
npm run render
```

默认输出 `out/story.mp4`，采用 H.264 / yuv420p；场景 `width`、`height` 必须都是偶数（例如 1920 × 1080），生成前会校验。也可在生成时明确执行安装和渲染：

```bash
python3 "SKILL_DIR/scripts/build_scene_video.py" "WORK/scene.json" \
  --out-dir "WORK/video-project" --install --render
```

已有 Chrome/Chromium 可用 `--browser-executable /absolute/path/to/browser` 指定；是否能使用 ANGLE/WebGL 取决于该执行环境，不能承诺所有服务器有 GPU。浏览器或依赖不可用时保留工程并报告实际缺项，不能宣称 MP4 已输出。[官方渲染入口](https://www.remotion.dev/docs/renderer/render-media)。

## 媒体与凭据

图片、旁白和背景音来自用户或已授权内容；本工具不调用 TTS、图片生成、Directions 或外部业务数据接口。

- 场景中本地图片/音频使用相对路径，必须位于 `scene.json` 同目录或明确的 `--media-root DIR` 内；生成器仅复制场景实际引用的文件到 `public/`。
- HTTPS 媒体保留远程 URL，导出时需要网络和可访问权限；实际画面/音频需验证。静态地图图片同样按引用复制或加载。
- 授权浏览器凭据写入本地工程 `src/runtime-config.json`，该文件已忽略；源工程分享前清除并用运行说明替代。不要把真实 Key、服务器 secret 写入 Skill、公开示例、日志或提交。
- 场景文本作为内容安全渲染；图片和音频不可用时根据实际诊断修复，不把字幕存在当作媒体已验收。

## 按帧同步

模板从当前 Remotion 帧和 FPS 算出秒数，调用 `SceneNarrativeViz.seek(frame/fps)`。相机、路线与地点高亮由同一采样状态确定，React 叠加章节文本、图片和已有音频。地图初始化及更新会暂停当前帧，等待资源/画面就绪后继续。真实时钟 `play()` 用于 HTML 预览；视频不依赖其 `requestAnimationFrame` 播放时间。

当前目标为 MapLibre、Mapbox、MapTiler、Cesium 和静态地图。高德、百度、腾讯、Google 的专用 Remotion 适配尚未封装；不能因有对应 HTML 能力文档就宣称可直接视频导出。资源加载与源登记、当前帧可截图、完整 MP4、真实图商验收分别记录。[Remotion 地图动画实现](https://www.remotion.dev/docs/maps)、[官方 MapLibre 示例](https://github.com/remotion-dev/maplibre-example)。

## 验收与交付

`video-manifest.json` 初始为 `pending-render`；成功产生非空 MP4 后为 `rendered-awaiting-visual-review`。还需查看实际视频的开头、中段、末尾、章节切点和音画同步，确认路线揭示、地点标签、影像/DEM、字幕图片与地图署名正确。代码测试、渲染退出码或文件存在不能单独替代视觉验收。

交付 MP4、源工程、场景数据和实际运行方式，明确未配置的资源或尚未渲染/验收的目标。地图服务要求的署名保留在视频画面中；本项目 MIT 许可不替代 Remotion、地图服务、影像、DEM、字体或媒体各自授权。普通交互地图仍按用户任务交付 HTML，视频仅在明确请求时生成。
