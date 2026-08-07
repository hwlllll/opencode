from __future__ import annotations

import hashlib
import json
import os
import re
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse


root = Path(os.getenv("DATA_DIR", "./data")).resolve()
releases = root / "releases"
latest = root / "latest"
token = os.getenv("API_TOKEN")
config = Path(os.getenv("CONFIG_PATH", "config.json")).resolve()
if not config.is_file():
    config = Path(__file__).resolve().parents[2] / "packService" / "config.json"
settings = json.loads(config.read_text()) if config.is_file() else {}
public = str(settings.get("download", "")).rstrip("/")
backend = str(settings.get("api", "")).rstrip("/")
limit = int(os.getenv("MAX_PACKAGE_BYTES", str(2 * 1024 * 1024 * 1024)))
versions = re.compile(r"^[0-9][0-9A-Za-z.+-]{0,63}$")
packages = re.compile(r"^dicode-[a-z0-9-]+\.(?:zip|tar\.gz)$")
templates = Path(__file__).parent / "templates"


@asynccontextmanager
async def lifespan(_: FastAPI):
    releases.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="Dicode Release Service",
    description="Dicode installation package publishing and update service",
    version="1.0.0",
    lifespan=lifespan,
)


async def auth(authorization: str | None = Header(default=None)) -> None:
    if not token:
        return
    if authorization == f"Bearer {token}":
        return
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid API token")


def version(value: str) -> str:
    value = value.removeprefix("v")
    if not versions.fullmatch(value):
        raise HTTPException(422, "invalid version")
    return value


def package(value: str) -> str:
    if not packages.fullmatch(value):
        raise HTTPException(422, "invalid package name")
    return value


def dir(value: str, exists: bool = True) -> Path:
    path = releases / version(value)
    if exists and not path.is_dir():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "release not found")
    return path


def load(value: str) -> dict:
    path = dir(value) / "release.json"
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "release metadata not found")
    return json.loads(path.read_text())


def save(path: Path, data: dict) -> None:
    temp = path.with_suffix(f"{path.suffix}.tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    temp.replace(path)


def base(request: Request) -> str:
    return public or str(request.base_url).rstrip("/")


def service(request: Request) -> str:
    return backend or base(request)


def installer(request: Request, name: str) -> str:
    return (
        templates.joinpath(name)
        .read_text()
        .replace("__DOWNLOAD_BASE_URL__", base(request))
        .replace("__DICODE_BASE_URL__", service(request))
    )


def manifest(request: Request, value: str) -> dict:
    data = load(value)
    if not data.get("published_at"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "release has not been published")
    url = base(request)
    assets = [
        {
            **asset,
            "browser_download_url": (
                f"{url}/dicode/pkg/{data['version']}/{quote(asset['name'])}"
            ),
        }
        for asset in sorted(data["assets"], key=lambda item: item["name"])
    ]
    return {
        "tag_name": data["version"],
        "name": data["version"],
        "published_at": data.get("published_at"),
        "assets": assets,
    }


def current() -> str:
    if not latest.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no release has been published")
    return version(latest.read_text().strip())


def info(value: str, name: str):
    data = load(value)
    asset = next((item for item in data["assets"] if item["name"] == name), None)
    if not asset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "package not found")
    path = dir(value) / name
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "package file not found")
    return path, asset


def available(value: str) -> None:
    if not load(value).get("published_at"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "release has not been published")


def headers(asset: dict) -> dict[str, str]:
    return {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'attachment; filename="{asset["name"]}"',
        "Content-Length": str(asset["size"]),
        "ETag": f'"{asset["digest"].removeprefix("sha256:")}"',
    }


def span(value: str, size: int) -> tuple[int, int]:
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip())
    if not match or (not match.group(1) and not match.group(2)):
        raise HTTPException(
            status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{size}"},
        )
    if not match.group(1):
        count = int(match.group(2))
        if count < 1:
            raise HTTPException(status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE)
        return max(size - count, 0), size - 1
    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else size - 1
    if start >= size or end < start:
        raise HTTPException(
            status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{size}"},
        )
    return start, min(end, size - 1)


@app.get("/health")
async def health():
    return {"status": "ok", "latest": latest.read_text().strip() if latest.is_file() else None}


@app.get("/costrict-cli/install.sh", response_class=PlainTextResponse, include_in_schema=False)
@app.get("/install.sh", response_class=PlainTextResponse)
async def shell(request: Request):
    return installer(request, "install.sh")


@app.get("/costrict-cli/install.bat", response_class=PlainTextResponse, include_in_schema=False)
@app.get("/install.bat", response_class=PlainTextResponse)
async def batch(request: Request):
    return installer(request, "install.bat")


@app.get("/costrict-cli/pkg/latest.json", include_in_schema=False)
@app.get("/dicode/pkg/latest.json")
async def get_latest(request: Request):
    return manifest(request, current())


@app.get("/costrict-cli/pkg/{value}/manifest.json", include_in_schema=False)
@app.get("/dicode/pkg/{value}/manifest.json")
async def get_manifest(request: Request, value: str):
    return manifest(request, version(value))


