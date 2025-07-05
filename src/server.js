const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const path = require("path")
const { v4: uuidv4 } = require("uuid")

const app = express()
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true,
  },
})

// Middleware CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
  if (req.method === "OPTIONS") {
    res.sendStatus(200)
  } else {
    next()
  }
})

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname)))

// Armazenar conexões e códigos de sincronização
const connections = new Map()
const syncCodes = new Map()
const deviceTypes = new Map()

// Produtos com códigos de barras predefinidos
const products = [
  {
    id: 1,
    name: "iPhone 15 Pro Max",
    price: 8999.99,
    cost: 6500.0,
    category: "Smartphones",
    emoji: "📱",
    bestseller: true,
    barcode: "789123456001",
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

// Armazenar vendas
const sales = new Map()

io.on("connection", (socket) => {
  console.log("Novo cliente conectado:", socket.id)

  // Gerar código de sincronização para diferentes tipos de dispositivos
  socket.on("generate-sync-code", (data) => {
    const code = data.code || Math.random().toString(36).substring(2, 8).toUpperCase()
    const deviceType = data.deviceType || "sync"

    syncCodes.set(code, socket.id)
    deviceTypes.set(socket.id, deviceType)
    connections.set(socket.id, {
      type: "mobile",
      deviceType: deviceType,
      code,
      paired: false,
    })

    socket.emit("sync-code-generated", { code, deviceType })
    console.log(`Código ${deviceType} gerado:`, code, "para socket:", socket.id)
  })

  // Conectar dispositivo desktop usando código
  socket.on("connect-with-code", (code) => {
    const mobileSocketId = syncCodes.get(code)

    if (mobileSocketId && connections.has(mobileSocketId)) {
      const mobileConnection = connections.get(mobileSocketId)

      if (!mobileConnection.paired) {
        // Atualizar conexões
        connections.set(socket.id, {
          type: "desktop",
          code,
          pairedWith: mobileSocketId,
          cart: [],
          total: 0,
          totalCost: 0,
          discount: 0,
        })

        connections.set(mobileSocketId, {
          ...mobileConnection,
          paired: true,
          pairedWith: socket.id,
        })

        // Notificar ambos os dispositivos
        socket.emit("connection-success", { products })
        io.to(mobileSocketId).emit("device-connected", {
          code,
          deviceType: mobileConnection.deviceType,
        })

        console.log("Dispositivos pareados:", socket.id, "e", mobileSocketId)
      } else {
        socket.emit("connection-error", "Código já está em uso")
      }
    } else {
      socket.emit("connection-error", "Código inválido")
    }
  })

  // Produto escaneado pelo scanner
  socket.on("product-scanned", (data) => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "mobile" && connection.paired) {
      const desktopSocketId = connection.pairedWith
      const desktopConnection = connections.get(desktopSocketId)

      if (desktopConnection) {
        const product = products.find((p) => p.barcode === data.product.barcode || p.id === data.product.id)

        if (product) {
          const cartItem = {
            ...product,
            quantity: 1,
            cartId: uuidv4(),
          }

          desktopConnection.cart.push(cartItem)
          desktopConnection.total = desktopConnection.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
          desktopConnection.totalCost = desktopConnection.cart.reduce((sum, item) => sum + item.cost * item.quantity, 0)

          // Atualizar carrinho no desktop
          io.to(desktopSocketId).emit("product-scanned", { product })

          console.log("Produto escaneado adicionado:", product.name)
        }
      }
    }
  })

  // Adicionar item ao carrinho (método alternativo)
  socket.on("add-item", (data) => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "mobile" && connection.paired) {
      const desktopSocketId = connection.pairedWith
      const desktopConnection = connections.get(desktopSocketId)

      if (desktopConnection) {
        const product = data.product || products[Math.floor(Math.random() * products.length)]
        const cartItem = {
          ...product,
          quantity: 1,
          cartId: uuidv4(),
        }

        desktopConnection.cart.push(cartItem)
        desktopConnection.total = desktopConnection.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
        desktopConnection.totalCost = desktopConnection.cart.reduce((sum, item) => sum + item.cost * item.quantity, 0)

        // Atualizar carrinho no desktop
        io.to(desktopSocketId).emit("cart-updated", {
          cart: desktopConnection.cart,
          total: desktopConnection.total,
          totalCost: desktopConnection.totalCost,
        })

        console.log("Item adicionado:", product.name)
      }
    }
  })

  // Remover item do carrinho
  socket.on("remove-item", (cartId) => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "desktop") {
      connection.cart = connection.cart.filter((item) => item.cartId !== cartId)
      connection.total = connection.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
      connection.totalCost = connection.cart.reduce((sum, item) => sum + item.cost * item.quantity, 0)

      socket.emit("cart-updated", {
        cart: connection.cart,
        total: connection.total,
        totalCost: connection.totalCost,
      })
    }
  })

  // Aplicar desconto
  socket.on("apply-discount", (discountPercent) => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "desktop") {
      connection.discount = Math.max(0, Math.min(100, discountPercent))

      socket.emit("discount-applied", {
        discount: connection.discount,
        total: connection.total,
        discountedTotal: connection.total * (1 - connection.discount / 100),
      })
    }
  })

  // Calcular troco
  socket.on("calculate-change", (paidAmount) => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "desktop") {
      const finalTotal = connection.total * (1 - connection.discount / 100)
      const change = paidAmount - finalTotal

      socket.emit("change-calculated", {
        paidAmount,
        finalTotal,
        change: change >= 0 ? change : 0,
        insufficient: change < 0,
      })
    }
  })

  // Finalizar venda
  socket.on("finalize-sale", (saleData) => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "desktop") {
      const saleId = uuidv4()
      const totalProfit = connection.total - connection.totalCost
      const sale = {
        id: saleId,
        items: connection.cart,
        subtotal: connection.total,
        totalCost: connection.totalCost,
        discount: connection.discount,
        finalTotal: connection.total * (1 - connection.discount / 100),
        profit: totalProfit * (1 - connection.discount / 100),
        paidAmount: saleData.paidAmount,
        change: saleData.change,
        timestamp: new Date().toISOString(),
        code: saleId.substring(0, 8).toUpperCase(),
      }

      sales.set(saleId, sale)

      // Limpar carrinho
      connection.cart = []
      connection.total = 0
      connection.totalCost = 0
      connection.discount = 0

      socket.emit("sale-finalized", {
        saleCode: sale.code,
        sale,
      })

      socket.emit("cart-updated", {
        cart: connection.cart,
        total: connection.total,
        totalCost: connection.totalCost,
      })

      console.log("Venda finalizada:", sale.code)
    }
  })

  // Consultar venda
  socket.on("lookup-sale", (saleCode) => {
    const sale = Array.from(sales.values()).find((s) => s.code === saleCode)

    if (sale) {
      socket.emit("sale-found", sale)
    } else {
      socket.emit("sale-not-found")
    }
  })

  // Desconectar todos os dispositivos
  socket.on("disconnect-all", () => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "desktop") {
      // Notificar todos os dispositivos móveis pareados
      connections.forEach((conn, socketId) => {
        if (conn.type === "mobile" && conn.pairedWith === socket.id) {
          io.to(socketId).emit("device-disconnected")
          connections.delete(socketId)
        }
      })

      // Limpar códigos de sincronização
      syncCodes.clear()
      deviceTypes.clear()
    }
  })

  // Desconexão
  socket.on("disconnect", () => {
    const connection = connections.get(socket.id)

    if (connection) {
      // Se for móvel, remover código de sincronização
      if (connection.type === "mobile" && connection.code) {
        syncCodes.delete(connection.code)
        deviceTypes.delete(socket.id)
      }

      // Notificar dispositivo pareado
      if (connection.pairedWith) {
        io.to(connection.pairedWith).emit("device-disconnected")
        connections.delete(connection.pairedWith)
      }

      connections.delete(socket.id)
    }

    console.log("Cliente desconectado:", socket.id)
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT\
