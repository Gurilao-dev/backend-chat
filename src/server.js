const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const cors = require("cors")
const { MongoClient, ObjectId } = require("mongodb")

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

// MongoDB Configuration
const MONGODB_URI =
  "mongodb+srv://joaovitormagnagovialli:A7YXV8vHYhjid55G@gorila.vanwqbp.mongodb.net/?retryWrites=true&w=majority&appName=Gorila"
const DB_NAME = "loja_vialli"

let db = null
let client = null

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    db = client.db(DB_NAME)
    console.log("✅ Conectado ao MongoDB Atlas")

    // Initialize collections and sample data
    await initializeDatabase()
  } catch (error) {
    console.error("❌ Erro ao conectar ao MongoDB:", error)
    process.exit(1)
  }
}

// Initialize database with sample data
async function initializeDatabase() {
  try {
    // Check if products collection exists and has data
    const productsCount = await db.collection("products").countDocuments()
    const categoriesCount = await db.collection("categories").countDocuments()

    // Initialize categories if empty
    if (categoriesCount === 0) {
      const defaultCategories = [
        { name: "Smartphones", emoji: "📱", isDefault: true, createdAt: new Date() },
        { name: "Notebooks", emoji: "💻", isDefault: true, createdAt: new Date() },
        { name: "Áudio", emoji: "🎧", isDefault: true, createdAt: new Date() },
        { name: "Tablets", emoji: "📱", isDefault: true, createdAt: new Date() },
        { name: "Wearables", emoji: "⌚", isDefault: true, createdAt: new Date() },
        { name: "Games", emoji: "🎮", isDefault: true, createdAt: new Date() },
        { name: "Câmeras", emoji: "📷", isDefault: true, createdAt: new Date() },
        { name: "E-readers", emoji: "📚", isDefault: true, createdAt: new Date() },
        { name: "Smart Home", emoji: "🔊", isDefault: true, createdAt: new Date() },
        { name: "Segurança", emoji: "🚪", isDefault: true, createdAt: new Date() },
        { name: "Fitness", emoji: "⌚", isDefault: true, createdAt: new Date() },
        { name: "Acessórios", emoji: "🔋", isDefault: true, createdAt: new Date() },
        { name: "Monitores", emoji: "🖥️", isDefault: true, createdAt: new Date() },
        { name: "Gaming", emoji: "⌨️", isDefault: true, createdAt: new Date() },
        { name: "Automotivo", emoji: "🚗", isDefault: true, createdAt: new Date() },
      ]

      await db.collection("categories").insertMany(defaultCategories)
      console.log("✅ Categorias padrão inseridas no MongoDB")
    }

    // Initialize products if empty - TODOS OS PRODUTOS MOVIDOS PARA CÁ
    

      await db.collection("products").insertMany(sampleProducts)
      console.log("✅ 20 produtos de exemplo inseridos no MongoDB")
    }

    console.log(`📦 ${productsCount} produtos encontrados no MongoDB`)
    console.log(`🏷️ ${categoriesCount} categorias encontradas no MongoDB`)
  } catch (error) {
    console.error("❌ Erro ao inicializar banco de dados:", error)
  }
}

// Servir arquivos estáticos
app.get("/", (req, res) => {
  res.send("LOJA VIALLI - Backend MongoDB funcionando!")
})

