# HTML 的深色与浅色主题

主题是一套底图、面板、文字、数据层和图例的组合。用户指定的风格优先；未指定时生成工具沿用 dark。报告、分析和浅色文档可以选 light，无需为常规样式选择单独询问。

| 主题 | 视觉 | 适合场景 |
| --- | --- | --- |
| dark | 深色底图、深蓝面板、亮色数据、克制的光晕 | 大屏、演示、夜间阅读 |
| light | 简洁浅色底图、白色面板、深色文字和数据描边、较弱光晕 | 数据分析、报告截图、白天阅读 |

在 `build_visual_html.py` 的 spec 顶层配置，不放在 alternatives 内：

```json
{
  "title": "门店到访量",
  "description": "气泡面积比较各店到访规模。",
  "effect": "bubble",
  "unit": "人次",
  "theme": "light",
  "themeSwitcher": true
}
```

`theme` 为 dark/light；`themeSwitcher` 默认 true，页面显示深色/浅色按钮。固定风格的作品设为 false。切换不会搜索 Key 或更换图商；生成时即写入初始主题，避免白屏/黑屏闪烁。当前没有跟随系统或跨文件记忆主题的隐式行为。

## 当前 GL 实现

- MapLibre 使用 OpenFreeMap 的 Dark / Positron 样式；来源：[官方快速入门](https://openfreemap.org/quick_start/)。继续免 Key。
- Mapbox 使用 `mapbox://styles/mapbox/dark-v11` / `mapbox://styles/mapbox/light-v11`；保留授权 Token 和选定图商。参见 [官方样式](https://docs.mapbox.com/api/maps/styles/)。
- 页面使用 CSS 变量描述背景、面板、文本、边框、强调色；不以整个地图的 CSS 反色滤镜代替图商样式，不隐藏版权信息。
- 原生数据层默认配色随主题调整明度，类别域、数值域、阈值、气泡面积、聚合口径不变，图例同步更新。用户明确指定的 color/colors/missingColor 原样保留，通过描边改善辨识；若指定色本身难以辨认，应调整或解释配色选择。
- `assets/shared/gl-theme.mjs` 调用 SDK setStyle，等待底图与数据层就绪后提交主题。加载中暂时禁用风格、效果和筛选控件，避免请求交错；失败尝试恢复原风格，恢复失败说明底图暂不可用，不伪报成功。
- 显式配置影像或地形时，主题控制保留其[底图资源](basemaps.md)和署名；深浅调整作用于页面与数据颜色，不对影像使用反色滤镜，也不把影像自动替换为默认矢量背景。样式重载后由底图控制器恢复原生 raster/DEM 层。
- 保留地图视野、当前效果、筛选和已显示的实体详情；聚合的旧异步句柄不能跨底图重载复用，保留已显示文字并提示再次点击聚合，重新获取成员。

自定义页面可复用 `createThemeController(map, {styles, initial, applyTheme, isReady, onState})`。其中 applyTheme 调用当前原生配方的 `layer.setTheme(theme)`，isReady 检查 `layer.inspect().registered`，onState 更新页面主题/图例/状态；销毁页面时先 controller.destroy()。分发时保持 `assets/shared/gl-theme.mjs`、`assets/shared/color-scale.mjs` 与 `assets/recipes/gl-layers.mjs` 的相对目录关系，生成工具会将它们内嵌进 HTML。

## 其他图商与扩展

高德、百度、腾讯、Google 的底图风格应使用对应 SDK 的官方风格入口，先查该图商能力文档；不是把上述 GL style URL 传给其他 SDK。页面 CSS 主题可以复用。Loca/MapVGL 图层实现可传 `spec.theme` 选择默认配色；在线主题切换的底图重载、扩展重挂载和状态恢复仍由该作品实现，当前 GL 控制器不宣称通用于所有平台。

## 验收重点

分别验证深色、浅色首次打开以及 dark→light→dark；检查实际底图、对比度、图例、筛选计数、视野和详情是否正确；对主题切换失败和卸载验证恢复与清理。移动端确保主题按钮可操作，信息面板不占满地图。未使用真实 Token 验证的图商单独记录。
