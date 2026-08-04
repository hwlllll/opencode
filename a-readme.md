## 开发
bun run dev
bun run dev:desktop
bun run dev:web

## 版本控制
如果要永久修改 CLI 默认版本，编辑：
// packages/opencode/package.json
{
"version": "3.0.36"
}
临时指定版本（推荐用于一次打包，不改源码）：
Windows PowerShell：
$env:COSTRICT_VERSION = "3.0.36"
bun run --cwd packages/opencode script/build.ts --target windows-x64-baseline
Windows CMD：
set COSTRICT_VERSION=3.0.36 && bun run --cwd packages/opencode script/build.ts --target windows-x64-baseline
该版本会写入 exe 内的 cs --version 输出和产物的 package.json。

## 打包
bun run --cwd packages/opencode script/build.ts --target windows-x64
bun run --cwd packages/opencode script/build.ts --target windows-x64-baseline
bun run --cwd packages/opencode script/build.ts --target linux-x64-baseline
bun run --cwd packages/opencode script/build.ts --target darwin-x64-baseline


## 对接后端
云端后端：默认对接 https://zgsm.sangfor.com，可通过环境变量 COSTRICT_BASE_URL 覆盖。配置优先级是：环境变量 → provider 配置 → 登录凭证中的地址 → 默认地址。
主要云端接口包括：

   功能                    默认接口
  ━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   登录认证                https://zgsm.sangfor.com/oidc-auth/api/v1
  ──────────────────────  ───────────────────────────────────────────────────
   模型列表                https://zgsm.sangfor.com/ai-gateway/api/v1/models
  ──────────────────────  ───────────────────────────────────────────────────
   AI 对话                 https://zgsm.sangfor.com/chat-rag/api/v1
  ──────────────────────  ───────────────────────────────────────────────────
   设备、插件、云端资源    https://zgsm.sangfor.com/cloud-api
  ──────────────────────  ───────────────────────────────────────────────────
   安装包与版本更新        https://zgsm.sangfor.com/costrict-cli/...

  AI 对话接口采用 OpenAI-compatible 协议，默认 Provider 是 costrict/Auto，见 packages/opencode/src/provider/provider.ts:983。


## 远程更新
以发布 Linux x64 版本 1.0.1 为例，在仓库根目录执行：

# 1. 构建二进制
bun run --cwd packages/opencode script/build.ts --target linux-x64-baseline

# 2. 压缩产物并生成 latest.json
bun run --cwd packages/opencode script/compress-gen-pkg.ts

生成结果：

packages/opencode/dist/1.0.1/
├── costrict-cs-linux-x64-baseline.tar.gz
└── latest.json

生成的 latest.json 类似：

{
"tag_name": "1.0.1",
"name": "1.0.1",
"assets": [
    {
    "name": "costrict-cs-linux-x64-baseline.tar.gz",
    "browser_download_url": "https://download.dicode.com/costrict-cli/pkg/1.0.1/costrict-cs-linux-x64-baseline.tar.gz"
    }
]
}

部署到你的下载服务器时，目录必须是：

网站根目录/
└── costrict-cli/
        └── 1.0.1/
            └── costrict-cs-linux-x64-baseline.tar.gz

也就是说：

dist/1.0.1/latest.json
→ /costrict-cli/pkg/latest.json

dist/1.0.1/costrict-cs-linux-x64-baseline.tar.gz
→ /costrict-cli/pkg/1.0.1/costrict-cs-linux-x64-baseline.tar.gz

确认服务器可访问：

curl https://download.dicode.com/costrict-cli/pkg/latest.json

构建和生成脚本中必须使用同一个 COSTRICT_VERSION，否则 latest.json 指向的版本和实际压缩包会不一致。

指定更新
cs upgrade

bun --cwd packages/opencode run build:builtin-agents && bun --cwd packages/opencode --watch --conditions=browser ./src/index.ts


