# Docker 多架构镜像构建指南

本指南说明如何构建支持多架构（AMD64、ARM64）的 Docker 镜像。

## 快速开始

### 使用自动化脚本（推荐）

```bash
# 基本用法：构建本地镜像
./scripts/build-docker.sh

# 指定镜像名称和标签
./scripts/build-docker.sh --name myapp --tag v1.0.0

# 构建并推送到 Docker Hub
./scripts/build-docker.sh --registry docker.io/myusername --push

# 构建并推送到私有仓库
./scripts/build-docker.sh --registry registry.example.com/myproject --tag v1.0.0 --push

# 仅构建 AMD64 架构
./scripts/build-docker.sh --platform linux/amd64

# 查看所有选项
./scripts/build-docker.sh --help
```

## 手动构建步骤

如果你更喜欢手动控制每个步骤：

### 1. 构建二进制文件

```bash
# 安装依赖
bun install

# 构建所有平台的二进制文件
cd packages/opencode
bun run build
cd ../..
```

这会在 `dist/` 目录生成以下文件：
- `dist/@costrict/cs-linux-x64-baseline-musl/bin/cs` (AMD64)
- `dist/@costrict/cs-linux-arm64-musl/bin/cs` (ARM64)

### 2. 配置 Docker Buildx

```bash
# 创建多架构构建器
docker buildx create --name multiarch-builder --use

# 启动构建器
docker buildx inspect --bootstrap
```

### 3. 构建 Docker 镜像

**选项 A: 构建多架构镜像并推送到仓库**

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f packages/opencode/Dockerfile \
  -t your-registry/opencode:latest \
  --push \
  .
```

**选项 B: 构建单架构本地镜像**

```bash
# 仅构建当前平台
docker buildx build \
  --platform linux/amd64 \
  -f packages/opencode/Dockerfile \
  -t opencode:latest \
  --load \
  .
```

### 4. 测试镜像

```bash
# 查看版本
docker run --rm opencode:latest --version

# 交互式运行
docker run -it --rm opencode:latest
```

## 环境变量配置

脚本支持以下环境变量：

```bash
export IMAGE_NAME=myapp           # 镜像名称
export IMAGE_TAG=v1.0.0          # 镜像标签
export REGISTRY=docker.io/user   # 镜像仓库
export PLATFORMS=linux/amd64,linux/arm64  # 目标平台
export PUSH=true                 # 是否推送

./scripts/build-docker.sh
```

## Dockerfile 架构支持说明

当前 Dockerfile 使用多阶段构建，通过 `TARGETARCH` 变量自动选择对应架构的二进制文件：

```dockerfile
FROM base AS build-amd64
COPY dist/@costrict/cs-linux-x64-baseline-musl/bin/cs /usr/local/bin/cs

FROM base AS build-arm64
COPY dist/@costrict/cs-linux-arm64-musl/bin/cs /usr/local/bin/cs

ARG TARGETARCH
FROM build-${TARGETARCH}  # 自动匹配架构
```

## 常见问题

### 1. 如何验证镜像是多架构的？

```bash
docker buildx imagetools inspect your-registry/opencode:latest
```

### 2. 本地测试多架构镜像

本地无法直接加载多架构镜像，必须：
- 推送到仓库后拉取测试
- 或分别构建单架构镜像进行测试

### 3. 跨架构构建速度慢

Docker buildx 使用 QEMU 进行跨架构模拟，速度会较慢。建议：
- 使用 CI/CD 在原生架构上构建
- 或使用专门的构建服务器

### 4. 推送到不同镜像仓库

**Docker Hub:**
```bash
./scripts/build-docker.sh --registry docker.io/username --push
```

**阿里云容器镜像服务:**
```bash
./scripts/build-docker.sh --registry registry.cn-hangzhou.aliyuncs.com/namespace --push
```

**Harbor:**
```bash
./scripts/build-docker.sh --registry harbor.example.com/project --push
```

## 自动化集成

### GitHub Actions 示例

```yaml
name: Build Docker Image

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Install Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.3.5

      - name: Build and push
        run: |
          ./scripts/build-docker.sh \
            --registry docker.io/${{ secrets.DOCKER_USERNAME }} \
            --tag ${{ github.ref_name }} \
            --push
```

## 镜像大小优化

当前镜像基于 Alpine Linux，已经相对精简。如果需要进一步优化：

1. 使用多阶段构建（已实现）
2. 清理不必要的依赖
3. 使用 `scratch` 或 `distroless` 基础镜像（需要静态链接二进制）

## 相关资源

- [Docker Buildx 文档](https://docs.docker.com/buildx/working-with-buildx/)
- [多架构镜像构建指南](https://docs.docker.com/build/building/multi-platform/)
- [Bun 官方文档](https://bun.sh/docs)
