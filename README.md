# Geo Data Viz

把地理数据变成交互式地图的独立 Agent Skill。在 AI 对话中提供 CSV、Excel、JSON 或 GeoJSON，由 Agent 分析字段、坐标系和空间分布，生成适合这份数据的地图作品。

支持气泡、聚合、热力、蜂窝、飞线、波纹等可视化表达，可根据任务选择 Mapbox、Google Maps、Maptec、百度、高德或腾讯地图。各服务的能力与配置见 [地图服务参考](https://github.com/FloraCat526/geo-data-viz/tree/main/references/capabilities)。

[npm](https://www.npmjs.com/package/@floracat/geo-data-viz) · [GitHub](https://github.com/FloraCat526/geo-data-viz) · [效果展示](#效果展示)

## 快速开始

### 1. 安装 Skill

准备 Node.js 20+，在终端运行：

```bash
npx @floracat/geo-data-viz@latest install
```

默认安装到 `~/.agents/skills/geo-data-viz`，供 Codex 使用。无需下载仓库或启动演示平台。安装后若未显示 Skill，重新启动 Agent。

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

Agent 会先分析数据与坐标系，确定指标和视觉表达，再生成地图作品。坐标系不明确时需补充依据；只有地址的数据需先完成地理编码。

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
| `scripts/` | 数据分析与规范化 |
| `references/` | 数据契约、可视化选择与地图服务配置 |
| `assets/adapters/` | 地图 SDK 接入辅助模块与近似坐标转换 |
| `agents/` | Agent 界面元数据 |
| `requirements-excel.txt` | Excel 分析的可选依赖 |

仓库另含 npm 安装器 `bin/`、测试 `tests/` 和展示截图 `assets/screenshots/`。
