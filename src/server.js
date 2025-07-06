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