// Sistema de gerenciamento
class SalesSystemServer {
  constructor() {
    this.connections = new Map() // socketId -> connectionData
    this.syncCodes = new Map() // code -> deviceData

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

  generateSaleCode() {
    return `VDA${Date.now().toString().slice(-6)}`
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

  // MongoDB Operations
  async getProducts() {
    try {
      const products = await db.collection("products").find({}).sort({ createdAt: -1 }).toArray()
      return products
    } catch (error) {
      console.error("❌ Erro ao buscar produtos:", error)
      return []
    }
  }

  async getCategories() {
    try {
      const categories = await db.collection("categories").find({}).sort({ name: 1 }).toArray()
      return categories
    } catch (error) {
      console.error("❌ Erro ao buscar categorias:", error)
      return []
    }
  }

  async getSales() {
    try {
      const sales = await db.collection("sales").find({}).sort({ timestamp: -1 }).toArray()
      return sales
    } catch (error) {
      console.error("❌ Erro ao buscar vendas:", error)
      return []
    }
  }

  async addProduct(productData) {
    try {
      // Check if barcode already exists
      const existingProduct = await db.collection("products").findOne({ barcode: productData.barcode })
      if (existingProduct) {
        throw new Error(`Código de barras já existe no produto: ${existingProduct.name}`)
      }

      const newProduct = {
        name: productData.name,
        price: Number.parseFloat(productData.price),
        cost: Number.parseFloat(productData.cost) || 0,
        category: productData.category,
        bestseller: productData.bestseller || false,
        barcode: productData.barcode,
        emoji: this.getCategoryEmoji(productData.category),
        createdAt: new Date(),
      }

      const result = await db.collection("products").insertOne(newProduct)
      newProduct._id = result.insertedId

      console.log(`✅ Produto adicionado ao MongoDB: ${newProduct.name}`)
      return newProduct
    } catch (error) {
      console.error("❌ Erro ao adicionar produto:", error)
      throw error
    }
  }

  async updateProduct(productData) {
    try {
      const { _id, ...updateData } = productData

      // Check if barcode already exists in another product
      const existingProduct = await db.collection("products").findOne({
        barcode: updateData.barcode,
        _id: { $ne: new ObjectId(_id) },
      })

      if (existingProduct) {
        throw new Error(`Código de barras já existe no produto: ${existingProduct.name}`)
      }

      updateData.price = Number.parseFloat(updateData.price)
      updateData.cost = Number.parseFloat(updateData.cost) || 0
      updateData.emoji = this.getCategoryEmoji(updateData.category)
      updateData.updatedAt = new Date()

      const result = await db.collection("products").updateOne({ _id: new ObjectId(_id) }, { $set: updateData })

      if (result.matchedCount === 0) {
        throw new Error("Produto não encontrado")
      }

      const updatedProduct = await db.collection("products").findOne({ _id: new ObjectId(_id) })
      console.log(`✅ Produto atualizado no MongoDB: ${updatedProduct.name}`)
      return updatedProduct
    } catch (error) {
      console.error("❌ Erro ao atualizar produto:", error)
      throw error
    }
  }

  async deleteProduct(productId) {
    try {
      const result = await db.collection("products").deleteOne({ _id: new ObjectId(productId) })

      if (result.deletedCount === 0) {
        throw new Error("Produto não encontrado")
      }

      console.log(`✅ Produto removido do MongoDB: ${productId}`)
      return true
    } catch (error) {
      console.error("❌ Erro ao remover produto:", error)
      throw error
    }
  }

  async addCategory(categoryData) {
    try {
      // Check if category already exists
      const existingCategory = await db.collection("categories").findOne({ name: categoryData.name })
      if (existingCategory) {
        throw new Error(`Categoria já existe: ${categoryData.name}`)
      }

      const newCategory = {
        name: categoryData.name,
        emoji: categoryData.emoji || "📦",
        isDefault: false,
        createdAt: new Date(),
      }

      const result = await db.collection("categories").insertOne(newCategory)
      newCategory._id = result.insertedId

      console.log(`✅ Categoria adicionada ao MongoDB: ${newCategory.name}`)
      return newCategory
    } catch (error) {
      console.error("❌ Erro ao adicionar categoria:", error)
      throw error
    }
  }

  async deleteCategory(categoryId) {
    try {
      // Check if category is default
      const category = await db.collection("categories").findOne({ _id: new ObjectId(categoryId) })
      if (category && category.isDefault) {
        throw new Error("Não é possível excluir categoria padrão")
      }

      // Check if category is being used by products
      const productsUsingCategory = await db.collection("products").countDocuments({ category: category.name })
      if (productsUsingCategory > 0) {
        throw new Error(`Categoria está sendo usada por ${productsUsingCategory} produto(s)`)
      }

      const result = await db.collection("categories").deleteOne({ _id: new ObjectId(categoryId) })

      if (result.deletedCount === 0) {
        throw new Error("Categoria não encontrada")
      }

      console.log(`✅ Categoria removida do MongoDB: ${categoryId}`)
      return true
    } catch (error) {
      console.error("❌ Erro ao remover categoria:", error)
      throw error
    }
  }

  async saveSale(saleData) {
    try {
      const sale = {
        code: this.generateSaleCode(),
        items: saleData.items || [],
        subtotal: saleData.subtotal || 0,
        discount: saleData.discount || 0,
        total: saleData.total || 0,
        totalCost: saleData.totalCost || 0,
        profit: (saleData.total || 0) - (saleData.totalCost || 0),
        timestamp: new Date(),
        createdAt: new Date(),
      }

      const result = await db.collection("sales").insertOne(sale)
      sale._id = result.insertedId

      console.log(`✅ Venda salva no MongoDB: ${sale.code} - R$ ${sale.total.toFixed(2)}`)
      return sale
    } catch (error) {
      console.error("❌ Erro ao salvar venda:", error)
      throw error
    }
  }

  async searchProduct(barcode) {
    try {
      const product = await db.collection("products").findOne({ barcode: barcode })
      return product
    } catch (error) {
      console.error("❌ Erro ao buscar produto:", error)
      return null
    }
  }

  async searchSale(saleCode) {
    try {
      const sale = await db.collection("sales").findOne({ code: saleCode })
      return sale
    } catch (error) {
      console.error("❌ Erro ao buscar venda:", error)
      return null
    }
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
      socket.on("connect-with-code", (data) => {
        const code = data.code
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
        })

        mobileSocket.emit("device-connected", {
          code,
          deviceType: deviceData.deviceType,
          connectedDevice: socket.id,
        })

        // Remover código usado
        this.syncCodes.delete(code)
      })

      // Get products from MongoDB
      socket.on("get-products", async () => {
        try {
          const products = await this.getProducts()
          socket.emit("products-list", { products })
        } catch (error) {
          socket.emit("products-list", { products: [] })
        }
      })

      // Get categories from MongoDB
      socket.on("get-categories", async () => {
        try {
          const categories = await this.getCategories()
          socket.emit("categories-list", { categories })
        } catch (error) {
          socket.emit("categories-list", { categories: [] })
        }
      })

      // Get sales from MongoDB
      socket.on("get-sales", async () => {
        try {
          const sales = await this.getSales()
          socket.emit("sales-list", { sales })
        } catch (error) {
          socket.emit("sales-list", { sales: [] })
        }
      })

      // Add product to MongoDB
      socket.on("add-product", async (productData) => {
        try {
          const newProduct = await this.addProduct(productData)
          socket.emit("product-added", {
            product: newProduct,
            message: "Produto cadastrado com sucesso!",
          })

          // Notify all connected clients
          io.emit("product-list-updated", { products: await this.getProducts() })
        } catch (error) {
          socket.emit("product-add-error", error.message)
        }
      })

      // Update product in MongoDB
      socket.on("update-product", async (productData) => {
        try {
          const updatedProduct = await this.updateProduct(productData)
          socket.emit("product-updated", {
            product: updatedProduct,
            message: "Produto atualizado com sucesso!",
          })

          // Notify all connected clients
          io.emit("product-list-updated", { products: await this.getProducts() })
        } catch (error) {
          socket.emit("product-update-error", error.message)
        }
      })

      // Delete product from MongoDB
      socket.on("delete-product", async (data) => {
        try {
          await this.deleteProduct(data.productId)
          socket.emit("product-deleted", {
            productId: data.productId,
            message: "Produto excluído com sucesso!",
          })

          // Notify all connected clients
          io.emit("product-list-updated", { products: await this.getProducts() })
        } catch (error) {
          socket.emit("product-delete-error", error.message)
        }
      })

      // Add category to MongoDB
      socket.on("add-category", async (categoryData) => {
        try {
          const newCategory = await this.addCategory(categoryData)
          socket.emit("category-added", {
            category: newCategory,
            message: "Categoria adicionada com sucesso!",
          })

          // Notify all connected clients
          io.emit("categories-updated")
        } catch (error) {
          socket.emit("category-add-error", error.message)
        }
      })

      // Delete category from MongoDB
      socket.on("delete-category", async (data) => {
        try {
          await this.deleteCategory(data.categoryId)
          socket.emit("category-deleted", {
            categoryId: data.categoryId,
            message: "Categoria excluída com sucesso!",
          })

          // Notify all connected clients
          io.emit("categories-updated")
        } catch (error) {
          socket.emit("category-delete-error", error.message)
        }
      })

      // Produto escaneado pelo mobile
      socket.on("product-scanned", async (data) => {
        const connection = this.connections.get(socket.id)
        if (!connection || !connection.connectedDesktop) {
          console.log("❌ Mobile não conectado a desktop")
          return
        }

        const desktopSocket = io.sockets.sockets.get(connection.connectedDesktop)
        if (desktopSocket) {
          // Buscar produto no MongoDB
          const product = await this.searchProduct(data.product.barcode)
          if (product) {
            console.log(`📦 Produto escaneado: ${product.name}`)
            desktopSocket.emit("product-scanned", { product })
          }
        }
      })

      // Finalizar venda e salvar no MongoDB
      socket.on("finalize-sale", async (saleData) => {
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          try {
            const sale = await this.saveSale(saleData)

            socket.emit("sale-finalized", { sale })

            // Notificar mobile se conectado
            if (connection.connectedMobile) {
              const mobileSocket = io.sockets.sockets.get(connection.connectedMobile)
              if (mobileSocket) {
                mobileSocket.emit("sale-finalized", { sale })
              }
            }
          } catch (error) {
            socket.emit("sale-finalize-error", error.message)
          }
        }
      })