## 打包发布全流程
现在完整流程是：

  构建 Dicode
    → 按平台压缩
    → 上传到发布服务
    → 发布版本
    → 用户安装
    → 后续 dicode upgrade

  ## 1. 启动发布服务

  cd /workspaces/opencode/remote-vcs-service

  export API_TOKEN='强随机管理密钥'

  编辑 remote-vcs-service/config.json：

  {
    "api": "https://api.example.com",
    "download": "https://download.example.com"
  }

  docker compose up --build -d

  检查：

  curl https://download.example.com/health

  ## 2. 设置版本并构建

  在 packages/opencode/package.json 中设置版本，例如：

  {
    "version": "1.2.3"
  }

  构建不同平台：

  bun run --cwd packages/opencode script/build.ts --target linux-x64
  bun run --cwd packages/opencode script/build.ts --target linux-x64-baseline
  bun run --cwd packages/opencode script/build.ts --target linux-arm64
  bun run --cwd packages/opencode script/build.ts --target darwin-arm64
  bun run --cwd packages/opencode script/build.ts --target windows-x64-baseline
  bun run --cwd packages/opencode script/build.ts --target windows-arm64

  发布服务不参与编译，只接收已经构建好的文件。

  ## 3. 生成安装包

  把构建出来的程序整理为：

  release/
  ├── linux-x64/
  │   └── dicode
  └── windows-x64/
      └── dicode.exe

  Linux/macOS 使用 .tar.gz：

  tar -czf dicode-linux-x64.tar.gz \
    -C release/linux-x64 dicode

  Windows PowerShell 使用 .zip：

  Compress-Archive `
    -Path release\windows-x64\dicode.exe `
    -DestinationPath dicode-windows-x64-baseline.zip

  标准安装包名称包括：

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

  不需要每个版本都提供全部平台，但用户所在平台对应的包必须存在。

  ## 4. 上传安装包

  设置发布信息：

  base=https://download.example.com
  token='强随机管理密钥'
  version=1.2.3

  上传 Linux：
  base=http://0.0.0.0:8000
  version=1.0.0
  curl -f -X PUT \
    -H "Authorization: Bearer 123456" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @dicode-linux-x64-baseline.tar.gz \
    "$base/api/releases/$version/assets/dicode-linux-x64-baseline.tar.gz"

  上传 Windows：

  curl -f -X PUT \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @dicode-windows-x64-baseline.zip \
    "$base/api/releases/$version/assets/dicode-windows-x64-baseline.zip"

  服务在上传时会自动：

  - 限制文件大小
  - 计算 SHA-256
  - 记录文件大小
  - 生成版本元数据
  - 将文件保存在 DATA_DIR/releases/1.2.3/

  上传完成但没有 publish 时，普通用户不能下载这个版本。

  查看版本：
  base=http://0.0.0.0:8000
  version=1.0.0
  curl -fsSL \
    -H "Authorization: Bearer 123456" \
    "$base/api/releases/$version"

  ## 5. 发布版本

  确认所有平台包都上传完成：

  curl -f -X POST \
    -H "Authorization: Bearer $token" \
    "$base/api/releases/$version/publish"

  publish 会原子切换最新版本，因此用户不会看到只上传了一部分的版本。

  检查：

  curl -fsSL "$base/dicode/pkg/latest.json"

  结果类似：

  {
    "tag_name": "1.2.3",
    "name": "1.2.3",
    "published_at": "2026-07-27T12:00:00Z",
    "assets": [
      {
        "name": "dicode-linux-x64.tar.gz",
        "size": 12345678,
        "digest": "sha256:...",
        "browser_download_url": "https://download.example.com/dicode/pkg/1.2.3/dicode-linux-x64.tar.gz"
      }
    ]
  }

  ## 6. 用户首次安装

  Linux/macOS：

  curl -fsSL http://0.0.0.0:8000/install.sh | bash

  Windows PowerShell：

  iwr https://download.example.com/install.bat -OutFile install.bat
  .\install.bat

  安装器会：

  1. 获取 latest.json
  2. 检测系统、CPU、AVX2 和 musl
  3. 选择对应的 dicode-* 安装包
  4. 下载安装包和 SHA-256
  5. 校验安装包
  6. 解压程序
  7. 执行 dicode --version 验证
  8. 安装到用户目录
  9. 配置 PATH 和 ~/.dicode/config.json

  安装位置：

  Linux/macOS: ~/.dicode/bin/dicode
  Windows:     %USERPROFILE%\.dicode\bin\dicode.exe

  ## 7. 指定版本安装

  Linux/macOS：

  curl -fsSL https://download.example.com/install.sh |
    bash -s -- --version 1.2.3

  Windows：

  .\install.bat --version 1.2.3

  ## 8. 用户升级

  用户执行：

  dicode upgrade

  程序会：

  1. 查询远程最新版本
  2. 比较本地版本
  3. 下载对应安装脚本
  4. 下载目标平台安装包
  5. 校验 SHA-256
  6. 验证新程序能运行
  7. 替换当前版本
  8. 安装失败时恢复旧版本

  ## 9. 版本回滚

  重新 publish 历史版本：

  curl -f -X POST \
    -H "Authorization: Bearer $token" \
    "$base/api/releases/1.2.2/publish"

  这只会切换最新版本指针，不会复制或删除安装包。

  回滚后：

  - 新用户默认安装 1.2.2
  - 指定版本仍然可以安装 1.2.3
  - 历史安装包继续保留
  - 用户下次运行 dicode upgrade 时读取新的最新版本信息

