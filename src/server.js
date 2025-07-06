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
app.get("/", (req, res) => {
  res.send("LOJA VIALLI - Backend funcionando!")
})

// Sistema de gerenciamento
class SalesSystemServer {
  constructor() {
    this.connections = new Map() // socketId -> connectionData
    this.syncCodes = new Map() // code -> deviceData
    this.sales = []
    this.products = [
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

  generateProductId() {
    return Math.max(...this.products.map((p) => p.id), 0) + 1
  }

  getCategoryEmoji(category) {
    const emojiMap = {
      Smartphones: "📱",
      Notebooks: "💻",
      Áudio: "🎧",
      Tablets: "📱",
      Wearables: "⌚",
      Games: "🎮",
      Câmeras: "📷",
      "E-readers": "📚",
      "Smart Home": "🔊",
      Segurança: "🚪",
      Fitness: "⌚",
      Acessórios: "🔋",
      Monitores: "🖥️",
      Gaming: "⌨️",
      Automotivo: "🚗",
    }
    return emojiMap[category] || "📦"
  }

  setupSocketHandlers() {
    io.on("connection", (socket) => {
      console.log(`🔗 Nova conexão: ${socket.id}`)

      // Gerar código de sincronização
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
        this.connections.set(socket.id, {
          code,
          role: "desktop",
          connectedMobile: mobileSocketId,
          deviceType: deviceData.deviceType,
          cart: [],
          total: 0,
          discount: 0,
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
          products: this.products,
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
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          connection.discount = discount
          console.log(`💸 Desconto aplicado: ${discount}%`)
          socket.emit("discount-applied", { discount })
        }
      })

      // Calcular troco
      socket.on("calculate-change", (paidAmount) => {
        const connection = this.connections.get(socket.id)
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
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          const sale = {
            id: Date.now().toString(),
            code: `VDA${Date.now().toString().slice(-6)}`,
            timestamp: new Date().toISOString(),
            ...saleData,
            items: saleData.items || [],
            profit: (saleData.finalTotal || 0) - (saleData.totalCost || 0),
          }

          this.sales.push(sale)
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

      // Adicionar novo produto
      socket.on("add-new-product", (productData) => {
        console.log(`📦 Tentativa de cadastro de produto: ${productData.name}`)

        // Validar dados do produto
        if (!productData.name || !productData.price || !productData.category || !productData.barcode) {
          socket.emit("product-add-error", "Dados do produto incompletos")
          return
        }

        // Verificar se código de barras já existe
        const existingProduct = this.products.find((p) => p.barcode === productData.barcode)
        if (existingProduct) {
          socket.emit("product-add-error", `Código de barras já existe no produto: ${existingProduct.name}`)
          return
        }

        // Criar novo produto
        const newProduct = {
          id: this.generateProductId(),
          name: productData.name,
          price: Number.parseFloat(productData.price),
          cost: Number.parseFloat(productData.cost) || 0,
          category: productData.category,
          bestseller: productData.bestseller || false,
          barcode: productData.barcode,
          emoji: this.getCategoryEmoji(productData.category),
          createdAt: new Date().toISOString(),
          createdBy: socket.id,
        }

        // Adicionar à lista de produtos
        this.products.push(newProduct)

        console.log(`✅ Produto cadastrado: ${newProduct.name} - ID: ${newProduct.id}`)

        // Notificar o dispositivo que cadastrou
        socket.emit("product-added", {
          product: newProduct,
          message: "Produto cadastrado com sucesso!",
        })

        // Notificar todos os dispositivos conectados sobre o novo produto
        io.emit("product-list-updated", {
          products: this.products,
          newProduct: newProduct,
        })
      })

      // Obter lista de produtos
      socket.on("get-products", () => {
        socket.emit("products-list", { products: this.products })
      })

      // Buscar produto por código de barras
      socket.on("search-product-by-barcode", (barcode) => {
        const product = this.products.find((p) => p.barcode === barcode)
        socket.emit("product-search-result", {
          barcode,
          product: product || null,
          found: !!product,
        })
      })

      // Remover item do carrinho
      socket.on("remove-item", (cartId) => {
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          console.log(`🗑️ Item removido: ${cartId}`)
          // Lógica para remover item seria implementada aqui
        }
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
          }
        }

        this.connections.delete(socket.id)
      })
    })
  }