      // Search product by barcode
      socket.on("search-product", async (data) => {
        try {
          const product = await this.searchProduct(data.barcode)
          socket.emit("product-search-result", {
            barcode: data.barcode,
            product: product,
            found: !!product,
          })
        } catch (error) {
          socket.emit("product-search-result", {
            barcode: data.barcode,
            product: null,
            found: false,
          })
        }
      })

      // Search sale by code
      socket.on("search-sale", async (data) => {
        try {
          const sale = await this.searchSale(data.saleCode)
          socket.emit("sale-search-result", {
            saleCode: data.saleCode,
            sale: sale,
            found: !!sale,
          })
        } catch (error) {
          socket.emit("sale-search-result", {
            saleCode: data.saleCode,
            sale: null,
            found: false,
          })
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
  async getStats() {
    try {
      const sales = await this.getSales()
      const products = await this.getProducts()

      return {
        totalSales: sales.length,
        totalRevenue: sales.reduce((sum, sale) => sum + (sale.total || 0), 0),
        totalProfit: sales.reduce((sum, sale) => sum + (sale.profit || 0), 0),
        totalProducts: products.length,
        connectedDevices: this.connections.size,
        activeCodes: this.syncCodes.size,
      }
    } catch (error) {
      return {
        totalSales: 0,
        totalRevenue: 0,
        totalProfit: 0,
        totalProducts: 0,
        connectedDevices: this.connections.size,
        activeCodes: this.syncCodes.size,
      }
    }
  }
}

// Initialize MongoDB connection
connectToMongoDB().then(() => {
  // Inicializar sistema após conectar ao MongoDB
  const salesSystem = new SalesSystemServer()

  // Rotas da API
  app.get("/api/stats", async (req, res) => {
    const stats = await salesSystem.getStats()
    res.json(stats)
  })

  app.get("/api/sales", async (req, res) => {
    const sales = await salesSystem.getSales()
    res.json(sales)
  })

  app.get("/api/products", async (req, res) => {
    const products = await salesSystem.getProducts()
    res.json(products)
  })

  app.get("/api/categories", async (req, res) => {
    const categories = await salesSystem.getCategories()
    res.json(categories)
  })

  app.post("/api/products", async (req, res) => {
    try {
      const newProduct = await salesSystem.addProduct(req.body)
      res.status(201).json({
        success: true,
        product: newProduct,
        message: "Produto cadastrado com sucesso!",
      })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.put("/api/products/:id", async (req, res) => {
    try {
      const productData = { ...req.body, _id: req.params.id }
      const updatedProduct = await salesSystem.updateProduct(productData)
      res.json({
        success: true,
        product: updatedProduct,
        message: "Produto atualizado com sucesso!",
      })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.delete("/api/products/:id", async (req, res) => {
    try {
      await salesSystem.deleteProduct(req.params.id)
      res.json({
        success: true,
        message: "Produto excluído com sucesso!",
      })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  app.get("/api/products/barcode/:barcode", async (req, res) => {
    try {
      const product = await salesSystem.searchProduct(req.params.barcode)
      if (product) {
        res.json({ found: true, product })
      } else {
        res.status(404).json({ found: false, message: "Produto não encontrado" })
      }
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  app.get("/api/health", async (req, res) => {
    const stats = await salesSystem.getStats()
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connections: salesSystem.connections.size,
      database: "MongoDB Atlas Connected",
      stats: stats,
      message: "LOJA VIALLI - Backend MongoDB funcionando perfeitamente!",
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
    console.log(`🗄️ MongoDB Atlas conectado e funcionando!`)
  })

  // Tratamento de erros
  process.on("uncaughtException", (err) => {
    console.error("❌ Erro não capturado:", err)
  })

  process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Promise rejeitada:", reason)
  })
})

module.exports = app
