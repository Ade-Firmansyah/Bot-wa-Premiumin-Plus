import express from "express"
import QRCode from "qrcode"
import { log } from "../utils/helper.js"

let latestQR = null
let isConnected = false

export function setQR(qr) {
  if (qr !== latestQR) {
    latestQR = qr
    isConnected = false
    log("WEB", "QR login diperbarui")
  }
}

export function setConnected(connected) {
  isConnected = connected
  if (connected) latestQR = null
}

export function startWeb(port = 3000) {
  const app = express()

  app.get("/", async (_req, res) => {
    if (isConnected) {
      return res.send(renderPage({
        title: "Premiumin Plus - Connected",
        icon: "✅",
        heading: "Bot Terhubung",
        body: "WhatsApp bot aktif dan siap menerima pesan.",
        status: "Online"
      }))
    }

    if (!latestQR) {
      return res.send(renderPage({
        title: "Premiumin Plus - Waiting",
        icon: "⏳",
        heading: "Menunggu QR Code",
        body: "Bot sedang menyiapkan koneksi WhatsApp. Halaman akan refresh otomatis.",
        status: "Connecting",
        refresh: 5
      }))
    }

    try {
      const qrImage = await QRCode.toDataURL(latestQR, {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" }
      })

      return res.send(renderQrPage(qrImage))
    } catch (error) {
      log("WEB", `Gagal membuat QR: ${error.message}`)
      return res.status(500).send("Error generating QR code")
    }
  })

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      connected: isConnected,
      qr_available: Boolean(latestQR),
      memory_usage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    })
  })

  app.listen(port, () => {
    log("WEB", `Server aktif di http://localhost:${port}`)
  })
}

function baseStyles() {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 24px;
    }
    main {
      width: min(420px, 100%);
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 28px;
      background: #111827;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 12px; }
    h1 { font-size: 24px; margin: 0 0 10px; }
    p { color: #cbd5e1; line-height: 1.5; }
    .status {
      margin-top: 20px;
      padding: 12px;
      border-radius: 6px;
      background: #1e293b;
      color: #e2e8f0;
    }
    img {
      width: 280px;
      max-width: 100%;
      height: auto;
      padding: 12px;
      background: white;
      border-radius: 8px;
    }
  `
}

function renderPage({ title, icon, heading, body, status, refresh = 30 }) {
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="${refresh}">
    <style>${baseStyles()}</style>
  </head>
  <body>
    <main>
      <div class="icon">${icon}</div>
      <h1>${heading}</h1>
      <p>${body}</p>
      <div class="status">Status: ${status}</div>
    </main>
  </body>
</html>`
}

function renderQrPage(qrImage) {
  return `<!doctype html>
<html>
  <head>
    <title>Premiumin Plus - QR Login</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="30">
    <style>${baseStyles()}</style>
  </head>
  <body>
    <main>
      <div class="icon">🚀</div>
      <h1>Premiumin Plus</h1>
      <p>Buka WhatsApp, pilih Linked Devices, lalu scan QR ini.</p>
      <img src="${qrImage}" alt="WhatsApp login QR">
      <div class="status">QR refresh otomatis setiap 30 detik</div>
    </main>
  </body>
</html>`
}