@app.get(
    "/costrict-cli/pkg/{value}/{name}.sha256",
    response_class=PlainTextResponse,
    include_in_schema=False,
)
@app.get("/dicode/pkg/{value}/{name}.sha256", response_class=PlainTextResponse)
async def checksum(value: str, name: str):
    available(version(value))
    name = package(name)
    _, asset = info(version(value), name)
    return f"{asset['digest'].removeprefix('sha256:')}  {name}\n"


@app.head("/costrict-cli/pkg/{value}/{name}", include_in_schema=False)
@app.head("/dicode/pkg/{value}/{name}")
async def head_package(value: str, name: str):
    available(version(value))
    name = package(name)
    _, asset = info(version(value), name)
    return Response(headers=headers(asset), media_type="application/octet-stream")


@app.get("/costrict-cli/pkg/{value}/{name}", include_in_schema=False)
@app.get("/dicode/pkg/{value}/{name}")
async def get_package(
    value: str,
    name: str,
    range: str | None = Header(default=None),
    if_none_match: str | None = Header(default=None),
):
    available(version(value))
    name = package(name)
    path, asset = info(version(value), name)
    result = headers(asset)
    if if_none_match == result["ETag"]:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": result["ETag"]})
    start, end = span(range, asset["size"]) if range else (0, asset["size"] - 1)
    if range:
        result["Content-Range"] = f"bytes {start}-{end}/{asset['size']}"
        result["Content-Length"] = str(end - start + 1)

    async def content():
        with path.open("rb") as source:
            source.seek(start)
            left = end - start + 1
            while left:
                chunk = source.read(min(1024 * 1024, left))
                if not chunk:
                    return
                left -= len(chunk)
                yield chunk

    return StreamingResponse(
        content(),
        status_code=status.HTTP_206_PARTIAL_CONTENT if range else status.HTTP_200_OK,
        media_type="application/octet-stream",
        headers=result,
    )


@app.get("/api/releases", dependencies=[Depends(auth)])
async def list_releases():
    items = [
        json.loads(path.read_text())
        for path in releases.glob("*/release.json")
        if path.is_file()
    ]
    return {
        "latest": latest.read_text().strip() if latest.is_file() else None,
        "releases": sorted(items, key=lambda item: item["created_at"], reverse=True),
    }


@app.get("/api/releases/{value}", dependencies=[Depends(auth)])
async def get_release(value: str):
    return load(version(value))


@app.put("/api/releases/{value}/assets/{name}", dependencies=[Depends(auth)])
async def upload(value: str, name: str, request: Request):
    value = version(value)
    name = package(name)
    path = dir(value, exists=False)
    path.mkdir(parents=True, exist_ok=True)
    target = path / name
    temp = path / f".{name}.upload"
    if target.exists():
        raise HTTPException(status.HTTP_409_CONFLICT, "package already exists")
    size = 0
    digest = hashlib.sha256()
    try:
        with temp.open("xb") as output:
            async for chunk in request.stream():
                size += len(chunk)
                if size > limit:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        "package is too large",
                    )
                digest.update(chunk)
                output.write(chunk)
        if not size:
            raise HTTPException(422, "empty package")
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    meta = path / "release.json"
    data = (
        json.loads(meta.read_text())
        if meta.is_file()
        else {
            "version": value,
            "created_at": datetime.now(UTC).isoformat(),
            "published_at": None,
            "assets": [],
        }
    )
    asset = {
        "name": name,
        "size": size,
        "digest": f"sha256:{digest.hexdigest()}",
    }
    data["assets"] = [item for item in data["assets"] if item["name"] != name] + [asset]
    save(meta, data)
    return JSONResponse(asset, status_code=status.HTTP_201_CREATED)


@app.post("/api/releases/{value}/publish", dependencies=[Depends(auth)])
async def publish(value: str):
    value = version(value)
    data = load(value)
    if not data["assets"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "release has no packages")
    if not data.get("published_at"):
        data["published_at"] = datetime.now(UTC).isoformat()
        save(dir(value) / "release.json", data)
    temp = latest.with_suffix(".tmp")
    temp.write_text(value + "\n")
    temp.replace(latest)
    return {"published": value}


@app.delete("/api/releases/{value}/assets/{name}", dependencies=[Depends(auth)])
async def remove_asset(value: str, name: str):
    value = version(value)
    name = package(name)
    data = load(value)
    if latest.is_file() and current() == value:
        raise HTTPException(status.HTTP_409_CONFLICT, "cannot modify the current release")
    path, _ = info(value, name)
    path.unlink()
    data["assets"] = [item for item in data["assets"] if item["name"] != name]
    save(dir(value) / "release.json", data)
    return {"deleted": name}


@app.delete("/api/releases/{value}", dependencies=[Depends(auth)])
async def remove_release(value: str):
    value = version(value)
    if latest.is_file() and current() == value:
        raise HTTPException(status.HTTP_409_CONFLICT, "cannot delete the current release")
    path = dir(value)
    for file in path.iterdir():
        file.unlink()
    path.rmdir()
    return {"deleted": value}
