const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const cors = require("cors")
const path = require("path")

const app = express()
const server = http.createServer(app)

// Configuração do CORS
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

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, "public")))

// Rota principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})

// Armazenar conexões e códigos de sincronização
const connections = new Map()
const syncCodes = new Map()

// Gerar código de sincronização de 6 dígitos
function generateSyncCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase()
}

// Sistema de gerenciamento
class SalesSystemServer {
  constructor() {
    this.products = [
      {
        id: 1,
        name: "iPhone 15 Pro Max",
        price: 15.90,
        cost: 10.25,
        category: "Smartphones",
        emoji: "📱",
        bestseller: true,
        barcode: "7898079670025",
      },
      {
        id: 2,
        name: "MacBook Pro M3",
        price: 12999.99,
        cost: 9500.0,
        category: "Notebooks",
        emoji: "💻",
        bestseller: true,
        barcode: "789123456002",
      },
      {
        id: 3,
        name: "AirPods Pro 2",
        price: 2499.99,
        cost: 1800.0,
        category: "Áudio",
        emoji: "🎧",
        bestseller: true,
        barcode: "789123456003",
      },
      {
        id: 4,
        name: "iPad Air M2",
        price: 4999.99,
        cost: 3600.0,
        category: "Tablets",
        emoji: "📱",
        barcode: "789123456004",
      },
      {
        id: 5,
        name: "Apple Watch Ultra",
        price: 6999.99,
        cost: 5000.0,
        category: "Wearables",
        emoji: "⌚",
        bestseller: true,
        barcode: "789123456005",
      },
      {
        id: 6,
        name: "Samsung Galaxy S24",
        price: 6999.99,
        cost: 5200.0,
        category: "Smartphones",
        emoji: "📱",
        barcode: "789123456006",
      },
      {
        id: 7,
        name: "Dell XPS 13",
        price: 8999.99,
        cost: 6800.0,
        category: "Notebooks",
        emoji: "💻",
        barcode: "789123456007",
      },
      {
        id: 8,
        name: "Sony WH-1000XM5",
        price: 1999.99,
        cost: 1400.0,
        category: "Áudio",
        emoji: "🎧",
        barcode: "789123456008",
      },
      {
        id: 9,
        name: "Nintendo Switch OLED",
        price: 2499.99,
        cost: 1900.0,
        category: "Games",
        emoji: "🎮",
        bestseller: true,
        barcode: "789123456009",
      },
      {
        id: 10,
        name: "GoPro Hero 12",
        price: 3499.99,
        cost: 2600.0,
        category: "Câmeras",
        emoji: "📷",
        barcode: "789123456010",
      },
      {
        id: 11,
        name: "Kindle Oasis",
        price: 1499.99,
        cost: 1100.0,
        category: "E-readers",
        emoji: "📚",
        barcode: "789123456011",
      },
      {
        id: 12,
        name: "Echo Dot 5ª Gen",
        price: 399.99,
        cost: 280.0,
        category: "Smart Home",
        emoji: "🔊",
        barcode: "789123456012",
      },
      {
        id: 13,
        name: "Ring Video Doorbell",
        price: 899.99,
        cost: 650.0,
        category: "Segurança",
        emoji: "🚪",
        barcode: "789123456013",
      },
      {
        id: 14,
        name: "Fitbit Charge 6",
        price: 1299.99,
        cost: 950.0,
        category: "Fitness",
        emoji: "⌚",
        barcode: "789123456014",
      },
      {
        id: 15,
        name: "Bose SoundLink",
        price: 799.99,
        cost: 580.0,
        category: "Áudio",
        emoji: "🔊",
        barcode: "789123456015",
      },
      {
        id: 16,
        name: "Logitech MX Master 3",
        price: 699.99,
        cost: 500.0,
        category: "Acessórios",
        emoji: "🖱️",
        barcode: "789123456016",
      },
      {
        id: 17,
        name: "Samsung 4K Monitor",
        price: 2999.99,
        cost: 2200.0,
        category: "Monitores",
        emoji: "🖥️",
        barcode: "789123456017",
      },
      {
        id: 18,
        name: "Razer Mechanical Keyboard",
        price: 1199.99,
        cost: 850.0,
        category: "Gaming",
        emoji: "⌨️",
        barcode: "789123456018",
      },
      {
        id: 19,
        name: "Anker PowerBank 20K",
        price: 299.99,
        cost: 200.0,
        category: "Acessórios",
        emoji: "🔋",
        barcode: "789123456019",
      },
      {
        id: 20,
        name: "Tesla Model Y Charger",
        price: 1999.99,
        cost: 1400.0,
        category: "Automotivo",
        emoji: "🚗",
        barcode: "789123456020",
      },
    ]

    this.setupSocketHandlers()
  }

