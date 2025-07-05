const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const cors = require("cors")
const path = require("path")
const mongoose = require("mongoose")

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

// Conectar ao MongoDB
const MONGODB_URI = "mongodb+srv://joaovitormagnagovialli:A7YXV8vHYhjid55G@gorila.vanwqbp.mongodb.net/loja-vialli?retryWrites=true&w=majority&appName=Gorila"

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

const db = mongoose.connection
db.on('error', console.error.bind(console, '❌ Erro de conexão MongoDB:'))
db.once('open', () => {
  console.log('✅ Conectado ao MongoDB Atlas')
  initializeDefaultData()
})

// Schemas do MongoDB
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  cost: { type: Number, required: true },
  category: { type: String, required: true },
  barcode: { type: String, required: true, unique: true },
  bestseller: { type: Boolean, default: false },
  emoji: { type: String, default: "📦" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

const SaleSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  items: [{
    id: String,
    name: String,
    price: Number,
    cost: Number,
    quantity: Number,
    category: String
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  finalTotal: { type: Number, required: true },
  totalCost: { type: Number, required: true },
  profit: { type: Number, required: true },
  itemCount: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
})

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  emoji: { type: String, default: "📦" },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
})

const Product = mongoose.model('Product', ProductSchema)
const Sale = mongoose.model('Sale', SaleSchema)
const Category = mongoose.model('Category', CategorySchema)

// Inicializar dados padrão
async function initializeDefaultData() {
  try {
    // Verificar se já existem produtos
    const productCount = await Product.countDocuments()
    
    if (productCount === 0) {
      console.log('📦 Inicializando produtos padrão...')
      
      const defaultProducts = [
        { name: "iPhone 15 Pro Max", price: 8999.99, cost: 6500.0, category: "Smartphones", bestseller: true, barcode: "789123456001", emoji: "📱" },
        { name: "MacBook Pro M3", price: 12999.99, cost: 9500.0, category: "Notebooks", bestseller: true, barcode: "789123456002", emoji: "💻" },
        { name: "AirPods Pro 2", price: 2499.99, cost: 1800.0, category: "Áudio", bestseller: true, barcode: "789123456003", emoji: "🎧" },
        { name: "iPad Air M2", price: 4999.99, cost: 3600.0, category: "Tablets", barcode: "789123456004", emoji: "📱" },
        { name: "Apple Watch Ultra", price: 6999.99, cost: 5000.0, category: "Wearables", bestseller: true, barcode: "789123456005", emoji: "⌚" },
        { name: "Samsung Galaxy S24", price: 6999.99, cost: 5200.0, category: "Smartphones", barcode: "789123456006", emoji: "📱" },
        { name: "Dell XPS 13", price: 8999.99, cost: 6800.0, category: "Notebooks", barcode: "789123456007", emoji: "💻" },
        { name: "Sony WH-1000XM5", price: 1999.99, cost: 1400.0, category: "Áudio", barcode: "789123456008", emoji: "🎧" },
        { name: "Nintendo Switch OLED", price: 2499.99, cost: 1900.0, category: "Games", bestseller: true, barcode: "789123456009", emoji: "🎮" },
        { name: "GoPro Hero 12", price: 3499.99, cost: 2600.0, category: "Câmeras", barcode: "789123456010", emoji: "📷" },
        { name: "Kindle Oasis", price: 1499.99, cost: 1100.0, category: "E-readers", barcode: "789123456011", emoji: "📚" },
        { name: "Echo Dot 5ª Gen", price: 399.99, cost: 280.0, category: "Smart Home", barcode: "789123456012", emoji: "🔊" },
        { name: "Ring Video Doorbell", price: 899.99, cost: 650.0, category: "Segurança", barcode: "789123456013", emoji: "🚪" },
        { name: "Fitbit Charge 6", price: 1299.99, cost: 950.0, category: "Fitness", barcode: "789123456014", emoji: "⌚" },
        { name: "Bose SoundLink", price: 799.99, cost: 580.0, category: "Áudio", barcode: "789123456015", emoji: "🔊" },
        { name: "Logitech MX Master 3", price: 699.99, cost: 500.0, category: "Acessórios", barcode: "789123456016", emoji: "🖱️" },
        { name: "Samsung 4K Monitor", price: 2999.99, cost: 2200.0, category: "Monitores", barcode: "789123456017", emoji: "🖥️" },
        { name: "Razer Mechanical Keyboard", price: 1199.99, cost: 850.0, category: "Gaming", barcode: "789123456018", emoji: "⌨️" },
        { name: "Anker PowerBank 20K", price: 299.99, cost: 200.0, category: "Acessórios", barcode: "789123456019", emoji: "🔋" },
        { name: "Tesla Model Y Charger", price: 1999.99, cost: 1400.0, category: "Automotivo", barcode: "789123456020", emoji: "🚗" }
      ]
      
      await Product.insertMany(defaultProducts)
      console.log('✅ Produtos padrão inseridos no MongoDB')
    }
    
    // Verificar se já existem categorias
    const categoryCount = await Category.countDocuments()
    
    if (categoryCount === 0) {
      console.log('🏷️ Inicializando categorias padrão...')
      
      const defaultCategories = [
        { name: "Smartphones", emoji: "📱", isDefault: true },
        { name: "Notebooks", emoji: "💻", isDefault: true },
        { name: "Áudio", emoji: "🎧", isDefault: true },
        { name: "Tablets", emoji: "📱", isDefault: true },
        { name: "Wearables", emoji: "⌚", isDefault: true },
        { name: "Games", emoji: "🎮", isDefault: true },
        { name: "Câmeras", emoji: "📷", isDefault: true },
        { name: "E-readers", emoji: "📚", isDefault: true },
        { name: "Smart Home", emoji: "🔊", isDefault: true },
        { name: "Segurança", emoji: "🚪", isDefault: true },
        { name: "Fitness", emoji: "⌚", isDefault: true },
        { name: "Acessórios", emoji: "🔋", isDefault: true },
        { name: "Monitores", emoji: "🖥️", isDefault: true },
        { name: "Gaming", emoji: "⌨️", isDefault: true },
        { name: "Automotivo", emoji: "🚗", isDefault: true }
      ]
      
      await Category.insertMany(defaultCategories)
      console.log('✅ Categorias padrão inseridas no MongoDB')
    }
    
  } catch (error) {
    console.error('❌ Erro ao inicializar dados padrão:', error)
  }
}

