# Geo Data Viz

一个独立的地理数据可视化 Agent Skill：在 AI 对话中提供 CSV、Excel、JSON 或 GeoJSON，由 Agent 分析字段和空间数据，根据任务生成交互式地图。

支持为 Google Maps、Mapbox、Maptec、百度、高德、腾讯选择实现路线。地图需要用户自己的 Key 和相应权限；能力参考文档不代表六家所有图层均已通过真实环境验收。

## 安装到 Codex

在终端执行（目标目录应不存在）：

```bash
git clone https://github.com/FloraCat526/geo-data-viz.git "${CODEX_HOME:-$HOME/.codex}/skills/geo-data-viz"
```

也可以下载仓库，将包含 `SKILL.md` 的整个目录命名为 `geo-data-viz`，放入 Agent 的技能目录。此仓库发布独立 Skill，不依赖演示平台或视频工程。

## 使用

在对话中附上数据并调用：

> 使用 $geo-data-viz 分析附件门店数据。坐标为 WGS84，用订单量生成气泡图，按区域筛选。使用我选择的地图平台和提供的 Key。

Agent 会先分析数据与坐标系，确定指标和视觉表达，再生成本次数据的地图作品。无明确坐标系的表格不会仅凭数值猜测坐标系。只有地址时需另行完成有依据的地理编码。

Python 3.10+ 可运行基础分析，无需额外依赖。Excel XLSX/XLSM 可在虚拟环境安装可选依赖：

```bash
python3 -m pip install -r requirements-excel.txt
```

直接运行分析脚本：

```bash
python3 scripts/profile_geo.py /path/to/stores.csv --out-dir work/profile \
  --crs wgs84 --lng-field longitude --lat-field latitude --value-field orders
```

## 高德海外地图

复用适配器时，在高德运行配置中设置布尔值 `showOversea: true`：

```js
const adapter = await createProvider('amap', mapElement, {
  ...authorizedRuntimeConfig,
  showOversea: true,
}, camera);
```

适配器会把该值传给 `AMap.Map`。未设置或设为 `false` 时保持关闭。Key 还必须具备世界地图权限；该开关不会授予权限，初始化 `complete` 事件也不证明真实底图已显示。[高德官方示例](https://developer.amap.com/demo/javascript-api-v2/example/doc-demo/showOversea)

运行配置只使用获授权的浏览器 Key；不要将真实凭证提交到仓库。

## 目录

- [SKILL.md](SKILL.md)：工作流入口。
- `scripts/`：本地数据分析与规范化。
- `assets/adapters/`：地图 SDK 接入辅助模块和近似坐标转换。
- [references/](references/)：数据契约、效果选择和各家地图参考。
- `agents/`：Agent 界面元数据。
- `tests/`：数据分析、坐标转换和模拟 SDK 回归测试。

## 测试与验证范围

Python 3.10+、Node.js 20+：

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/*.test.mjs
```

高德回归测试验证海外开关的开启、关闭及未配置三种情况，并检查原相机中心保留。测试使用模拟 SDK，不消耗地图 Key；真实海外底图及 A→B→A 切换需在获授权的环境验收。

当前仍有已知限制：CRS 名称解析存在模糊匹配；本地转换使用粗略矩形范围，对部分境外点不适用；异常的几何 type 可能中断分析。接入前应核实数据声明和转换范围。此次修复仅覆盖高德海外开关。

## 许可证

当前尚未添加许可证文件。地图 SDK、地图内容及服务分别适用供应商条款。
