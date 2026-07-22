import { loadDevice, getCloudBaseUrl } from "./client"
import { assignGateway, clearGatewayCache } from "./gateway"
import { Log } from "../../util/log"
import net from "net"

const log = Log.create({ service: "device-tunnel" })

const INITIAL_DELAY = 1000
const MAX_DELAY = 60000
const INITIAL_WINDOW = 256 * 1024
const WS_PING_INTERVAL = 20_000
const WS_PING_TIMEOUT = 10_000
const WS_CONNECT_TIMEOUT = 15_000

const TYPE_DATA = 0
const TYPE_WINDOW_UPDATE = 1
const TYPE_PING = 2
const TYPE_GO_AWAY = 3

const FLAG_SYN = 0x1
const FLAG_ACK = 0x2
const FLAG_FIN = 0x4
const FLAG_RST = 0x8

function buildFrame(type: number, flags: number, streamId: number, payload: Buffer): Buffer {
  const header = Buffer.allocUnsafe(12)
  header[0] = 0
  header[1] = type
  header.writeUInt16BE(flags, 2)
  header.writeUInt32BE(streamId, 4)
  header.writeUInt32BE(payload.length, 8)
  return payload.length > 0 ? Buffer.concat([header, payload]) : header
}

function buildHeader(type: number, flags: number, streamId: number, length: number): Buffer {
  const buf = Buffer.allocUnsafe(12)
  buf[0] = 0
  buf[1] = type
  buf.writeUInt16BE(flags, 2)
  buf.writeUInt32BE(streamId, 4)
  buf.writeUInt32BE(length, 8)
  return buf
}

class YamuxStream {
  readonly id: number
  private session: YamuxSession
  private chunks: Buffer[] = []
  private resolvers: ((chunk: Buffer | null) => void)[] = []
  private ended = false

  constructor(id: number, session: YamuxSession) {
    this.id = id
    this.session = session
  }

  push(data: Buffer) {
    if (this.resolvers.length > 0) {
      this.resolvers.shift()!(data)
    } else {
      this.chunks.push(data)
    }
  }

  end() {
    this.ended = true
    for (const resolve of this.resolvers) resolve(null)
    this.resolvers = []
  }

  read(): Promise<Buffer | null> {
    if (this.chunks.length > 0) return Promise.resolve(this.chunks.shift()!)
    if (this.ended) return Promise.resolve(null)
    return new Promise((resolve) => this.resolvers.push(resolve))
  }

  async write(data: Buffer) {
    await this.session.sendData(this.id, data)
  }

  close() {
    this.session.sendFin(this.id)
  }
}

class YamuxSession {
  private ws: WebSocket
  private streams = new Map<number, YamuxStream>()
  private buf = Buffer.alloc(0)
  private queue: YamuxStream[] = []
  private waiters: ((stream: YamuxStream) => void)[] = []
  private closed = false
  private closeResolvers: (() => void)[] = []
  private sendWindows = new Map<number, number>()
  private windowWaiters = new Map<number, (() => void)[]>()

  constructor(ws: WebSocket) {
    this.ws = ws
    ws.binaryType = "arraybuffer"
    ws.onmessage = (e) => this.onMessage(Buffer.from(e.data as ArrayBuffer))
    ws.onclose = () => this.onClose()
    ws.onerror = (e) => {
      log.warn("websocket error", { error: String(e) })
      this.onClose()
    }
    this.startPingLoop()
  }

  private lastPong = Date.now()

  private startPingLoop() {
    const interval = setInterval(() => {
      if (this.closed) {
        clearInterval(interval)
        return
      }
      if (Date.now() - this.lastPong > WS_PING_INTERVAL + WS_PING_TIMEOUT) {
        log.warn("websocket ping timeout, closing session")
        this.onClose()
        try { this.ws.close() } catch {}
        clearInterval(interval)
        return
      }
      try {
        this.ws.send(buildHeader(TYPE_PING, FLAG_SYN, 0, 0))
      } catch (e) {
        log.warn("websocket ping send failed", { error: String(e) })
        this.onClose()
        clearInterval(interval)
      }
    }, WS_PING_INTERVAL)
  }