  // Métodos de API REST
  getStats() {
    return {
      totalSales: this.sales.length,
      totalRevenue: this.sales.reduce((sum, sale) => sum + (sale.finalTotal || 0), 0),
      totalProfit: this.sales.reduce((sum, sale) => sum + (sale.profit || 0), 0),
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

app.get("/api/products", (req, res) => {
  res.json(salesSystem.products)
})

app.post("/api/products", (req, res) => {
  const productData = req.body

  // Validar dados
  if (!productData.name || !productData.price || !productData.category || !productData.barcode) {
    return res.status(400).json({ error: "Dados do produto incompletos" })
  }

  // Verificar se código de barras já existe
  const existingProduct = salesSystem.products.find((p) => p.barcode === productData.barcode)
  if (existingProduct) {
    return res.status(409).json({
      error: `Código de barras já existe no produto: ${existingProduct.name}`,
    })
  }

  // Criar novo produto
  const newProduct = {
    id: salesSystem.generateProductId(),
    name: productData.name,
    price: Number.parseFloat(productData.price),
    cost: Number.parseFloat(productData.cost) || 0,
    category: productData.category,
    bestseller: productData.bestseller || false,
    barcode: productData.barcode,
    emoji: salesSystem.getCategoryEmoji(productData.category),
    createdAt: new Date().toISOString(),
  }

  // Adicionar à lista
  salesSystem.products.push(newProduct)

  res.status(201).json({
    success: true,
    product: newProduct,
    message: "Produto cadastrado com sucesso!",
  })
})

app.get("/api/products/:barcode", (req, res) => {
  const barcode = req.params.barcode
  const product = salesSystem.products.find((p) => p.barcode === barcode)

  if (product) {
    res.json({ found: true, product })
  } else {
    res.status(404).json({ found: false, message: "Produto não encontrado" })
  }
})

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: salesSystem.connections.size,
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

const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const cors = require("cors")
const { MongoClient, ObjectId } = require("mongodb")
const path = require("path")

const app = express()
const server = http.createServer(app)

// ===== ATENÇÃO: Troque pela sua string do MongoDB Atlas =====
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://USUARIO:SENHA@CLUSTER.mongodb.net/?retryWrites=true&w=majority"
const DB_NAME = "lojavialli"
// ===========================================================

// MongoDB setup
let db, productsCol, categoriesCol, salesCol

async function connectMongo() {
  const mongoClient = new MongoClient(MONGO_URI)
  await mongoClient.connect()
  db = mongoClient.db(DB_NAME)
  productsCol = db.collection("products")
  categoriesCol = db.collection("categories")
  salesCol = db.collection("sales")
  // Cria categorias padrão se o banco estiver vazio
  if ((await categoriesCol.countDocuments()) === 0) {
    await categoriesCol.insertMany([
      { name: "Smartphones", emoji: "📱", isDefault: true },
      { name: "Notebooks", emoji: "💻", isDefault: true },
      { name: "Áudio", emoji: "🎧", isDefault: true },
      { name: "Acessórios", emoji: "🔋", isDefault: true },
      { name: "Outros", emoji: "📦", isDefault: true }
    ])
  }
  console.log("✅ Conectado ao MongoDB Atlas e categorias padrões prontas")
}
connectMongo().catch(console.error)

// CORS e JSON parsers
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE"], allowedHeaders: ["*"], credentials: true }))
app.use(express.json())

// Rotas REST de teste (pode expandir para API pública se quiser)
app.get("/", (req, res) => res.send("LOJA VIALLI - Backend com MongoDB funcionando!"))
app.get("/api/products", async (req, res) => {
  const products = await productsCol.find().toArray()
  res.json(products)
})
app.get("/api/categories", async (req, res) => {
  const categories = await categoriesCol.find().toArray()
  res.json(categories)
})
app.get("/api/sales", async (req, res) => {
  const sales = await salesCol.find().sort({ createdAt: -1 }).toArray()
  res.json(sales)
})

// SOCKET.IO (crucial para seu frontend)
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"], allowedHeaders: ["*"], credentials: true },
  transports: ["websocket", "polling"],
})

/**
 * Funções auxiliares
 */
async function getCategoryEmoji(categoryName) {
  const cat = await categoriesCol.findOne({ name: categoryName })
  return cat && cat.emoji ? cat.emoji : "📦"
}

/**
 * SOCKET.IO HANDLERS
 */
io.on("connection", (socket) => {
  console.log(`🔗 Nova conexão: ${socket.id}`)

  // ==== CATEGORIAS ====
  socket.on("get-categories", async () => {
    const categories = await categoriesCol.find().toArray()
    socket.emit("categories-list", { categories })
  })

  socket.on("add-category", async (data) => {
    if (!data.name) return socket.emit("category-add-error", "Nome é obrigatório")
    const exists = await categoriesCol.findOne({ name: data.name })
    if (exists) return socket.emit("category-add-error", "Categoria já existe")
    const emoji = data.emoji || "📦"
    const result = await categoriesCol.insertOne({ name: data.name, emoji, isDefault: false })
    socket.emit("category-added", { category: { ...data, emoji, _id: result.insertedId }, message: "Categoria adicionada!" })
    sendCategoriesUpdate()
  })

  socket.on("delete-category", async ({ categoryId }) => {
    const category = await categoriesCol.findOne({ _id: new ObjectId(categoryId) })
    if (!category) return socket.emit("category-delete-error", "Categoria não encontrada")
    if (category.isDefault) return socket.emit("category-delete-error", "Não pode excluir categoria padrão")
    await categoriesCol.deleteOne({ _id: new ObjectId(categoryId) })
    socket.emit("category-deleted", { categoryId })
    sendCategoriesUpdate()
  })

  // ==== PRODUTOS ====
  socket.on("get-products", async () => {
    const products = await productsCol.find().toArray()
    socket.emit("products-list", { products })
  })

  socket.on("add-product", async (productData) => {
    if (!productData.name || !productData.price || !productData.category || !productData.barcode)
      return socket.emit("product-add-error", "Preencha todos os campos obrigatórios")
    const exists = await productsCol.findOne({ barcode: productData.barcode })
    if (exists) return socket.emit("product-add-error", "Código de barras já cadastrado")
    const emoji = await getCategoryEmoji(productData.category)
    const result = await productsCol.insertOne({ ...productData, emoji, createdAt: new Date() })
    socket.emit("product-added", { product: { ...productData, emoji, _id: result.insertedId }, message: "Produto cadastrado!" })
    sendProductsUpdate()
  })

  socket.on("update-product", async (productData) => {
    if (!productData._id) return socket.emit("product-update-error", "Produto inválido")
    const emoji = await getCategoryEmoji(productData.category)
    await productsCol.updateOne(
      { _id: new ObjectId(productData._id) },
      { $set: { ...productData, emoji, _id: undefined } }
    )
    socket.emit("product-updated", { product: { ...productData, emoji }, message: "Produto atualizado!" })
    sendProductsUpdate()
  })

  socket.on("delete-product", async ({ productId }) => {
    await productsCol.deleteOne({ _id: new ObjectId(productId) })
    socket.emit("product-deleted", { productId })
    sendProductsUpdate()
  })

  socket.on("search-product", async ({ barcode }) => {
    const product = await productsCol.findOne({ barcode })
    socket.emit("product-search-result", { barcode, product })
  })

  // ==== VENDAS ====
  socket.on("finalize-sale", async (saleData) => {
    const result = await salesCol.insertOne({ ...saleData, createdAt: new Date() })
    socket.emit("sale-finalized", { sale: { ...saleData, _id: result.insertedId } })
    sendSalesUpdate()
  })

  socket.on("get-sales", async () => {
    const sales = await salesCol.find().sort({ createdAt: -1 }).toArray()
    socket.emit("sales-list", { sales })
  })

  // ==== Funções para atualização em tempo real ====
  function sendProductsUpdate() {
    productsCol.find().toArray().then(products => io.emit("products-list", { products }))
  }
  function sendCategoriesUpdate() {
    categoriesCol.find().toArray().then(categories => io.emit("categories-list", { categories }))
  }
  function sendSalesUpdate() {
    salesCol.find().sort({ createdAt: -1 }).toArray().then(sales => io.emit("sales-list", { sales }))
  }
})

/**
 * Inicialização do servidor
 */
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🚀 LOJA VIALLI - Servidor rodando na porta ${PORT}`)
  console.log(`🌐 Acesse: http://localhost:${PORT}`)
  console.log("💾 MongoDB Atlas ativo!")
})

/**
 * Tratamento de erros para não derrubar o servidor
 */
process.on("uncaughtException", (err) => {
  console.error("❌ Erro não capturado:", err)
})
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promise rejeitada:", reason)
})

module.exports = app