// Servir arquivos estáticos
app.get("/", (req, res) => {
  res.send("LOJA VIALLI - Backend funcionando com MongoDB!")
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
        setTimeout(() => {
          this.syncCodes.delete(code)
        }, 10 * 60 * 1000)
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
      socket.on("product-scanned", async (data) => {
        const connection = this.connections.get(socket.id)
        if (!connection || !connection.connectedDesktop) {
          console.log("❌ Mobile não conectado a desktop")
          return
        }

        const desktopSocket = io.sockets.sockets.get(connection.connectedDesktop)
        if (desktopSocket) {
          try {
            // Buscar produto no MongoDB
            const product = await Product.findOne({ 
              $or: [
                { barcode: data.product.barcode },
                { _id: data.product.id }
              ]
            })
            
            if (product) {
              console.log(`📦 Produto escaneado: ${product.name}`)
              desktopSocket.emit("product-scanned", { product })
            } else {
              console.log(`❌ Produto não encontrado: ${data.product.barcode}`)
            }
          } catch (error) {
            console.error('❌ Erro ao buscar produto:', error)
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
      socket.on("finalize-sale", async (saleData) => {
        const connection = this.connections.get(socket.id)
        if (connection && connection.role === "desktop") {
          try {
            const sale = new Sale({
              code: saleData.code,
              items: saleData.items || [],
              subtotal: saleData.subtotal || 0,
              discount: saleData.discount || 0,
              finalTotal: saleData.finalTotal || 0,
              totalCost: saleData.totalCost || 0,
              profit: saleData.profit || 0,
              itemCount: saleData.itemCount || 0,
              timestamp: new Date()
            })

            await sale.save()
            console.log(`🎉 Venda salva no MongoDB: ${sale.code} - R$ ${sale.finalTotal?.toFixed(2)}`)

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
          } catch (error) {
            console.error('❌ Erro ao salvar venda:', error)
            socket.emit("sale-error", "Erro ao finalizar venda")
          }
        }
      })

      // Adicionar novo produto
      socket.on("add-product", async (productData) => {
        console.log(`📦 Tentativa de cadastro de produto: ${productData.name}`)

        try {
          // Validar dados do produto
          if (!productData.name || !productData.price || !productData.category || !productData.barcode) {
            socket.emit("product-add-error", "Dados do produto incompletos")
            return
          }

          // Verificar se código de barras já existe
          const existingProduct = await Product.findOne({ barcode: productData.barcode })
          if (existingProduct) {
            socket.emit("product-add-error", `Código de barras já existe no produto: ${existingProduct.name}`)
            return
          }

          // Criar novo produto
          const newProduct = new Product({
            name: productData.name,
            price: Number.parseFloat(productData.price),
            cost: Number.parseFloat(productData.cost) || 0,
            category: productData.category,
            bestseller: productData.bestseller || false,
            barcode: productData.barcode,
            emoji: this.getCategoryEmoji(productData.category),
            createdAt: new Date(),
          })

          await newProduct.save()
          console.log(`✅ Produto salvo no MongoDB: ${newProduct.name} - ID: ${newProduct._id}`)

          // Notificar o dispositivo que cadastrou
          socket.emit("product-added", {
            product: newProduct,
            message: "Produto cadastrado com sucesso!",
          })

          // Notificar todos os dispositivos conectados sobre o novo produto
          io.emit("product-list-updated", {
            newProduct: newProduct,
          })
        } catch (error) {
          console.error('❌ Erro ao cadastrar produto:', error)
          socket.emit("product-add-error", "Erro interno ao cadastrar produto")
        }
      })

      // Atualizar produto
      socket.on("update-product", async (productData) => {
        console.log(`📝 Tentativa de atualização de produto: ${productData.name}`)

        try {
          // Verificar se código de barras já existe em outro produto
          if (productData.barcode) {
            const existingProduct = await Product.findOne({ 
              barcode: productData.barcode,
              _id: { $ne: productData._id }
            })
            if (existingProduct) {
              socket.emit("product-update-error", `Código de barras já existe no produto: ${existingProduct.name}`)
              return
            }
          }

          const updatedProduct = await Product.findByIdAndUpdate(
            productData._id,
            {
              name: productData.name,
              price: Number.parseFloat(productData.price),
              cost: Number.parseFloat(productData.cost) || 0,
              category: productData.category,
              bestseller: productData.bestseller || false,
              barcode: productData.barcode,
              emoji: this.getCategoryEmoji(productData.category),
              updatedAt: new Date(),
            },
            { new: true }
          )

          if (updatedProduct) {
            console.log(`✅ Produto atualizado no MongoDB: ${updatedProduct.name}`)
            socket.emit("product-updated", {
              product: updatedProduct,
              message: "Produto atualizado com sucesso!",
            })

            // Notificar todos os dispositivos
            io.emit("product-list-updated", {
              updatedProduct: updatedProduct,
            })
          } else {
            socket.emit("product-update-error", "Produto não encontrado")
          }
        } catch (error) {
          console.error('❌ Erro ao atualizar produto:', error)
          socket.emit("product-update-error", "Erro interno ao atualizar produto")
        }
      })

      // Deletar produto
      socket.on("delete-product", async (data) => {
        console.log(`🗑️ Tentativa de exclusão de produto: ${data.productId}`)

        try {
          const deletedProduct = await Product.findByIdAndDelete(data.productId)
          
          if (deletedProduct) {
            console.log(`✅ Produto excluído do MongoDB: ${deletedProduct.name}`)
            socket.emit("product-deleted", {
              productId: data.productId,
              message: "Produto excluído com sucesso!",
            })

            // Notificar todos os dispositivos
            io.emit("product-list-updated", {
              deletedProductId: data.productId,
            })
          } else {
            socket.emit("product-delete-error", "Produto não encontrado")
          }
        } catch (error) {
          console.error('❌ Erro ao excluir produto:', error)
          socket.emit("product-delete-error", "Erro interno ao excluir produto")
        }
      })

      // Obter lista de produtos
      socket.on("get-products", async () => {
        try {
          const products = await Product.find().sort({ createdAt: -1 })
          socket.emit("products-list", { products })
        } catch (error) {
          console.error('❌ Erro ao buscar produtos:', error)
          socket.emit("products-error", "Erro ao carregar produtos")
        }
      })

      // Buscar produto por código de barras
      socket.on("search-product-by-barcode", async (barcode) => {
        try {
          const product = await Product.findOne({ barcode })
          socket.emit("product-search-result", {
            barcode,
            product: product || null,
            found: !!product,
          })
        } catch (error) {
          console.error('❌ Erro ao buscar produto por código:', error)
          socket.emit("product-search-result", {
            barcode,
            product: null,
            found: false,
          })
        }
      })

      // Obter vendas
      socket.on("get-sales", async () => {
        try {
          const sales = await Sale.find().sort({ timestamp: -1 }).limit(100)
          socket.emit("sales-list", { sales })
        } catch (error) {
          console.error('❌ Erro ao buscar vendas:', error)
          socket.emit("sales-error", "Erro ao carregar vendas")
        }
      })

      // Buscar venda por código
      socket.on("search-sale-by-code", async (code) => {
        try {
          const sale = await Sale.findOne({ code })
          socket.emit("sale-search-result", {
            code,
            sale: sale || null,
            found: !!sale,
          })
        } catch (error) {
          console.error('❌ Erro ao buscar venda:', error)
          socket.emit("sale-search-result", {
            code,
            sale: null,
            found: false,
          })
        }
      })

      // Obter categorias
      socket.on("get-categories", async () => {
        try {
          const categories = await Category.find().sort({ name: 1 })
          socket.emit("categories-list", { categories })
        } catch (error) {
          console.error('❌ Erro ao buscar categorias:', error)
          socket.emit("categories-error", "Erro ao carregar categorias")
        }
      })

      // Adicionar categoria
      socket.on("add-category", async (categoryData) => {
        try {
          const existingCategory = await Category.findOne({ name: categoryData.name })
          if (existingCategory) {
            socket.emit("category-add-error", "Categoria já existe")
            return
          }

          const newCategory = new Category({
            name: categoryData.name,
            emoji: categoryData.emoji || "📦",
            isDefault: false
          })

          await newCategory.save()
          console.log(`✅ Categoria salva no MongoDB: ${newCategory.name}`)

          socket.emit("category-added", {
            category: newCategory,
            message: "Categoria adicionada com sucesso!",
          })

          // Notificar todos os dispositivos
          io.emit("categories-updated")
        } catch (error) {
          console.error('❌ Erro ao adicionar categoria:', error)
          socket.emit("category-add-error", "Erro interno ao adicionar categoria")
        }
      })

      // Remover categoria
      socket.on("delete-category", async (data) => {
        try {
          const category = await Category.findById(data.categoryId)
          if (!category) {
            socket.emit("category-delete-error", "Categoria não encontrada")
            return
          }

          if (category.isDefault) {
            socket.emit("category-delete-error", "Não é possível excluir categoria padrão")
            return
          }

          await Category.findByIdAndDelete(data.categoryId)
          console.log(`✅ Categoria excluída do MongoDB: ${category.name}`)

          socket.emit("category-deleted", {
            categoryId: data.categoryId,
            message: "Categoria excluída com sucesso!",
          })

          // Notificar todos os dispositivos
          io.emit("categories-updated")
        } catch (error) {
          console.error('❌ Erro ao excluir categoria:', error)
          socket.emit("category-delete-error", "Erro interno ao excluir categoria")
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
      const totalSales = await Sale.countDocuments()
      const salesData = await Sale.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$finalTotal" },
            totalProfit: { $sum: "$profit" }
          }
        }
      ])

      const stats = salesData[0] || { totalRevenue: 0, totalProfit: 0 }

      return {
        totalSales,
        totalRevenue: stats.totalRevenue,
        totalProfit: stats.totalProfit,
        connectedDevices: this.connections.size,
        activeCodes: this.syncCodes.size,
      }
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error)
      return {
        totalSales: 0,
        totalRevenue: 0,
        totalProfit: 0,
        connectedDevices: this.connections.size,
        activeCodes: this.syncCodes.size,
      }
    }
  }
}

// Inicializar sistema
const salesSystem = new SalesSystemServer()

// Rotas da API
app.get("/api/stats", async (req, res) => {
  const stats = await salesSystem.getStats()
  res.json(stats)
})

app.get("/api/sales", async (req, res) => {
  try {
    const sales = await Sale.find().sort({ timestamp: -1 }).limit(100)
    res.json(sales)
  } catch (error) {
    console.error('❌ Erro ao buscar vendas:', error)
    res.status(500).json({ error: "Erro ao buscar vendas" })
  }
})

app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 })
    res.json(products)
  } catch (error) {
    console.error('❌ Erro ao buscar produtos:', error)
    res.status(500).json({ error: "Erro ao buscar produtos" })
  }
})