  accept(): Promise<YamuxStream> {
    if (this.queue.length > 0) return Promise.resolve(this.queue.shift()!)
    if (this.closed) return Promise.reject(new Error("session closed"))
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  waitClose(): Promise<void> {
    if (this.closed) return Promise.resolve()
    return new Promise((resolve) => this.closeResolvers.push(resolve))
  }

  async sendData(streamId: number, data: Buffer) {
    if (this.closed) return
    let offset = 0
    while (offset < data.length) {
      while (true) {
        const win = this.sendWindows.get(streamId) ?? 0
        if (win > 0) break
        await new Promise<void>((resolve) => {
          const list = this.windowWaiters.get(streamId) ?? []
          list.push(resolve)
          this.windowWaiters.set(streamId, list)
        })
        if (this.closed) return
      }
      const win = this.sendWindows.get(streamId)!
      const chunk = data.subarray(offset, offset + Math.min(win, data.length - offset))
      this.sendWindows.set(streamId, win - chunk.length)
      offset += chunk.length
      this.ws.send(buildFrame(TYPE_DATA, 0, streamId, chunk))
    }
  }

  sendWindowUpdate(streamId: number, delta: number) {
    if (this.closed) return
    this.ws.send(buildHeader(TYPE_WINDOW_UPDATE, 0, streamId, delta))
  }

  sendFin(streamId: number) {
    if (this.closed) return
    this.ws.send(buildHeader(TYPE_DATA, FLAG_FIN, streamId, 0))
    this.streams.delete(streamId)
  }

  close() {
    this.ws.close()
  }

  private onMessage(data: Buffer) {
    this.buf = Buffer.concat([this.buf, data])
    while (this.buf.length >= 12) {
      const type = this.buf[1]
      const flags = this.buf.readUInt16BE(2)
      const streamId = this.buf.readUInt32BE(4)
      const length = this.buf.readUInt32BE(8)
      const payloadLen = type === TYPE_WINDOW_UPDATE || type === TYPE_PING ? 0 : length
      if (this.buf.length < 12 + payloadLen) break
      const payload = this.buf.slice(12, 12 + payloadLen)
      this.buf = this.buf.slice(12 + payloadLen)
      this.handleFrame(type, flags, streamId, length, payload)
    }
  }

  private handleFrame(type: number, flags: number, streamId: number, length: number, payload: Buffer) {
    if (type === TYPE_PING) {
      if (flags & FLAG_ACK) {
        this.lastPong = Date.now()
      } else if (flags & FLAG_SYN) {
        const val = payload.length >= 4 ? payload.readUInt32BE(0) : 0
        this.ws.send(buildHeader(TYPE_PING, FLAG_ACK, 0, val))
      }
      return
    }

    if (type === TYPE_GO_AWAY) {
      this.onClose()
      return
    }

    if (type === TYPE_DATA || type === TYPE_WINDOW_UPDATE) {
      if (flags & FLAG_SYN) {
        const stream = new YamuxStream(streamId, this)
        this.streams.set(streamId, stream)
        this.sendWindows.set(streamId, INITIAL_WINDOW)
        this.ws.send(buildHeader(TYPE_DATA, FLAG_ACK, streamId, 0))
        this.ws.send(buildHeader(TYPE_WINDOW_UPDATE, 0, streamId, INITIAL_WINDOW))
        if (payload.length > 0) stream.push(payload)
        if (this.waiters.length > 0) {
          this.waiters.shift()!(stream)
        } else {
          this.queue.push(stream)
        }
        return
      }

      const stream = this.streams.get(streamId)
      if (!stream) return

      if (type === TYPE_WINDOW_UPDATE) {
        const delta = length
        const cur = this.sendWindows.get(streamId) ?? 0
        this.sendWindows.set(streamId, cur + delta)
        const waiters = this.windowWaiters.get(streamId)
        if (waiters?.length) {
          this.windowWaiters.set(streamId, [])
          for (const resolve of waiters) resolve()
        }
      }

      if (type === TYPE_DATA && payload.length > 0) {
        stream.push(payload)
        this.ws.send(buildHeader(TYPE_WINDOW_UPDATE, 0, streamId, payload.length))
      }

      if (flags & FLAG_FIN) {
        stream.end()
        this.streams.delete(streamId)
      }

      if (flags & FLAG_RST) {
        stream.end()
        this.streams.delete(streamId)
      }
    }
  }

  private onClose() {
    if (this.closed) return
    this.closed = true
    for (const stream of this.streams.values()) stream.end()
    this.streams.clear()
    for (const waiter of this.waiters) waiter(new YamuxStream(-1, this))
    this.waiters = []
    for (const resolve of this.closeResolvers) resolve()
    this.closeResolvers = []
  }
}

async function readHTTPRequest(stream: YamuxStream): Promise<{ method: string; path: string; headers: Record<string, string>; body: Buffer } | null> {
  let raw = Buffer.alloc(0)

  while (true) {
    const chunk = await stream.read()
    if (!chunk) return null
    raw = Buffer.concat([raw, chunk])
    const sep = raw.indexOf("\r\n\r\n")
    if (sep === -1) continue

    const headerSection = raw.slice(0, sep).toString("utf-8")
    let body = raw.slice(sep + 4)

    const lines = headerSection.split("\r\n")
    const [method, path] = lines[0].split(" ")
    const headers: Record<string, string> = {}
    for (const line of lines.slice(1)) {
      const idx = line.indexOf(": ")
      if (idx === -1) continue
      headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2)
    }

    const contentLength = parseInt(headers["content-length"] ?? "-1", 10)
    if (contentLength >= 0) {
      while (body.length < contentLength) {
        const more = await stream.read()
        if (!more) break
        body = Buffer.concat([body, more])
      }
      body = body.slice(0, contentLength)
    } else if (headers["transfer-encoding"]?.toLowerCase().includes("chunked")) {
      const chunks: Buffer[] = []
      while (true) {
        while (!body.includes(0x0a)) {
          const more = await stream.read()
          if (!more) break
          body = Buffer.concat([body, more])
        }
        const lineEnd = body.indexOf(0x0a)
        const sizeLine = body.slice(0, lineEnd).toString().replace(/\r/, "").trim()
        body = body.slice(lineEnd + 1)
        const chunkSize = parseInt(sizeLine, 16)
        if (isNaN(chunkSize) || chunkSize === 0) break
        while (body.length < chunkSize + 2) {
          const more = await stream.read()
          if (!more) break
          body = Buffer.concat([body, more])
        }
        chunks.push(body.slice(0, chunkSize))
        body = body.slice(chunkSize + 2)
      }
      body = Buffer.concat(chunks)
    }

    return { method, path, headers, body }
  }
}

