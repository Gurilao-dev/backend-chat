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

// MongoDB Configuration - USANDO A MESMA URI QUE FUNCIONA
const MONGODB_URI =
  "mongodb+srv://joaovitormagnagovialli:A7YXV8vHYhjid55G@gorila.vanwqbp.mongodb.net/?retryWrites=true&w=majority&appName=Gorila"
const DB_NAME = "loja_vialli"

let db = null
let client = null

// Connect to MongoDB - USANDO A LÓGICA DO EXEMPLO QUE FUNCIONA
async function connectToMongoDB() {
  try {
    console.log("🔄 Conectando ao MongoDB Atlas...")
    client = new MongoClient(MONGODB_URI)
    await client.connect()

    // Testar conexão
    await client.db("admin").command({ ping: 1 })
    console.log("✅ Ping ao MongoDB bem-sucedido!")

    db = client.db(DB_NAME)
    console.log(`✅ Conectado ao banco de dados: ${DB_NAME}`)

    // Initialize collections and sample data
    await initializeDatabase()
  } catch (error) {
    console.error("❌ Erro ao conectar ao MongoDB:", error)
    process.exit(1)
  }
}

// Initialize database with sample data - GARANTIR QUE AS COLEÇÕES SEJAM CRIADAS
async function initializeDatabase() {
  try {
    console.log("🔄 Inicializando banco de dados...")

    // Criar coleções se não existirem
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map((col) => col.name)

    if (!collectionNames.includes("products")) {
      await db.createCollection("products")
      console.log("✅ Coleção 'products' criada")
    }

    if (!collectionNames.includes("categories")) {
      await db.createCollection("categories")
      console.log("✅ Coleção 'categories' criada")
    }

    if (!collectionNames.includes("sales")) {
      await db.createCollection("sales")
      console.log("✅ Coleção 'sales' criada")
    }

    // Check if products collection exists and has data
    const productsCount = await db.collection("products").countDocuments()
    const categoriesCount = await db.collection("categories").countDocuments()

    console.log(`📊 Produtos existentes: ${productsCount}`)
    console.log(`📊 Categorias existentes: ${categoriesCount}`)

    // Initialize categories if empty
    if (categoriesCount === 0) {
      console.log("🏷️ Inserindo categorias padrão...")
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

      const result = await db.collection("categories").insertMany(defaultCategories)
      console.log(`✅ ${result.insertedCount} categorias padrão inseridas no MongoDB`)
    }

    // Initialize products if empty
    if (productsCount === 0) {
      console.log("📦 Inserindo produtos de exemplo...")
      const sampleProducts = [
        {
          name: "iPhone 15 Pro Max",
          price: 8999.99,
          cost: 6500.0,
          category: "Smartphones",
          emoji: "📱",
          bestseller: true,
          barcode: "789123456001",
          createdAt: new Date(),
        },
        {
          name: "MacBook Pro M3",
          price: 12999.99,
          cost: 9500.0,
          category: "Notebooks",
          emoji: "💻",
          bestseller: true,
          barcode: "789123456002",
          createdAt: new Date(),
        },
        {
          name: "AirPods Pro 2",
          price: 2499.99,
          cost: 1800.0,
          category: "Áudio",
          emoji: "🎧",
          bestseller: true,
          barcode: "789123456003",
          createdAt: new Date(),
        },
        {
          name: "iPad Air M2",
          price: 4999.99,
          cost: 3600.0,
          category: "Tablets",
          emoji: "📱",
          barcode: "789123456004",
          createdAt: new Date(),
        },
        {
          name: "Apple Watch Ultra",
          price: 6999.99,
          cost: 5000.0,
          category: "Wearables",
          emoji: "⌚",
          bestseller: true,
          barcode: "789123456005",
          createdAt: new Date(),
        },
        {
          name: "Samsung Galaxy S24",
          price: 6999.99,
          cost: 5200.0,
          category: "Smartphones",
          emoji: "📱",
          barcode: "789123456006",
          createdAt: new Date(),
        },
        {
          name: "Dell XPS 13",
          price: 8999.99,
          cost: 6800.0,
          category: "Notebooks",
          emoji: "💻",
          barcode: "789123456007",
          createdAt: new Date(),
        },
        {
          name: "Sony WH-1000XM5",
          price: 1999.99,
          cost: 1400.0,
          category: "Áudio",
          emoji: "🎧",
          barcode: "789123456008",
          createdAt: new Date(),
        },
        {
          name: "Nintendo Switch OLED",
          price: 2499.99,
          cost: 1900.0,
          category: "Games",
          emoji: "🎮",
          bestseller: true,
          barcode: "789123456009",
          createdAt: new Date(),
        },
        {
          name: "GoPro Hero 12",
          price: 3499.99,
          cost: 2600.0,
          category: "Câmeras",
          emoji: "📷",
          barcode: "789123456010",
          createdAt: new Date(),
        },
      ]

      const result = await db.collection("products").insertMany(sampleProducts)
      console.log(`✅ ${result.insertedCount} produtos de exemplo inseridos no MongoDB`)
    }

    // Verificar se os dados foram realmente salvos
    const finalProductsCount = await db.collection("products").countDocuments()
    const finalCategoriesCount = await db.collection("categories").countDocuments()

    console.log(`📦 Total final de produtos: ${finalProductsCount}`)
    console.log(`🏷️ Total final de categorias: ${finalCategoriesCount}`)

    // Listar algumas categorias para verificar
    const sampleCategories = await db.collection("categories").find({}).limit(3).toArray()
    console.log(
      "🔍 Exemplo de categorias salvas:",
      sampleCategories.map((c) => c.name),
    )

    // Listar alguns produtos para verificar
    const sampleProducts = await db.collection("products").find({}).limit(3).toArray()
    console.log(
      "🔍 Exemplo de produtos salvos:",
      sampleProducts.map((p) => p.name),
    )
  } catch (error) {
    console.error("❌ Erro ao inicializar banco de dados:", error)
    throw error
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

  // MongoDB Operations - MELHORADAS COM LOGS DETALHADOS
  async getProducts() {
    try {
      console.log("📦 Buscando produtos no MongoDB...")
      const products = await db.collection("products").find({}).sort({ createdAt: -1 }).toArray()
      console.log(`✅ ${products.length} produtos encontrados`)
      return products
    } catch (error) {
      console.error("❌ Erro ao buscar produtos:", error)
      return []
    }
  }

  async getCategories() {
    try {
      console.log("🏷️ Buscando categorias no MongoDB...")
      const categories = await db.collection("categories").find({}).sort({ name: 1 }).toArray()
      console.log(`✅ ${categories.length} categorias encontradas`)
      return categories
    } catch (error) {
      console.error("❌ Erro ao buscar categorias:", error)
      return []
    }
  }

  async getSales() {
    try {
      console.log("🧾 Buscando vendas no MongoDB...")
      const sales = await db.collection("sales").find({}).sort({ timestamp: -1 }).toArray()
      console.log(`✅ ${sales.length} vendas encontradas`)
      return sales
    } catch (error) {
      console.error("❌ Erro ao buscar vendas:", error)
      return []
    }
  }

  async addProduct(productData) {
    try {
      console.log("📦 Adicionando produto:", productData.name)

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

      console.log(`✅ Produto adicionado ao MongoDB: ${newProduct.name} (ID: ${newProduct._id})`)

      // Verificar se foi realmente salvo
      const verification = await db.collection("products").findOne({ _id: newProduct._id })
      console.log("🔍 Verificação do produto salvo:", verification ? "OK" : "ERRO")

      return newProduct
    } catch (error) {
      console.error("❌ Erro ao adicionar produto:", error)
      throw error
    }
  }

  async updateProduct(productData) {
    try {
      console.log("📦 Atualizando produto:", productData.name)
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
      console.log("📦 Removendo produto:", productId)
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
      console.log(`🏷️ Tentando adicionar categoria: ${categoryData.name}`)

      // Check if category already exists
      const existingCategory = await db.collection("categories").findOne({ name: categoryData.name })
      if (existingCategory) {
        console.log(`❌ Categoria já existe: ${categoryData.name}`)
        throw new Error(`Categoria já existe: ${categoryData.name}`)
      }

      const newCategory = {
        name: categoryData.name,
        emoji: categoryData.emoji || "📦",
        isDefault: false,
        createdAt: new Date(),
      }

      console.log("🏷️ Dados da categoria a ser inserida:", newCategory)
      const result = await db.collection("categories").insertOne(newCategory)
      newCategory._id = result.insertedId

      console.log(`✅ Categoria adicionada ao MongoDB: ${newCategory.name} (ID: ${newCategory._id})`)

      // Verificar se foi realmente salva
      const verification = await db.collection("categories").findOne({ _id: newCategory._id })
      console.log(`🔍 Verificação da categoria salva:`, verification)

      // Contar total de categorias após inserção
      const totalCategories = await db.collection("categories").countDocuments()
      console.log(`📊 Total de categorias após inserção: ${totalCategories}`)

      return newCategory
    } catch (error) {
      console.error("❌ Erro ao adicionar categoria:", error)
      throw error
    }
  }

  async deleteCategory(categoryId) {
    try {
      console.log("🏷️ Removendo categoria:", categoryId)

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
      console.log("🧾 Salvando venda...")
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
      console.log("🔍 Buscando produto por código:", barcode)
      const product = await db.collection("products").findOne({ barcode: barcode })
      console.log("🔍 Produto encontrado:", product ? product.name : "Não encontrado")
      return product
    } catch (error) {
      console.error("❌ Erro ao buscar produto:", error)
      return null
    }
  }

  async searchSale(saleCode) {
    try {
      console.log("🔍 Buscando venda por código:", saleCode)
      const sale = await db.collection("sales").findOne({ code: saleCode })
      return sale
    } catch (error) {
      console.error("❌ Erro ao buscar venda:", error)
      return null
    }
  }

  // Teste de conexão MongoDB - MELHORADO
  async testMongoDB() {
    try {
      console.log("🧪 Iniciando teste MongoDB...")

      // Teste 1: Ping
      await client.db("admin").command({ ping: 1 })
      console.log("✅ Teste 1: Ping OK")

      // Teste 2: Inserir documento de teste
      const testDoc = {
        test: true,
        timestamp: new Date(),
        message: "Teste de conexão MongoDB",
      }

      const result = await db.collection("test").insertOne(testDoc)
      console.log(`✅ Teste 2: Inserção OK - ID: ${result.insertedId}`)

      // Teste 3: Buscar documento
      const foundDoc = await db.collection("test").findOne({ _id: result.insertedId })
      console.log("✅ Teste 3: Busca OK")

      // Teste 4: Limpar teste
      await db.collection("test").deleteOne({ _id: result.insertedId })
      console.log("✅ Teste 4: Limpeza OK")

      // Teste 5: Verificar coleções principais
      const productsCount = await db.collection("products").countDocuments()
      const categoriesCount = await db.collection("categories").countDocuments()
      console.log(`✅ Teste 5: Produtos: ${productsCount}, Categorias: ${categoriesCount}`)

      return {
        success: true,
        message: `MongoDB funcionando perfeitamente! ${productsCount} produtos e ${categoriesCount} categorias encontradas.`,
      }
    } catch (error) {
      console.error("❌ Erro no teste MongoDB:", error)
      return { success: false, error: error.message }
    }
  }

  setupSocketHandlers() {
    io.on("connection", (socket) => {
      console.log(`🔗 Nova conexão: ${socket.id}`)

      // Gerar código de sincronização AUTOMATICAMENTE para mobile
      if (
        socket.handshake.headers["user-agent"] &&
        /Mobile|Android|iPhone|iPad/i.test(socket.handshake.headers["user-agent"])
      ) {
        const code = this.generateSyncCode()
        const deviceData = {
          code,
          deviceType: "mobile",
          socketId: socket.id,
          timestamp: Date.now(),
        }

        this.syncCodes.set(code, deviceData)
        this.connections.set(socket.id, { ...deviceData, role: "mobile" })

        console.log(`📱 Código automático gerado para mobile: ${code}`)
        socket.emit("sync-code-generated", { code, deviceType: "mobile" })

        // Limpar código após 30 minutos (aumentado)
        setTimeout(
          () => {
            this.syncCodes.delete(code)
            console.log(`⏰ Código ${code} expirado`)
          },
          30 * 60 * 1000,
        )
      }

      // Gerar código de sincronização manual
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

        // Limpar código após 30 minutos
        setTimeout(
          () => {
            this.syncCodes.delete(code)
            console.log(`⏰ Código ${code} expirado`)
          },
          30 * 60 * 1000,
        )
      })

      // Desktop conectando com código
      socket.on("connect-with-code", (data) => {
        const code = data.code.toUpperCase()
        console.log(`💻 Desktop tentando conectar com código: ${code}`)
        console.log(`🔍 Códigos disponíveis:`, Array.from(this.syncCodes.keys()))

        const deviceData = this.syncCodes.get(code)
        if (!deviceData) {
          console.log(`❌ Código ${code} não encontrado ou expirado`)
          socket.emit("connection-error", "Código inválido ou expirado")
          return
        }

        // Conectar desktop e mobile
        const mobileSocketId = deviceData.socketId
        const mobileSocket = io.sockets.sockets.get(mobileSocketId)

        if (!mobileSocket) {
          console.log(`❌ Mobile ${mobileSocketId} desconectado`)
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

        // NÃO remover código - manter para reconexões
        console.log(`🔄 Código ${code} mantido para reconexões`)
      })

      // Teste MongoDB
      socket.on("test-mongodb", async () => {
        try {
          console.log(`🧪 Teste MongoDB solicitado por ${socket.id}`)
          const result = await this.testMongoDB()
          socket.emit("mongodb-test-result", result)
        } catch (error) {
          console.error("❌ Erro no teste MongoDB:", error)
          socket.emit("mongodb-test-result", { success: false, error: error.message })
        }
      })

      // Get products from MongoDB
      socket.on("get-products", async () => {
        try {
          const products = await this.getProducts()
          console.log(`📦 Enviando ${products.length} produtos para ${socket.id}`)
          socket.emit("products-list", { products })
        } catch (error) {
          console.error("❌ Erro ao buscar produtos:", error)
          socket.emit("products-list", { products: [] })
        }
      })

      // Get categories from MongoDB
      socket.on("get-categories", async () => {
        try {
          const categories = await this.getCategories()
          console.log(`🏷️ Enviando ${categories.length} categorias para ${socket.id}`)
          socket.emit("categories-list", { categories })
        } catch (error) {
          console.error("❌ Erro ao buscar categorias:", error)
          socket.emit("categories-list", { categories: [] })
        }
      })

      // Get sales from MongoDB
      socket.on("get-sales", async () => {
        try {
          const sales = await this.getSales()
          console.log(`🧾 Enviando ${sales.length} vendas para ${socket.id}`)
          socket.emit("sales-list", { sales })
        } catch (error) {
          console.error("❌ Erro ao buscar vendas:", error)
          socket.emit("sales-list", { sales: [] })
        }
      })

      // Add product to MongoDB
      socket.on("add-product", async (productData) => {
        try {
          console.log(`📦 Solicitação para adicionar produto de ${socket.id}:`, productData)
          const newProduct = await this.addProduct(productData)
          socket.emit("product-added", {
            product: newProduct,
            message: "Produto cadastrado com sucesso!",
          })

          // Notify all connected clients
          const updatedProducts = await this.getProducts()
          io.emit("product-list-updated", { products: updatedProducts })
          console.log("📢 Todos os clientes notificados sobre novo produto")
        } catch (error) {
          console.error("❌ Erro ao adicionar produto:", error)
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
          const updatedProducts = await this.getProducts()
          io.emit("product-list-updated", { products: updatedProducts })
        } catch (error) {
          console.error("❌ Erro ao atualizar produto:", error)
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
          const updatedProducts = await this.getProducts()
          io.emit("product-list-updated", { products: updatedProducts })
        } catch (error) {
          console.error("❌ Erro ao excluir produto:", error)
          socket.emit("product-delete-error", error.message)
        }
      })

      // Add category to MongoDB
      socket.on("add-category", async (categoryData) => {
        try {
          console.log(`🏷️ Solicitação para adicionar categoria de ${socket.id}:`, categoryData)
          const newCategory = await this.addCategory(categoryData)

          socket.emit("category-added", {
            category: newCategory,
            message: "Categoria adicionada com sucesso!",
          })

          // Notify all connected clients
          console.log(`📢 Notificando todos os clientes sobre nova categoria`)
          io.emit("categories-updated")

          // Enviar lista atualizada
          const updatedCategories = await this.getCategories()
          io.emit("categories-list", { categories: updatedCategories })
          console.log("📢 Lista de categorias atualizada enviada para todos")
        } catch (error) {
          console.error("❌ Erro ao processar categoria:", error)
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
          const updatedCategories = await this.getCategories()
          io.emit("categories-list", { categories: updatedCategories })
        } catch (error) {
          console.error("❌ Erro ao excluir categoria:", error)
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
          } else {
            console.log(`❌ Produto não encontrado: ${data.product.barcode}`)
            desktopSocket.emit("product-not-found", { barcode: data.product.barcode })
          }
        }
      })

      // Finalizar venda e salvar no MongoDB
      socket.on("finalize-sale", async (saleData) => {
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          try {
            // Calcular valores corretos
            const subtotal = saleData.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
            const totalCost = saleData.items.reduce((sum, item) => sum + item.cost * item.quantity, 0)
            const discountAmount = subtotal * (saleData.discount / 100)
            const total = subtotal - discountAmount
            const profit = total - totalCost

            const completeSaleData = {
              items: saleData.items,
              subtotal: subtotal,
              discount: saleData.discount || 0,
              total: total,
              totalCost: totalCost,
              profit: profit,
              timestamp: saleData.timestamp || new Date().toISOString(),
            }

            const sale = await this.saveSale(completeSaleData)

            socket.emit("sale-finalized", { sale })

            // Notificar mobile se conectado
            if (connection.connectedMobile) {
              const mobileSocket = io.sockets.sockets.get(connection.connectedMobile)
              if (mobileSocket) {
                mobileSocket.emit("sale-finalized", { sale })
              }
            }
          } catch (error) {
            console.error("❌ Erro ao finalizar venda:", error)
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

              // Resetar mobile para mostrar código novamente
              const mobileConnection = this.connections.get(connection.connectedMobile)
              if (mobileConnection) {
                delete mobileConnection.connectedDesktop
                mobileSocket.emit("show-sync-code")
              }
            }
          }

          // Limpar conexão desktop
          this.connections.delete(socket.id)
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

              // Resetar mobile para mostrar código novamente
              const mobileConnection = this.connections.get(connection.connectedMobile)
              if (mobileConnection) {
                delete mobileConnection.connectedDesktop
                mobileSocket.emit("show-sync-code")
              }
            }
          } else if (connection.role === "mobile" && connection.connectedDesktop) {
            const desktopSocket = io.sockets.sockets.get(connection.connectedDesktop)
            if (desktopSocket) {
              desktopSocket.emit("device-disconnected")
            }
          }

          // NÃO limpar código de sincronização - manter para reconexões
          console.log(`🔄 Mantendo código ${connection.code} para reconexões`)
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
      console.error("❌ Erro ao calcular estatísticas:", error)
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
    try {
      const stats = await salesSystem.getStats()
      res.json(stats)
    } catch (error) {
      console.error("❌ Erro ao buscar estatísticas:", error)
      res.status(500).json({ error: "Erro interno do servidor" })
    }
  })

  app.get("/api/sales", async (req, res) => {
    try {
      const sales = await salesSystem.getSales()
      res.json(sales)
    } catch (error) {
      console.error("❌ Erro ao buscar vendas:", error)
      res.status(500).json({ error: "Erro interno do servidor" })
    }
  })

  app.get("/api/products", async (req, res) => {
    try {
      const products = await salesSystem.getProducts()
      res.json(products)
    } catch (error) {
      console.error("❌ Erro ao buscar produtos:", error)
      res.status(500).json({ error: "Erro interno do servidor" })
    }
  })

  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await salesSystem.getCategories()
      res.json(categories)
    } catch (error) {
      console.error("❌ Erro ao buscar categorias:", error)
      res.status(500).json({ error: "Erro interno do servidor" })
    }
  })

  // Rota de teste MongoDB
  app.get("/api/test-mongodb", async (req, res) => {
    try {
      const result = await salesSystem.testMongoDB()
      res.json(result)
    } catch (error) {
      console.error("❌ Erro no teste MongoDB:", error)
      res.status(500).json({ success: false, error: error.message })
    }
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
      console.error("❌ Erro ao adicionar produto via API:", error)
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
      console.error("❌ Erro ao atualizar produto via API:", error)
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
      console.error("❌ Erro ao excluir produto via API:", error)
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
      console.error("❌ Erro ao buscar produto por código:", error)
      res.status(500).json({ error: error.message })
    }
  })

  app.get("/api/health", async (req, res) => {
    try {
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
    } catch (error) {
      console.error("❌ Erro ao verificar saúde:", error)
      res.status(500).json({ error: "Erro interno do servidor" })
    }
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
