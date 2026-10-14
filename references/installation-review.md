# 安装包下载与校验

用于安装、更新或核对分发文件。流程为：下载固定版本、校验归档、检查文件、安装同一份包。日常地图生成无需执行这些步骤。

## npm：先取得文件，不运行包的 CLI

在技能自动发现目录之外新建工作目录。以下以 0.1.0 为示例；安装其他版本时，先查询元数据，并将所有命令替换为同一确切版本。

```bash
mkdir geo-data-viz-review-0.1.0
cd geo-data-viz-review-0.1.0
npm view @floracat/geo-data-viz@0.1.0 --json > registry.json
npm pack @floracat/geo-data-viz@0.1.0 --ignore-scripts --json > pack.json
```

npm 官方说明：[view](https://docs.npmjs.com/cli/v11/commands/npm-view/) 读取发布元数据；[pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) 取得归档，`--ignore-scripts` 禁用 package.json 生命周期脚本。此阶段仅下载和读取文件。

核对包名、版本、repository、发布时间、dependencies、optionalDependencies、scripts、bin、dist.integrity，以及可用的签名和构建来源信息。

校验实际归档的 SHA-512 是否与 registry 元数据一致：

```bash
python3 - <<'PYCODE'
from pathlib import Path
import base64, hashlib, json
meta = json.loads(Path('registry.json').read_text())
assert meta['name'] == '@floracat/geo-data-viz' and meta['version'] == '0.1.0'
archive = Path('floracat-geo-data-viz-0.1.0.tgz')
expected = meta['dist']['integrity']
actual = 'sha512-' + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
if actual != expected:
    raise SystemExit('Integrity mismatch: do not install')
print('SHA-512 matches registry metadata')
PYCODE
```

以 pack.json 返回文件名为准；如果版本或文件名变化，相应修改上述示例。比较 npm 归档的真实内容与指定仓库 commit，不以 main 当前文档代表旧发布包。

## 检查归档与安装文件

先列出归档成员，再按精确路径读取文件：

```bash
tar -tvf floracat-geo-data-viz-0.1.0.tgz
tar -xOf floracat-geo-data-viz-0.1.0.tgz package/package.json
tar -xOf floracat-geo-data-viz-0.1.0.tgz package/SKILL.md
tar -xOf floracat-geo-data-viz-0.1.0.tgz package/bin/geo-data-viz.mjs
```

继续读取清单中的脚本、JS 模块和入口引用的文档。解包前检查所有成员：仅允许 package/ 下的普通文件与目录；拒绝绝对路径、上级跳转、符号/硬链接、设备文件和重复覆盖路径，控制文件数与解压大小。

检查安装写入位置、覆盖与备份、依赖及生命周期脚本、命令执行、网络请求、Key 读取、数据外发和 HTML 外部资源。当前项目安装器只复制文件；分析脚本本地处理数据；生成作品按图商和渲染方案联网。

完成检查后，在工作目录解包，核对 package.json 的版本与已校验归档一致。对于本项目没有 npm 运行依赖的版本，可直接执行解包后的安装器：

```bash
node /absolute/review/package/bin/geo-data-viz.mjs install --dir /absolute/host/skills --dry-run
node /absolute/review/package/bin/geo-data-viz.mjs install --dir /absolute/host/skills
```

`--dry-run` 预览安装目录和文件清单。更新现有安装时保留目标目录参数，使用 `--force` 由安装器备份旧目录。记录版本、归档 hash 和安装位置，逐文件核对安装内容。存在运行依赖时，同样锁定并检查依赖版本。

## Python 可选依赖

本 Skill 通过 npm/本地目录分发，没有对应的 pip Skill 包；Python 仅用于数据处理，Excel 的 openpyxl 是可选依赖。

需要预先检查 Python 依赖时，选择确切版本并优先下载 wheel：`python3 -m pip download --only-binary=:all: --no-deps --dest review-wheels '包名==确切版本'`。运行前替换包名和版本占位符。`--no-deps` 只下载指定包，其依赖需分别处理；检查 wheel 的 `.pth`、入口点、原生二进制和 METADATA/RECORD。

没有 wheel 时，按索引提供的发行文件 URL 下载 sdist 并核对摘要、读取源码。源码包的元数据生成和构建可能执行构建脚本，检查完成后再在独立环境中构建和使用。

依据：[pip download](https://pip.pypa.io/en/stable/cli/pip_download/) 与 [构建系统接口](https://pip.pypa.io/en/stable/reference/build-system/)。