function statusText(code: number): string {
  const map: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  }
  return map[code] ?? "Unknown"
}

async function handleWebSocketStream(stream: YamuxStream, req: { method: string; path: string; headers: Record<string, string>; body: Buffer }, localPort: number) {
  const socket = net.createConnection(localPort, "127.0.0.1")

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve)
    socket.once("error", reject)
  })

  let rawReq = `${req.method} ${req.path} HTTP/1.1\r\nHost: 127.0.0.1:${localPort}\r\n`
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === "host") continue
    rawReq += `${k}: ${v}\r\n`
  }
  rawReq += "\r\n"
  socket.write(rawReq)

  // Read socket data with backpressure: pause socket while waiting for yamux window
  const socketToStream = async () => {
    let headerBuf = Buffer.alloc(0)
    let headerDone = false

    for await (const chunk of socket as AsyncIterable<Buffer>) {
      if (!headerDone) {
        headerBuf = Buffer.concat([headerBuf, chunk])
        const sep = headerBuf.indexOf("\r\n\r\n")
        if (sep === -1) continue
        headerDone = true
        const headerSection = headerBuf.slice(0, sep + 4)
        const rest = headerBuf.slice(sep + 4)
        await stream.write(headerSection)
        if (rest.length > 0) await stream.write(rest)
      } else {
        await stream.write(chunk)
      }
    }
    stream.close()
  }

  const streamToSocket = async () => {
    while (true) {
      const chunk = await stream.read()
      if (!chunk) break
      socket.write(chunk)
    }
    socket.destroy()
  }

  socket.on("error", () => stream.close())

  await Promise.race([socketToStream(), streamToSocket()]).catch(() => {})
}

