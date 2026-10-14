# Geo Data Viz

把地理数据变成交互式地图的独立 Agent Skill。在 AI 对话中提供 CSV、Excel、JSON 或 GeoJSON，由 Agent 分析字段、坐标系和空间分布，生成适合这份数据的可运行 HTML 地图作品。

支持气泡、聚合、热力、蜂窝、飞线、波纹等可视化表达，可根据任务选择 Mapbox、Google Maps、Maptec、百度、高德或腾讯地图。数据效果优先使用所选图商原生图层或官方可视化扩展；图商不支持时允许 Canvas、deck.gl、ECharts 等补充，并说明能力缺口、实际渲染来源和限制。各服务的能力与配置见 [地图服务参考](https://github.com/FloraCat526/geo-data-viz/tree/main/references/capabilities)。

[npm](https://www.npmjs.com/package/@floracat/geo-data-viz) · [GitHub](https://github.com/FloraCat526/geo-data-viz) · [效果展示](#效果展示)

## 快速开始

### 1. 安装 Skill

准备 Node.js 20+，在终端运行：

```bash
npx @floracat/geo-data-viz@latest install
```

默认安装到 `~/.agents/skills/geo-data-viz`，供 Codex 使用。无需启动额外平台。安装后若未显示 Skill，重新启动 Agent。

### 2. 提供数据与地图配置

在对话中附上数据文件，并说明想展示的指标、已知坐标系和地图服务。地图需要你自己的 Key 及相应权限，可让 Agent 通过本地环境变量配置；不要把真实凭证提交到仓库。

数据分析需要 Python 3.10+，CSV、JSON、GeoJSON 的基础分析无需额外 Python 依赖。Excel 的可选依赖安装方式见下方「手动分析数据」。

### 3. 在对话中使用

```text
使用 $geo-data-viz 分析这份意大利城市人口 GeoJSON。
坐标系为 WGS84，使用 Mapbox，读取本地环境变量中的 Token。
以人口展示星光气泡，支持大区筛选、城市搜索和点击查看详情，
生成一个可以独立运行的交互式地图页面。
```

也可以直接描述目标，让 Agent 根据数据选择合适的表达：

```text
使用 $geo-data-viz 分析附件门店数据，展示订单量和空间分布，
支持按区域筛选。先检查字段和坐标系，再选择适合的地图效果。
```

Agent 会先分析数据与坐标系，简述发现并确定视觉表达，生成 HTML 并验证地图。数据和目标明确就直接推进；只询问会影响结果的关键缺项。默认呈现用户数据，单图商保持简洁，多图商切换按需加入。坐标系不明确时需补充依据；只有地址的数据需先完成地理编码。

## Claude Code 与 WorkBuddy

同一份 Skill 正文与资源可以用于这些应用，但安装和调用入口分别配置：

- **Claude Code**：`npx @floracat/geo-data-viz@latest install --dir "$HOME/.claude/skills"`，在项目中上传/提供文件后使用 `/geo-data-viz`。项目级安装将 --dir 改为项目的 `.claude/skills`。见 [官方 Skill 文档](https://code.claude.com/docs/en/skills)。
- **WorkBuddy**：在技能管理界面上传本地 Skill 包，包中保留 `geo-data-viz/SKILL.md` 与 scripts、references、assets 等支持资源，按界面提示导入并启用；见 [官方技能说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)。不要只上传 SKILL.md。

运行时需要宿主能读取附件并执行 Python；Excel 另需 openpyxl。Agent 应解析自己的 Skill 目录、文件路径和可用 Python（不同系统可能是 python3、python 或 py），有浏览器工具时执行视觉验收。安装包测试不等于已经在上述每个应用完成端到端验证。

## HTML 交付

默认生成 `map.html`，内嵌本次必要数据和业务代码，SDK/底图仍需联网和有效 Key。需要 HTTP 或外部大文件时交付完整目录和启动命令。缺 Key 时先生成页面并明确待接入，不能把空底图称为已完成。

Mapbox 常见原生效果有 [代码配方与打包工具](references/mapbox-recipes.md)，OD、轨迹和区域关联见 [数据转换配方](references/transforms.md)。AI 先确定语义和 visualSpec，再调用工具；这些资源不替代选型判断，也不强制固定布局。

## 案例网站

[案例目录](examples/index.html) 包含意大利城市星图、多地图演示工作台与 8 张效果截图。在仓库根目录运行：

```bash
python3 tools/serve_examples.py
```

打开 http://127.0.0.1:8767/examples/ 。两份网站均为静态页面，真实地图使用访问者自己的浏览器 Key；仓库不含凭证。城市星图使用公开的 GeoNames 数据，工作台使用合成数据与独立 Canvas 数据层。运行、静态部署与数据许可见 [案例说明](examples/README.md)。案例网站不随 npm Skill 包安装。

## 效果展示

以下截图展示不同数据与可视化效果的组合，作品可由 Skill 按任务生成独立页面。

| | |
| --- | --- |
| **意大利城市人口 · 星光气泡**<br>![意大利城市人口 · 星光气泡](https://raw.githubusercontent.com/FloraCat526/geo-data-viz/0316650/assets/screenshots/italy-city-population.png) | **新加坡滨海连道 · 霓虹路线**<br>![新加坡滨海连道 · 霓虹路线](https://raw.githubusercontent.com/FloraCat526/geo-data-viz/0316650/assets/screenshots/singapore-coastal-routes.png) |
| **加州充电站 · 图标点**<br>![加州充电站 · 图标点](https://raw.githubusercontent.com/FloraCat526/geo-data-viz/0316650/assets/screenshots/california-ev-charging.png) | **新加坡历史航线 · 飞线**<br>![新加坡历史航线 · 飞线](https://raw.githubusercontent.com/FloraCat526/geo-data-viz/0316650/assets/screenshots/singapore-flight-routes.png) |
| **新加坡停车分布 · 蜂窝图**<br>![新加坡停车分布 · 蜂窝图](https://raw.githubusercontent.com/FloraCat526/geo-data-viz/0316650/assets/screenshots/singapore-parking-hexagons.png) | **意大利地震 · 波纹图**<br>![意大利地震 · 波纹图](https://raw.githubusercontent.com/FloraCat526/geo-data-viz/0316650/assets/screenshots/italy-earthquake-ripples.png) |
| **新加坡住宅 · 3D 热力图**<br>![新加坡住宅 · 3D 热力图](https://raw.githubusercontent.com/FloraCat526/geo-data-viz/0316650/assets/screenshots/singapore-housing-3d-heatmap.png) | **新加坡商户 · 点聚合**<br>![新加坡商户 · 点聚合](https://raw.githubusercontent.com/FloraCat526/geo-data-viz/0316650/assets/screenshots/singapore-business-clusters.png) |

## 安装选项与更新

| 使用范围 | 命令 | 安装位置 |
| --- | --- | --- |
| 当前用户（默认） | `npx @floracat/geo-data-viz@latest install` | `~/.agents/skills/geo-data-viz` |
| 当前项目 | `npx @floracat/geo-data-viz@latest install --project` | 当前目录下的 `.agents/skills/geo-data-viz` |
| 自定义技能目录 | `npx @floracat/geo-data-viz@latest install --dir /path/to/skills` | `/path/to/skills/geo-data-viz` |

`--project` 请在项目根目录执行；`--dir` 接收技能父目录，安装器会自动追加 `geo-data-viz`。其他支持本地 Skill 的 Agent，可用 `--dir` 指向其技能目录。默认与项目路径遵循 [Codex 技能目录约定](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)。

更新默认安装：

```bash
npx @floracat/geo-data-viz@latest install --force
```

更新项目或自定义位置时，保留原来的目标参数：

```bash
npx @floracat/geo-data-viz@latest install --project --force
npx @floracat/geo-data-viz@latest install --dir /path/to/skills --force
```

已有目录默认不会被覆盖。`--force` 会先备份旧目录，再安装新版本，并打印备份位置；默认安装的备份位于 `~/.agents/.geo-data-viz-backups/`。如需预览目标与文件清单，在安装命令后加 `--dry-run`；预览更新时同时保留 `--force`。

<details>
<summary>从 GitHub 手动安装</summary>

目标目录不存在时，可直接克隆：

```bash
git clone https://github.com/FloraCat526/geo-data-viz.git "$HOME/.agents/skills/geo-data-viz"
```

也可以下载仓库，将包含 `SKILL.md` 的整个目录放入 Agent 的技能目录。

</details>

## 手动分析数据

通常由 Agent 调用分析脚本。需要单独运行时，以下命令适用于默认安装位置：

```bash
python3 "$HOME/.agents/skills/geo-data-viz/scripts/profile_geo.py" \
  /path/to/stores.csv --out-dir ./work/profile \
  --crs wgs84 --lng-field longitude --lat-field latitude --value-field orders
```

将文件路径、坐标系和字段名替换为实际数据。项目或自定义安装需相应调整脚本路径。

分析 Excel XLSX/XLSM 文件前，可在项目目录创建虚拟环境并安装可选依赖：

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r "$HOME/.agents/skills/geo-data-viz/requirements-excel.txt"
```

安装命令仅复制 Skill 文件；Python 依赖、地图 SDK 和 Key 按具体任务配置。

## Skill 内容

| 路径 | 用途 |
| --- | --- |
| `SKILL.md` | 工作流入口 |
| `scripts/` | 数据分析、规范化与 Mapbox HTML 打包 |
| `references/` | 数据契约、可视化选择与地图服务配置 |
| `assets/adapters/` | 旧二维接入兼容模块与近似坐标转换；原生优先，必要时核验后用于二维补充 |
| `assets/recipes/` | 可组合的 Mapbox 原生图层 |
| `agents/` | Agent 界面元数据 |
| `requirements-excel.txt` | Excel 分析的可选依赖 |

仓库另含 npm 安装器 `bin/`、测试 `tests/`、行为评估 `evals/`、案例网站 `examples/` 和展示截图 `assets/screenshots/`。

## 开发验证

运行 `npm test` 与 `python3 -m unittest discover -s tests -p "test_*.py"`。端到端任务与评分方法见 [evals/README.md](evals/README.md)；脚本通过不能代替真实底图与各 Agent 的运行验收。

## 地图服务商与第三方可视化能力

本 Skill 覆盖以下六家地图服务商。优先使用所选图商的原生图层或官方可视化扩展；确认图商不支持目标效果时，可采用第三方库或自定义渲染补充，并说明能力缺口、实际渲染来源及限制。

### 地图服务商

| 服务商 | 主要可视化路线 | 能力参考 |
| --- | --- | --- |
| Mapbox | 点、气泡、聚合、热力、路线、区域设色、区域拉伸 | [Mapbox](references/capabilities/mapbox.md) |
| Google Maps | 标记、聚合、Data 点线面、行政区设色、路径；连续热力采用补充方案 | [Google Maps](references/capabilities/google.md) |
| Maptec | 气泡、呼吸点、聚合、热力、飞线、区域面、棱柱、轨迹 | [Maptec](references/capabilities/maptec.md) |
| 高德地图 | JSAPI + Loca：点线面、呼吸、热力、网格、脉冲、拉伸 | [高德](references/capabilities/amap.md) |
| 百度地图 | JSAPI + MapVGL：点线面、聚合、热力、波纹、飞线、拉伸 | [百度](references/capabilities/baidu.md) |
| 腾讯地图 | TMap + visualization：散点、热力、弧线、轨迹、网格、区域面 | [腾讯](references/capabilities/tencent.md) |

上述为选型与生成代码的参考路线，实际可用性取决于 SDK/扩展版本、Key 权限、区域覆盖和运行环境。Loca、MapVGL、腾讯 visualization 按官方扩展记录，与通用第三方渲染库区分。

### 第三方与自定义补充

| 方案 | 可评估的补充能力 | 当前资源状态 |
| --- | --- | --- |
| deck.gl | 连续热力 HeatmapLayer、OD 弧线 ArcLayer、轨迹尾迹 TripsLayer、柱体等 | 已有部分 API 选型路线；需按任务核验版本和地图集成 |
| ECharts | 图商能力不足时，按任务选择适用的可视化表达和地图联动方案 | 已允许作为补充；尚未提供现成地图适配器或可复用效果配方 |
| 独立 Canvas / SVG | 定制二维数据效果 | 由 Agent 按任务实现，核验投影、相机同步、拾取与清理 |
| 自定义 WebGL | 原生能力不足时的特殊三维效果 | 由 Agent 按任务实现，核验投影、遮挡、拾取与兼容性 |

第三方或自定义实现不标为图商原生能力。缺 Key、网络错误或底图加载失败也不等于图商缺少可视化能力。详细规则见 [渲染优先级与补充效果](references/provider-rendering.md)。

### 当前实现与验证范围

- **已有可复用代码与 HTML 打包工具**：Mapbox 的点、气泡、聚合、热力、线、面设色、拉伸，共 7 类原生配方，见 [使用说明](references/mapbox-recipes.md)。
- **已有能力文档与实现指引**：其他五家图商，由 Agent 按用户数据、目标效果和实际 SDK 生成代码；部分历史案例的验证范围记录在对应能力文档中。
- **第三方补充方案**：已有选型规则及部分 API 路线，尚未形成完整、逐项验证的模板库。

能力文档覆盖不代表所有“图商 × 效果”组合都已开箱即用或通过真实 Key 验收；每次生成的作品仍需分别验证底图、数据层和交互。