----------------------------------------------------------------------------
    ### 1. 安装依赖

  cd /workspaces/opencode
  bun install

  ### 2. 打包 Linux x64 基线版本

  当前项目版本是 1.0.0：

  bun run build:dicode \
    --target linux-x64-baseline

  也可以用环境变量：

  DICODE_VERSION=1.0.0 \
  bun run build:dicode --target linux-x64-baseline

  生成文件：

  packages/opencode/dist/1.0.0/dicode-linux-x64-baseline.tar.gz

  ### 3. 同时打包多个平台

  bun run build:dicode \
    --target linux-x64,linux-x64-baseline,windows-x64,windows-x64-baseline

  对应产物位于：

  packages/opencode/dist/1.0.0/
  ├── dicode-linux-x64.tar.gz
  ├── dicode-linux-x64-baseline.tar.gz
  ├── dicode-linux-arm64.tar.gz
  └── dicode-windows-x64-baseline.zip

  支持的目标包括：

  linux-arm64
  linux-x64
  linux-x64-baseline
  linux-arm64-musl
  linux-x64-musl
  linux-x64-baseline-musl
  darwin-arm64
  darwin-x64
  darwin-x64-baseline
  windows-arm64
  windows-x64
  windows-x64-baseline

  ### 4. 仅重新压缩已有构建

  如果二进制已经构建完成，不想重新编译：

  bun run build:dicode \
    --version 1.0.0 \
    --target linux-x64-baseline \
    --skip-build

  ### 5. 本地验证产物

  tmp=$(mktemp -d)
  tar -xzf \
    packages/opencode/dist/1.0.0/dicode-linux-x64-baseline.tar.gz \
    -C "$tmp"
  "$tmp/dicode" --version

  正常应输出 1.0.0 等版本信息。

  ### 6. 上传并发布

  base=http://0.0.0.0:8000
  token=123456
  version=1.0.1
  file=packages/opencode/dist/$version/dicode-linux-x64-baseline.tar.gz

  curl -f -X PUT \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@$file" \
    "$base/api/releases/$version/assets/dicode-linux-x64-baseline.tar.gz"

  curl -f -X POST \
    -H "Authorization: Bearer $token" \
    "$base/api/releases/$version/publish"

  检查发布结果：

  curl -fsSL "$base/dicode/pkg/latest.json"

  然后安装：

  cd /workspaces/opencode
  curl -fsSL "$base/install.sh" | bash

  目前打包入口是 script/package.ts，对应命令定义在 package.json:13。这两个文件目前仍是未提交的新改动，正式使用前记得提交。
$env:DICODE_INSTALL_DIR="$env:LOCALAPPDATA\dicode\bin"; iwr "https://aiservice.byd.com/dicode-remote-update/install.bat" -OutFile install.bat; .\install.bat