async function handleHTTPStream(stream: YamuxStream, req: { method: string; path: string; headers: Record<string, string>; body: Buffer }, localPort: number) {
  const socket = net.createConnection(localPort, "127.0.0.1")

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve)
    socket.once("error", reject)
  })

  let rawReq = `${req.method} ${req.path} HTTP/1.1\r\nHost: 127.0.0.1:${localPort}\r\n`
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === "host") continue
    if (k === "connection") continue
    if (k === "transfer-encoding") continue
    if (k === "content-length") continue
    rawReq += `${k}: ${v}\r\n`
  }
  if (req.body.length > 0) {
    rawReq += `content-length: ${req.body.length}\r\n`
  }
  rawReq += "\r\n"
  socket.write(rawReq)
  if (req.body.length > 0) {
    socket.write(req.body)
  }

  const socketToStream = async () => {
    for await (const chunk of socket as AsyncIterable<Buffer>) {
      await stream.write(chunk)
    }
    stream.close()
  }

  const streamToSocket = async () => {
    while (true) {
      const chunk = await stream.read()
      if (!chunk) break
      socket.write(chunk)
    }
    socket.end()
  }

  socket.on("error", () => stream.close())

  await Promise.race([socketToStream(), streamToSocket()]).catch(() => {})
}

async function handleStream(stream: YamuxStream, localPort: number) {
  const req = await readHTTPRequest(stream)
  if (!req) {
    stream.close()
    return
  }

  if (req.headers["upgrade"]?.toLowerCase() === "websocket") {
    log.debug("proxy ws →", { method: req.method, path: req.path })
    await handleWebSocketStream(stream, req, localPort)
    return
  }

  log.debug("proxy http →", { method: req.method, path: req.path, body: req.body.length })
  await handleHTTPStream(stream, req, localPort)
}

async function runSession(gatewayURL: string, deviceId: string, deviceToken: string, localPort: number): Promise<void> {
  const wsURL = `${gatewayURL.replace(/^http/, "ws")}/device/${deviceId}/tunnel?token=${encodeURIComponent(deviceToken)}`
  log.info("connecting tunnel", { wsURL: wsURL.replace(/token=[^&]+/, "token=***") })

  const ws = new WebSocket(wsURL)
  const session = new YamuxSession(ws)

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.close() } catch {}
      reject(new Error("ws connect timeout"))
    }, WS_CONNECT_TIMEOUT)
    ws.onopen = () => { clearTimeout(timer); resolve() }
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error(`ws connect failed: ${e}`)) }
    ws.onclose = () => { clearTimeout(timer); reject(new Error("ws closed before open")) }
  })

  log.info("tunnel connected", { deviceId })

  const loop = async () => {
    while (true) {
      const stream = await session.accept()
      if (stream.id === -1) break
      handleStream(stream, localPort).catch((e) =>
        log.warn("stream handler error", { error: e.message }),
      )
    }
  }

  await Promise.race([loop(), session.waitClose()])
  session.close()
}

export async function connect(localPort: number): Promise<void> {
  let attempt = 0

  while (true) {
    const device = await loadDevice()
    if (!device) {
      log.error("device not registered, cannot connect tunnel")
      return
    }

    const override = getCloudBaseUrl()
    if (override) device.base_url = override

    log.info("connecting to gateway tunnel", { attempt, device_id: device.device_id, base_url: device.base_url })

    try {
      clearGatewayCache()
      const gatewayURL = await assignGateway(device)
      await runSession(gatewayURL, device.device_id, device.device_token, localPort)
      // session was established then closed gracefully — reset backoff
      log.info("tunnel session ended, reconnecting", { attempt })
      attempt = 0
      await new Promise<void>((resolve) => setTimeout(resolve, INITIAL_DELAY))
    } catch (e: any) {
      log.warn("tunnel disconnected", { error: e.message })
      const delay = Math.min(INITIAL_DELAY * Math.pow(2, attempt), MAX_DELAY)
      attempt++
      log.info("reconnecting after delay", { delay, attempt })
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
}