app.post("/api/products", async (req, res) => {
  try {
    const productData = req.body

    // Validar dados
    if (!productData.name || !productData.price || !productData.category || !productData.barcode) {
      return res.status(400).json({ error: "Dados do produto incompletos" })
    }

    // Verificar se código de barras já existe
    const existingProduct = await Product.findOne({ barcode: productData.barcode })
    if (existingProduct) {
      return res.status(409).json({
        error: `Código de barras já existe no produto: ${existingProduct.name}`,
      })
    }

    // Criar novo produto
    const newProduct = new Product({
      name: productData.name,
      price: Number.parseFloat(productData.price),
      cost: Number.parseFloat(productData.cost) || 0,
      category: productData.category,
      bestseller: productData.bestseller || false,
      barcode: productData.barcode,
      emoji: salesSystem.getCategoryEmoji(productData.category),
      createdAt: new Date(),
    })

    await newProduct.save()

    res.status(201).json({
      success: true,
      product: newProduct,
      message: "Produto cadastrado com sucesso!",
    })
  } catch (error) {
    console.error('❌ Erro ao criar produto via API:', error)
    res.status(500).json({ error: "Erro interno do servidor" })
  }
})

app.get("/api/products/:barcode", async (req, res) => {
  try {
    const barcode = req.params.barcode
    const product = await Product.findOne({ barcode })

    if (product) {
      res.json({ found: true, product })
    } else {
      res.status(404).json({ found: false, message: "Produto não encontrado" })
    }
  } catch (error) {
    console.error('❌ Erro ao buscar produto por código:', error)
    res.status(500).json({ error: "Erro interno do servidor" })
  }
})

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 })
    res.json(categories)
  } catch (error) {
    console.error('❌ Erro ao buscar categorias:', error)
    res.status(500).json({ error: "Erro ao buscar categorias" })
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
      database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
      message: "LOJA VIALLI - Backend funcionando perfeitamente com MongoDB!",
      stats
    })
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "Erro ao obter status do sistema"
    })
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
  console.log(`💾 MongoDB: ${MONGODB_URI.includes('mongodb+srv') ? 'Atlas Cloud' : 'Local'}`)
})

// Tratamento de erros
process.on("uncaughtException", (err) => {
  console.error("❌ Erro não capturado:", err)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promise rejeitada:", reason)
})

module.exports = app