  setupSocketHandlers() {
    io.on("connection", (socket) => {
      console.log(`🔗 Nova conexão: ${socket.id}`)

      // Gerar código de sincronização
      socket.on("generate-sync-code", (data) => {
        const code = generateSyncCode()
        const deviceData = {
          code,
          deviceType: data.deviceType,
          socketId: socket.id,
          timestamp: Date.now(),
        }

        syncCodes.set(code, deviceData)
        connections.set(socket.id, { ...deviceData, role: "mobile" })

        console.log(`📱 Código gerado: ${code} para dispositivo ${data.deviceType}`)
        socket.emit("sync-code-generated", { code, deviceType: data.deviceType })

        // Limpar código após 5 minutos
        setTimeout(
          () => {
            syncCodes.delete(code)
          },
          5 * 60 * 1000,
        )
      })

      // Desktop conectando com código
      socket.on("connect-with-code", (code) => {
        console.log(`💻 Desktop tentando conectar com código: ${code}`)

        const deviceData = syncCodes.get(code)
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
        connections.set(socket.id, {
          code,
          role: "desktop",
          connectedMobile: mobileSocketId,
          deviceType: deviceData.deviceType,
          cart: [],
          total: 0,
          discount: 0,
        })

        // Atualizar dados do mobile
        const mobileConnection = connections.get(mobileSocketId)
        if (mobileConnection) {
          mobileConnection.connectedDesktop = socket.id
        }

        console.log(`✅ Conexão estabelecida: Desktop ${socket.id} ↔ Mobile ${mobileSocketId}`)

        // Notificar ambos os dispositivos
        socket.emit("connection-success", {
          code,
          deviceType: deviceData.deviceType,
          products: this.products,
        })

        mobileSocket.emit("device-connected", {
          code,
          deviceType: deviceData.deviceType,
          connectedDevice: socket.id,
        })

        // Remover código usado
        syncCodes.delete(code)
      })

      // Produto escaneado pelo mobile
      socket.on("product-scanned", (data) => {
        const connection = connections.get(socket.id)
        if (!connection || !connection.connectedDesktop) {
          console.log("❌ Mobile não conectado a desktop")
          return
        }

        const desktopSocket = io.sockets.sockets.get(connection.connectedDesktop)
        if (desktopSocket) {
          // Buscar produto completo
          const product = this.products.find((p) => p.barcode === data.product.barcode || p.id === data.product.id)
          if (product) {
            console.log(`📦 Produto escaneado: ${product.name}`)
            desktopSocket.emit("product-scanned", { product })
          }
        }
      })

      // Aplicar desconto
      socket.on("apply-discount", (discount) => {
        const connection = connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          connection.discount = discount
          console.log(`💸 Desconto aplicado: ${discount}%`)
          socket.emit("discount-applied", { discount })
        }
      })

      // Calcular troco
      socket.on("calculate-change", (paidAmount) => {
        const connection = connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          const total = connection.total || 0
          const finalTotal = total * (1 - (connection.discount || 0) / 100)
          const change = paidAmount - finalTotal
          const insufficient = change < 0

          console.log(`💰 Troco calculado: R$ ${change.toFixed(2)}`)
          socket.emit("change-calculated", {
            paidAmount,
            finalTotal,
            change: Math.max(0, change),
            insufficient,
          })
        }
      })

      // Finalizar venda
      socket.on("finalize-sale", (saleData) => {
        const connection = connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          const sale = {
            id: Date.now().toString(),
            code: `VDA${Date.now().toString().slice(-6)}`,
            timestamp: new Date().toISOString(),
            ...saleData,
            items: saleData.items || [],
            profit: (saleData.finalTotal || 0) - (saleData.totalCost || 0),
          }

          console.log(`🎉 Venda finalizada: ${sale.code} - R$ ${sale.finalTotal?.toFixed(2)}`)

          socket.emit("sale-finalized", { sale })

          // Notificar mobile se conectado
          if (connection.connectedMobile) {
            const mobileSocket = io.sockets.sockets.get(connection.connectedMobile)
            if (mobileSocket) {
              mobileSocket.emit("sale-finalized", { sale })
            }
          }

          // Limpar carrinho
          connection.cart = []
          connection.total = 0
          connection.discount = 0
        }
      })

      // Remover item do carrinho
      socket.on("remove-item", (cartId) => {
        const connection = connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          console.log(`🗑️ Item removido: ${cartId}`)
          // Lógica para remover item seria implementada aqui
        }
      })

      // Desconectar todos os dispositivos
      socket.on("disconnect-all", () => {
        const connection = connections.get(socket.id)
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

        const connection = connections.get(socket.id)
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
            syncCodes.delete(connection.code)
          }
        }

        connections.delete(socket.id)
      })
    })
  }
}

// Inicializar sistema
const salesSystem = new SalesSystemServer()

// Rotas da API
app.get("/api/products", (req, res) => {
  res.json(salesSystem.products)
})

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: connections.size,
    message: "LOJA VIALLI - Backend funcionando perfeitamente!",
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
  console.log(`💻 Backend URL: https://backend-chat-2-033y.onrender.com`)
})

// Tratamento de erros
process.on("uncaughtException", (err) => {
  console.error("❌ Erro não capturado:", err)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promise rejeitada:", reason)
})

module.exports = app
