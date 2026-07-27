# Dicode Release Service

一个基于 FastAPI 的 Dicode 安装包发布、下载、安装和版本回滚服务。

用户只需要运行：

```bash
curl -fsSL https://download.example.com/install.sh | bash
```

Windows PowerShell：

```powershell
iwr https://download.example.com/install.bat -OutFile install.bat
.\install.bat
```

安装后的命令统一为 `dicode`，后续更新运行：

```bash
dicode upgrade
```

## 服务能力

- 管理员通过 Bearer Token 上传版本包
- 服务端自动计算 SHA-256 和文件大小
- 原子发布或回滚 `latest.json`
- 公开提供安装脚本、版本清单和安装包
- 安装器自动识别操作系统、CPU、AVX2 和 musl
- 安装器下载后强制校验 SHA-256
- 安装失败时自动恢复旧的可执行文件
- 下载支持 HEAD、ETag、缓存验证和 Range 断点续传

## 启动服务

### Docker Compose

```bash
cd remote-vcs-service
export API_TOKEN='替换为强随机密钥'
export PUBLIC_BASE_URL='https://download.example.com'
docker compose up --build -d
```

生产环境应通过 Nginx、Caddy 或云负载均衡提供 HTTPS。

### 本地开发

```bash
cd remote-vcs-service
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
API_TOKEN=change-me PUBLIC_BASE_URL=http://localhost:8000 \
  uvicorn app.main:app --reload
```

API 文档位于 <http://localhost:8000/docs>。

## 安装包名称

安装器会按照运行环境选择以下文件：

```text
dicode-linux-x64.tar.gz
dicode-linux-x64-baseline.tar.gz
dicode-linux-x64-musl.tar.gz
dicode-linux-x64-baseline-musl.tar.gz
dicode-linux-arm64.tar.gz
dicode-linux-arm64-musl.tar.gz
dicode-darwin-x64.tar.gz
dicode-darwin-x64-baseline.tar.gz
dicode-darwin-arm64.tar.gz
dicode-windows-x64-baseline.zip
dicode-windows-arm64.zip
```

压缩包内的可执行文件优先命名为 `dicode` 或 `dicode.exe`。为了迁移已有构建，
安装器也能识别包内的 `cs` 或 `cs.exe`，但安装后统一重命名为 `dicode`。

## 发布一个版本

以下示例发布 `1.2.3`：

```bash
base=http://localhost:8000
token=change-me

curl -f -X PUT \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @dicode-linux-x64.tar.gz \
  "$base/api/releases/1.2.3/assets/dicode-linux-x64.tar.gz"

curl -f -X PUT \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @dicode-windows-x64-baseline.zip \
  "$base/api/releases/1.2.3/assets/dicode-windows-x64-baseline.zip"

curl -f -X POST \
  -H "Authorization: Bearer $token" \
  "$base/api/releases/1.2.3/publish"
```

发布完成后可以检查：

```bash
curl -fsSL "$base/dicode/pkg/latest.json"
```

## 指定版本安装

Linux/macOS：

```bash
curl -fsSL https://download.example.com/install.sh |
  bash -s -- --version 1.2.3
```

Windows：

```powershell
.\install.bat --version 1.2.3
```

## 回滚

重新发布一个已经存在的历史版本即可原子回滚：

```bash
curl -f -X POST \
  -H "Authorization: Bearer $token" \
  "$base/api/releases/1.1.0/publish"
```

不会复制或删除任何安装包，只会把公开的 `latest.json` 切换到 `1.1.0`。

## 数据目录

```text
data/
├── latest
└── releases/
    └── 1.2.3/
        ├── release.json
        ├── dicode-linux-x64.tar.gz
        └── dicode-windows-x64-baseline.zip
```

需要持久化和备份整个 `DATA_DIR`。发布服务建议只运行一个 Uvicorn worker；大文件和
高并发下载场景建议在前面增加支持缓存的反向代理或对象存储。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `API_TOKEN` | 管理接口 Bearer Token；生产环境必须设置 |
| `PUBLIC_BASE_URL` | 安装脚本和 manifest 使用的公开 HTTPS 地址 |
| `DATA_DIR` | 数据目录，默认 `./data` |
| `MAX_PACKAGE_BYTES` | 单个安装包最大字节数，默认 2 GiB |

公开安装和下载接口不需要 Token，只有 `/api/*` 管理接口受保护。
