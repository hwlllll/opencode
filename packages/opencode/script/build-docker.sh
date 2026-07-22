#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
IMAGE_NAME="${IMAGE_NAME:-zgsm/costrict-cli}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-docker.io}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH="${PUSH:-false}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --platform)
      PLATFORMS="$2"
      shift 2
      ;;
    --push)
      PUSH="true"
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --name NAME         Image name (default: opencode)"
      echo "  --tag TAG           Image tag (default: latest)"
      echo "  --registry REGISTRY Registry URL (e.g., docker.io/myuser)"
      echo "  --platform PLATFORM Platforms to build (default: linux/amd64,linux/arm64)"
      echo "  --push              Push image to registry after build"
      echo "  --help              Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  IMAGE_NAME, IMAGE_TAG, REGISTRY, PLATFORMS, PUSH"
      echo ""
      echo "Examples:"
      echo "  $0 --name myapp --tag v1.0.0"
      echo "  $0 --registry docker.io/myuser --push"
      echo "  $0 --platform linux/amd64 --name myapp"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Construct full image name
if [ -n "$REGISTRY" ]; then
  FULL_IMAGE_NAME="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
else
  FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"
fi

echo -e "${GREEN}=== OpenCode Docker Build Script ===${NC}"
echo -e "${YELLOW}Image:${NC} ${FULL_IMAGE_NAME}"
echo -e "${YELLOW}Platforms:${NC} ${PLATFORMS}"
echo -e "${YELLOW}Push:${NC} ${PUSH}"
echo ""

# Step 1: Build binaries
echo -e "${GREEN}[1/4] Building binaries...${NC}"
cd "$(dirname "$0")/../../.."
bun install
cd packages/opencode
bun run build
cd ../..

# Check if required dist directories exist
if [ ! -d "packages/opencode/dist/@costrict/cs-linux-x64-baseline-musl" ] || [ ! -d "packages/opencode/dist/@costrict/cs-linux-arm64-musl" ]; then
  echo -e "${RED}Error: Required distribution directories not found${NC}"
  echo "Expected:"
  echo "  - packages/opencode/dist/@costrict/cs-linux-x64-baseline-musl/bin/cs"
  echo "  - packages/opencode/dist/@costrict/cs-linux-arm64-musl/bin/cs"
  exit 1
fi

echo -e "${GREEN}Binaries built successfully${NC}"
echo ""

# Step 2: Setup Docker buildx
echo -e "${GREEN}[2/4] Setting up Docker buildx...${NC}"
BUILDER_NAME="opencode-multiarch-builder"

# Check if builder exists
if docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
  echo "Builder '$BUILDER_NAME' already exists, using it"
  docker buildx use "$BUILDER_NAME"
else
  echo "Creating new builder '$BUILDER_NAME'"
  docker buildx create --name "$BUILDER_NAME" --use
fi

docker buildx inspect --bootstrap
echo ""

# Step 3: Build Docker image
echo -e "${GREEN}[3/4] Building Docker image...${NC}"

BUILD_ARGS="--platform ${PLATFORMS} -f packages/opencode/Dockerfile -t ${FULL_IMAGE_NAME}"

if [ "$PUSH" = "true" ]; then
  echo -e "${YELLOW}Building and pushing image...${NC}"
  BUILD_ARGS="$BUILD_ARGS --push"
else
  # For local builds without push, we can only build for current platform
  CURRENT_PLATFORM=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')
  echo -e "${YELLOW}Building for current platform: ${CURRENT_PLATFORM}${NC}"
  echo -e "${YELLOW}Note: Multi-platform builds require --push flag${NC}"
  BUILD_ARGS="--platform ${CURRENT_PLATFORM} -f packages/opencode/Dockerfile -t ${FULL_IMAGE_NAME} --load"
fi

docker buildx build $BUILD_ARGS .

echo ""

# Step 4: Summary
echo -e "${GREEN}[4/4] Build complete!${NC}"
echo ""
echo -e "${GREEN}Successfully built: ${FULL_IMAGE_NAME}${NC}"
echo ""

if [ "$PUSH" = "true" ]; then
  echo "Image pushed to registry"
  echo ""
  echo "Pull and run with:"
  echo "  docker pull ${FULL_IMAGE_NAME}"
  echo "  docker run --rm ${FULL_IMAGE_NAME} --version"
else
  echo "Test the image with:"
  echo "  docker run --rm ${FULL_IMAGE_NAME} --version"
  echo ""
  echo "To push to registry, use:"
  echo "  docker push ${FULL_IMAGE_NAME}"
  echo "  or re-run with --push flag"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
