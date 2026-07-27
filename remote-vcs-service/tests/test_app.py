import hashlib
import importlib

import httpx
import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"


def load(tmp_path, monkeypatch, **env):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    import app.main

    return importlib.reload(app.main)


async def request(app, method, url, **kwargs):
    async with app.app.router.lifespan_context(app.app):
        transport = httpx.ASGITransport(app=app.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, url, **kwargs)


async def upload(app, value, name, content=b"package"):
    return await request(
        app,
        "PUT",
        f"/api/releases/{value}/assets/{name}",
        content=content,
    )


@pytest.mark.anyio
async def test_health_and_installers(tmp_path, monkeypatch):
    app = load(tmp_path, monkeypatch, PUBLIC_BASE_URL="https://download.example.com")
    response = await request(app, "GET", "/health")
    assert response.json() == {"status": "ok", "latest": None}

    shell = await request(app, "GET", "/install.sh")
    assert 'base=${DICODE_BASE_URL:-"https://download.example.com"}' in shell.text
    assert "${base}/dicode/pkg/latest.json" in shell.text
    assert "dicode upgrade" in shell.text
    assert "using baseline package" in shell.text
    assert "costrict" not in shell.text.lower()

    batch = await request(app, "GET", "/install.bat")
    assert "https://download.example.com" in batch.text
    assert "dicode upgrade" in batch.text
    assert "costrict" not in batch.text.lower()

    schema = await request(app, "GET", "/openapi.json")
    assert "costrict" not in schema.text.lower()
    assert (await request(app, "GET", "/costrict-cli/install.sh")).status_code == 200


@pytest.mark.anyio
async def test_admin_auth(tmp_path, monkeypatch):
    app = load(tmp_path, monkeypatch, API_TOKEN="secret")
    assert (await request(app, "GET", "/api/releases")).status_code == 401
    response = await request(
        app,
        "GET",
        "/api/releases",
        headers={"Authorization": "Bearer secret"},
    )
    assert response.status_code == 200
    assert (await request(app, "GET", "/install.sh")).status_code == 200


@pytest.mark.anyio
async def test_publish_and_download(tmp_path, monkeypatch):
    app = load(tmp_path, monkeypatch, PUBLIC_BASE_URL="https://download.example.com")
    content = b"0123456789"
    name = "dicode-linux-x64.tar.gz"
    response = await upload(app, "1.2.3", name, content)
    assert response.status_code == 201
    assert response.json()["digest"] == f"sha256:{hashlib.sha256(content).hexdigest()}"
    assert (await request(app, "GET", f"/dicode/pkg/1.2.3/{name}")).status_code == 404

    response = await request(app, "POST", "/api/releases/1.2.3/publish")
    assert response.json() == {"published": "1.2.3"}

    response = await request(app, "GET", "/dicode/pkg/latest.json")
    assert response.json()["tag_name"] == "1.2.3"
    assert response.json()["assets"][0]["browser_download_url"] == (
        f"https://download.example.com/dicode/pkg/1.2.3/{name}"
    )

    response = await request(app, "GET", f"/dicode/pkg/1.2.3/{name}.sha256")
    assert response.text.startswith(hashlib.sha256(content).hexdigest())

    response = await request(app, "GET", f"/dicode/pkg/1.2.3/{name}")
    assert response.content == content
    assert response.headers["accept-ranges"] == "bytes"

    response = await request(app, "HEAD", f"/dicode/pkg/1.2.3/{name}")
    assert response.status_code == 200
    assert response.headers["content-length"] == "10"

    response = await request(app, "GET", "/costrict-cli/pkg/latest.json")
    assert response.json()["tag_name"] == "1.2.3"

    response = await request(
        app,
        "GET",
        f"/dicode/pkg/1.2.3/{name}",
        headers={"Range": "bytes=2-5"},
    )
    assert response.status_code == 206
    assert response.content == b"2345"
    assert response.headers["content-range"] == "bytes 2-5/10"

    response = await request(
        app,
        "GET",
        f"/dicode/pkg/1.2.3/{name}",
        headers={"If-None-Match": f'"{hashlib.sha256(content).hexdigest()}"'},
    )
    assert response.status_code == 304


@pytest.mark.anyio
async def test_publish_rollback_and_delete(tmp_path, monkeypatch):
    app = load(tmp_path, monkeypatch)
    name = "dicode-windows-x64-baseline.zip"
    assert (await upload(app, "1.0.0", name)).status_code == 201
    assert (await request(app, "POST", "/api/releases/1.0.0/publish")).status_code == 200
    assert (await upload(app, "2.0.0", name)).status_code == 201
    assert (await request(app, "POST", "/api/releases/2.0.0/publish")).status_code == 200

    assert (await request(app, "POST", "/api/releases/1.0.0/publish")).status_code == 200
    response = await request(app, "GET", "/dicode/pkg/latest.json")
    assert response.json()["tag_name"] == "1.0.0"
    assert (await request(app, "DELETE", "/api/releases/1.0.0")).status_code == 409
    assert (await request(app, "DELETE", "/api/releases/2.0.0")).status_code == 200


@pytest.mark.anyio
async def test_rejects_invalid_upload(tmp_path, monkeypatch):
    app = load(tmp_path, monkeypatch)
    response = await upload(app, "bad/version", "payload.sh")
    assert response.status_code in {404, 422}
