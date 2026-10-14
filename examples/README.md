# 案例网站

在仓库根目录执行 `python3 tools/serve_examples.py`，打开 <http://127.0.0.1:8767/examples/>。使用 `--port 8780` 可更换端口。服务仅监听本机，只提供案例和必要资源，不提供环境文件或文件列表。

静态部署时保留 `examples/`、`assets/adapters/` 和 `assets/screenshots/` 的相对位置，以 `examples/index.html` 为入口，无需构建或后端。仓库上传不代表网站已部署。

| 案例 | 数据与功能 | 地图配置 |
| --- | --- | --- |
| [意大利城市星图](italy-atlas/) | GeoNames 的 945 个城镇；人口气泡、大区筛选、搜索、详情 | 在页面中输入自己的 Mapbox 浏览器 public Token |
| [多地图演示工作台](playground/) | 96 条合成点位；气泡、呼吸、散点、筛选、GeoJSON 导入与导出 | 默认坐标网格不是地图；可按平台填写自己的 Key，高德和 Maptec 另需相应配置 |

Key 只在当前页面内存使用，不写入浏览器持久存储或数据导出；刷新后需重新输入。不要填写服务端 secret。地图 SDK 会按自身要求使用浏览器凭证，需在供应商控制台配置允许来源和配额。

工作台的 GeoJSON 在浏览器中解析，不上传到分析服务。CSV/Excel 等请先在 Agent 中用 Skill 转换。工作台使用独立 Canvas 数据层，是现有二维演示，不代表六家地图的原生效果模板；其投影与 SDK 兼容性需逐家验证，尤其是 Maptec。Skill 生成新作品时仍按原生图层优先规则执行。

案例目录中的 8 张截图为效果展示，只有上表两份案例附运行源码。

## 城市星图数据来源

- 来源：[GeoNames 意大利地名库](https://download.geonames.org/export/dump/IT.zip) 与 [大区名称表](https://download.geonames.org/export/dump/admin1CodesASCII.txt)，下载快照为 2026-09-13。
- 许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。署名：GeoNames；筛选及 GeoJSON 转换。
- 筛选 IT 国家、P 地点类别、现有城镇类型和人口不少于 10,000 的记录，关联大区名称，保留原始人口与坐标；坐标为 WGS84。
- 人口没有统一统计年份，不是最新官方人口普查，也不是完整市镇清单；不能相加作为意大利全国人口。`last_modified` 是记录修改日期。
- 工作台数据为项目生成的合成数据，不代表真实门店或观测。`evals/fixtures/` 同样只作测试使用。
