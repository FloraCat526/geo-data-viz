# 按数据生成地图作品

这个 Skill 可以单独安装运行。仓库的 `demo/` 是可选演示平台，展示核心能力和数据效果，不是 Skill 的运行依赖。Agent 每次根据附件、用户问题和所选平台生成适合该数据的作品；代码辅助资源用于降低接入错误，不规定 UI。

## 一次任务的实现顺序

1. 读取 profile.json，确认有效/无效记录、源 CRS、绑定指标与几何类型。
2. 按 [数据匹配规则](selection.md) 与 [所选平台的能力文档](capabilities/index.md) 形成选型说明。定义本次 visualSpec：指标字段、单位、颜色/面积/宽度映射、阈值、动画含义、筛选与图例。跨平台共用同一 spec，过滤时不偷偷重算色阶。
3. 按选型说明的具体 API/扩展与版本实现。每家可以使用不同底层图层，保持业务映射一致；能力清单是生成依据，不是已内置的运行时图层注册表。只有二维共同效果才直接复用下方 Canvas 适配路线。
4. 生成的页面直接读取该数据与已授权的运行配置。若用户选择多个地图，加入简洁的切换控件；单平台作品不必出现六家按钮、Key 管理后台或再次上传入口。
5. 按数据范围设置相机，加载成功后绘制，保存同一份业务状态。连接失败给出具体可处理的信息。验证实际结果后交付。

## 可选的接入辅助代码

`assets/adapters/providers.mjs` 提供六家 SDK 的按需加载、Key 绑定、生命周期及屏幕投影封装；`coords.mjs` 提供显示级近似坐标转换。仅在这些接口和目标版本确实合适时复制到产物，不必使用，也不包含网页、样例数据、上传器、Key 表单或效果渲染器。

```js
import { createProvider, getProviderCrs } from './adapters/providers.mjs';
import { transformCoordinate } from './adapters/coords.mjs';

const targetCrs = getProviderCrs(providerName, runtimeConfig);
const adapter = await createProvider(providerName, mapElement, runtimeConfig, {
  center: transformCoordinate(sourceCenter, sourceCrs, targetCrs),
  zoom: initialZoom
});
// screenPoint 可用于适合本次作品的自定义视觉层。
const screenPoint = adapter.project(
  transformCoordinate(sourcePosition, sourceCrs, adapter.dataCrs)
);
// 保存并调用 unsubscribe，作品卸载时调用 adapter.destroy()。
const unsubscribe = adapter.onChange(renderVisualization);
```

`runtimeConfig` 的字段由平台决定：`key`、高德 `securityJsCode/securityServiceHost/showOversea`、Maptec `sdkUrl/cssUrl/dataCrs`，以及可选 `style/mapId`。高德海外数据设置布尔值 `showOversea: true`，适配器会将其传给 `AMap.Map`；未设置或设为 `false` 时不开启。Key 仍需具备世界地图权限，开关和 `complete` 事件不代表真实海外底图已通过验收。只有用户指定的平台加载 SDK。Key 绑定的 SDK 再换 Key 时可能需要独立 iframe 或页面重载；适配示例会明确拒绝不安全的重绑定。

接口：`project([lng,lat]) → {x,y}`、`getView() → {center,zoom}`、`setView(view)`、`onChange(callback) → unsubscribe`、`destroy()`、`dataCrs`。输入坐标已经是该平台所需 datum，project 不再转换。CSS 像素和 Canvas DPR 分开处理。

限制：这些辅助模块面向北向 2D，zoom 是各家原生数值，跨家只近似同尺度。Maptec 当前本地 SDK 的 project 被官方示例使用但源码标私有，优先核实公开原生覆盖物；不要把该封装当稳定公共 API 保证。3D、地形、原生热力等按本次平台另行实现。坐标换算是近似公式与粗略地理边界，不能声称测绘精度，境外/边界数据需要明确来源契约。

## 验收重点

- 分析：有效数 + 无效数可核对；数值零/负值/缺失不同；同坐标不同实体保留；多点/多线/多面正确展开；不将地址或轨迹缺口补造为坐标。
- 表达：气泡面积与数量一致，缺失单独编码；图例单位和阈值准确；重叠点能访问详情；线面和 OD 连线含义明确；日期线与 Web Mercator 极区处理有依据。
- 接入：真实底图可见，已知点位正确，缩放与拖动无漂移，标识未被遮挡；Key/网络/配额失败能理解和恢复。
- 切换：数据 ID、字段、筛选、图例、选择及地理范围保留；旧实例清理，迟到请求不覆盖新状态。
- 交互：暂停/后台恢复、空结果、窗口 resize 和所需屏幕尺寸；大数据性能按实际设备评估，不套固定点数上限。

记录哪些真实平台和效果已测试、哪些仅做了脚本或模拟 SDK 验证。模块模拟测试不证明商业底图在用户 Key 与网络下能运行。
