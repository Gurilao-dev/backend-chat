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
  },
})

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, "public")))

// Armazenar conexões e códigos de sincronização
const connections = new Map()
const syncCodes = new Map()

// Produtos disponíveis
const products = [
  { id: 1, name: "Smartphone Samsung Galaxy", price: 899.99, category: "Eletrônicos" },
  { id: 2, name: "Notebook Dell Inspiron", price: 2499.99, category: "Informática" },
  { id: 3, name: "Fone de Ouvido Bluetooth", price: 199.99, category: "Áudio" },
  { id: 4, name: 'Smart TV 55" LG', price: 1899.99, category: "Eletrônicos" },
  { id: 5, name: "Mouse Gamer Logitech", price: 149.99, category: "Informática" },
  { id: 6, name: "Teclado Mecânico RGB", price: 299.99, category: "Informática" },
  { id: 7, name: "Câmera Digital Canon", price: 1299.99, category: "Fotografia" },
  { id: 8, name: "Tablet iPad Air", price: 2199.99, category: "Eletrônicos" },
  { id: 9, name: "Smartwatch Apple Watch", price: 1599.99, category: "Wearables" },
  { id: 10, name: "Console PlayStation 5", price: 2999.99, category: "Games" },
  { id: 11, name: "Headset Gamer HyperX", price: 399.99, category: "Games" },
  { id: 12, name: 'Monitor 27" 4K', price: 1199.99, category: "Informática" },
  { id: 13, name: "Impressora HP LaserJet", price: 699.99, category: "Escritório" },
  { id: 14, name: "Roteador Wi-Fi 6", price: 299.99, category: "Rede" },
  { id: 15, name: "SSD 1TB Samsung", price: 449.99, category: "Armazenamento" },
  { id: 16, name: "Webcam Logitech 4K", price: 199.99, category: "Informática" },
  { id: 17, name: "Alto-falante Bluetooth JBL", price: 249.99, category: "Áudio" },
  { id: 18, name: "Power Bank 20000mAh", price: 99.99, category: "Acessórios" },
  { id: 19, name: "Cabo USB-C Premium", price: 49.99, category: "Acessórios" },
  { id: 20, name: "Suporte para Notebook", price: 79.99, category: "Acessórios" },
]

// Armazenar vendas
const sales = new Map()

io.on("connection", (socket) => {
  console.log("Novo cliente conectado:", socket.id)

  // Gerar código de sincronização para dispositivos móveis
  socket.on("generate-sync-code", () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    syncCodes.set(code, socket.id)
    connections.set(socket.id, { type: "mobile", code, paired: false })

    socket.emit("sync-code-generated", code)
    console.log("Código gerado:", code, "para socket:", socket.id)
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
          discount: 0,
        })

        connections.set(mobileSocketId, {
          ...mobileConnection,
          paired: true,
          pairedWith: socket.id,
        })

        // Notificar ambos os dispositivos
        socket.emit("connection-success", { products })
        io.to(mobileSocketId).emit("paired-successfully")

        console.log("Dispositivos pareados:", socket.id, "e", mobileSocketId)
      } else {
        socket.emit("connection-error", "Código já está em uso")
      }
    } else {
      socket.emit("connection-error", "Código inválido")
    }
  })

  // Adicionar item ao carrinho (do dispositivo móvel)
  socket.on("add-item", () => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "mobile" && connection.paired) {
      const desktopSocketId = connection.pairedWith
      const desktopConnection = connections.get(desktopSocketId)

      if (desktopConnection) {
        // Selecionar produto aleatório
        const randomProduct = products[Math.floor(Math.random() * products.length)]
        const cartItem = {
          ...randomProduct,
          quantity: 1,
          cartId: uuidv4(),
        }

        desktopConnection.cart.push(cartItem)
        desktopConnection.total = desktopConnection.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

        // Atualizar carrinho no desktop
        io.to(desktopSocketId).emit("cart-updated", {
          cart: desktopConnection.cart,
          total: desktopConnection.total,
        })

        console.log("Item adicionado:", randomProduct.name)
      }
    }
  })

  // Remover item do carrinho
  socket.on("remove-item", (cartId) => {
    const connection = connections.get(socket.id)

    if (connection && connection.type === "desktop") {
      connection.cart = connection.cart.filter((item) => item.cartId !== cartId)
      connection.total = connection.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

      socket.emit("cart-updated", {
        cart: connection.cart,
        total: connection.total,
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
      const sale = {
        id: saleId,
        items: connection.cart,
        subtotal: connection.total,
        discount: connection.discount,
        finalTotal: connection.total * (1 - connection.discount / 100),
        paidAmount: saleData.paidAmount,
        change: saleData.change,
        timestamp: new Date().toISOString(),
        code: saleId.substring(0, 8).toUpperCase(),
      }

      sales.set(saleId, sale)

      // Limpar carrinho
      connection.cart = []
      connection.total = 0
      connection.discount = 0

      socket.emit("sale-finalized", {
        saleCode: sale.code,
        sale,
      })

      socket.emit("cart-updated", {
        cart: connection.cart,
        total: connection.total,
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

  // Desconexão
  socket.on("disconnect", () => {
    const connection = connections.get(socket.id)

    if (connection) {
      // Se for móvel, remover código de sincronização
      if (connection.type === "mobile" && connection.code) {
        syncCodes.delete(connection.code)
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
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
