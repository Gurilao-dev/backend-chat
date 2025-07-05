const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const cors = require("cors")
const path = require("path")

const app = express()
const server = http.createServer(app)

// Configuração do CORS mais permissiva
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true,
  },
  allowEIO3: true,
  transports: ["websocket", "polling"],
})

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["*"],
    credentials: true,
  }),
)

app.use(express.json())
app.use(express.static("public"))

// Servir arquivos estáticos
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Sistema de gerenciamento de conexões
class SalesSystemServer {
  constructor() {
    this.connections = new Map() // socketId -> connectionData
    this.syncCodes = new Map() // code -> deviceData
    this.sales = []
    this.connectedDevices = new Map() // code -> {desktop: socketId, mobile: socketId}

    this.setupSocketHandlers()
  }

  generateSyncCode() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let code = ""
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return code
  }

  setupSocketHandlers() {
    io.on("connection", (socket) => {
      console.log(`🔗 Nova conexão: ${socket.id}`)

      // Gerar código de sincronização para dispositivos móveis
      socket.on("generate-sync-code", (data) => {
        const code = this.generateSyncCode()
        const deviceData = {
          code,
          deviceType: data.deviceType,
          socketId: socket.id,
          timestamp: Date.now(),
        }

        this.syncCodes.set(code, deviceData)
        this.connections.set(socket.id, { ...deviceData, role: "mobile" })

        console.log(`📱 Código gerado: ${code} para dispositivo ${data.deviceType}`)
        socket.emit("sync-code-generated", { code, deviceType: data.deviceType })

        // Limpar código após 10 minutos
        setTimeout(
          () => {
            this.syncCodes.delete(code)
          },
          10 * 60 * 1000,
        )
      })

      // Desktop conectando com código
      socket.on("connect-with-code", (code) => {
        console.log(`💻 Desktop tentando conectar com código: ${code}`)

        const deviceData = this.syncCodes.get(code)
        if (!deviceData) {
          socket.emit("connection-error", "Código inválido ou expirado")
          return
        }

        // Conectar desktop e mobile
        const mobileSocketId = deviceData.socketId
        const mobileSocket = io.sockets.sockets.get(mobileSocketId)

        if (!mobileSocket) {
          socket.emit("connection-error", "Dispositivo móvel desconectado")
          return
        }

        // Estabelecer conexão
        this.connectedDevices.set(code, {
          desktop: socket.id,
          mobile: mobileSocketId,
          deviceType: deviceData.deviceType,
        })

        this.connections.set(socket.id, {
          code,
          role: "desktop",
          connectedMobile: mobileSocketId,
          deviceType: deviceData.deviceType,
        })

        // Atualizar dados do mobile
        const mobileConnection = this.connections.get(mobileSocketId)
        if (mobileConnection) {
          mobileConnection.connectedDesktop = socket.id
        }

        console.log(`✅ Conexão estabelecida: Desktop ${socket.id} ↔ Mobile ${mobileSocketId}`)

        // Notificar ambos os dispositivos
        socket.emit("connection-success", {
          code,
          deviceType: deviceData.deviceType,
          connectedDevice: mobileSocketId,
        })

        mobileSocket.emit("device-connected", {
          code,
          deviceType: deviceData.deviceType,
          connectedDevice: socket.id,
        })

        // Remover código usado
        this.syncCodes.delete(code)
      })

      // Produto escaneado pelo mobile
      socket.on("product-scanned", (data) => {
        const connection = this.connections.get(socket.id)
        if (!connection || !connection.connectedDesktop) {
          console.log("❌ Mobile não conectado a desktop")
          return
        }

        const desktopSocket = io.sockets.sockets.get(connection.connectedDesktop)
        if (desktopSocket) {
          console.log(`📦 Produto escaneado: ${data.product.name}`)
          desktopSocket.emit("product-scanned", data)
        }
      })

      // Aplicar desconto
      socket.on("apply-discount", (discount) => {
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          console.log(`💸 Desconto aplicado: ${discount}%`)
          socket.emit("discount-applied", { discount })
        }
      })

      // Calcular troco
      socket.on("calculate-change", (paidAmount) => {
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          // Simular cálculo (em uma aplicação real, você teria os dados do carrinho)
          const mockTotal = 100 // Valor mockado para demonstração
          const change = paidAmount - mockTotal
          const insufficient = change < 0

          console.log(`💰 Troco calculado: R$ ${change.toFixed(2)}`)
          socket.emit("change-calculated", {
            paidAmount,
            finalTotal: mockTotal,
            change: Math.max(0, change),
            insufficient,
          })
        }
      })

      // Finalizar venda
      socket.on("finalize-sale", (saleData) => {
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          const sale = {
            id: Date.now().toString(),
            code: `VDA${Date.now().toString().slice(-6)}`,
            timestamp: Date.now(),
            ...saleData,
            items: saleData.items || [],
            profit: saleData.finalTotal - (saleData.totalCost || 0),
          }

          this.sales.push(sale)
          console.log(`🎉 Venda finalizada: ${sale.code} - R$ ${sale.finalTotal.toFixed(2)}`)

          socket.emit("sale-finalized", { sale })

          // Notificar mobile se conectado
          if (connection.connectedMobile) {
            const mobileSocket = io.sockets.sockets.get(connection.connectedMobile)
            if (mobileSocket) {
              mobileSocket.emit("sale-finalized", { sale })
            }
          }
        }
      })

      // Remover item do carrinho
      socket.on("remove-item", (cartId) => {
        console.log(`🗑️ Item removido: ${cartId}`)
        // Lógica para remover item seria implementada aqui
      })

      // Desconectar todos os dispositivos
      socket.on("disconnect-all", () => {
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          console.log(`🔌 Desconectando todos os dispositivos do desktop ${socket.id}`)

          // Encontrar e desconectar mobile conectado
          if (connection.connectedMobile) {
            const mobileSocket = io.sockets.sockets.get(connection.connectedMobile)
            if (mobileSocket) {
              mobileSocket.emit("device-disconnected")
              mobileSocket.disconnect()
            }
          }
        }
      })

      // Desconexão
      socket.on("disconnect", () => {
        console.log(`🔌 Desconexão: ${socket.id}`)

        const connection = this.connections.get(socket.id)
        if (connection) {
          // Notificar dispositivo conectado sobre a desconexão
          if (connection.role === "desktop" && connection.connectedMobile) {
            const mobileSocket = io.sockets.sockets.get(connection.connectedMobile)
            if (mobileSocket) {
              mobileSocket.emit("device-disconnected")
            }
          } else if (connection.role === "mobile" && connection.connectedDesktop) {
            const desktopSocket = io.sockets.sockets.get(connection.connectedDesktop)
            if (desktopSocket) {
              desktopSocket.emit("device-disconnected")
            }
          }

          // Limpar código de sincronização se existir
          if (connection.code) {
            this.syncCodes.delete(connection.code)
            this.connectedDevices.delete(connection.code)
          }
        }

        this.connections.delete(socket.id)
      })
    })
  }

  // Métodos de API REST para estatísticas
  getStats() {
    return {
      totalSales: this.sales.length,
      totalRevenue: this.sales.reduce((sum, sale) => sum + sale.finalTotal, 0),
      totalProfit: this.sales.reduce((sum, sale) => sum + sale.profit, 0),
      connectedDevices: this.connections.size,
      activeCodes: this.syncCodes.size,
    }
  }
}

// Inicializar sistema
const salesSystem = new SalesSystemServer()

// Rotas da API
app.get("/api/stats", (req, res) => {
  res.json(salesSystem.getStats())
})

app.get("/api/sales", (req, res) => {
  res.json(salesSystem.sales)
})

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: salesSystem.connections.size,
  })
})

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error("❌ Erro no servidor:", err.stack)
  res.status(500).json({ error: "Erro interno do servidor" })
})

// Iniciar servidor
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🚀 LOJA VIALLI - Servidor rodando na porta ${PORT}`)
  console.log(`🌐 Acesse: http://localhost:${PORT}`)
  console.log(`📱 Sistema de vendas profissional ativo!`)
})

// Tratamento de erros não capturados
process.on("uncaughtException", (err) => {
  console.error("❌ Erro não capturado:", err)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promise rejeitada:", reason)
})

module.exports = app
