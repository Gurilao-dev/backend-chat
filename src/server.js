const { WebSocketServer } = require("ws")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const http = require("http")

// Configurações
const PORT = process.env.PORT || 8080
const DATA_DIR = path.join(__dirname, "data")
const USERS_FILE = path.join(DATA_DIR, "users.json")
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json")
const ROOMS_FILE = path.join(DATA_DIR, "rooms.json")
const MASTER_PASSWORD = "sitedogorilão" 

// Criar diretório de dados
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// Inicializar arquivos JSON
const initializeFile = (filePath, defaultData = []) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2))
  }
}

initializeFile(USERS_FILE)
initializeFile(MESSAGES_FILE)
initializeFile(ROOMS_FILE, [
  { id: "general", name: "Geral", description: "Chat principal", createdAt: new Date().toISOString() }
])

// Funções de dados
const loadData = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return []
  }
}

const saveData = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

const loadUsers = () => loadData(USERS_FILE)
const saveUsers = (users) => saveData(USERS_FILE, users)
const loadMessages = () => loadData(MESSAGES_FILE)
const saveMessages = (messages) => saveData(MESSAGES_FILE, messages)
const loadRooms = () => loadData(ROOMS_FILE)
const saveRooms = (rooms) => saveData(ROOMS_FILE, rooms)

// Estado do servidor
const connectedUsers = new Map()
const userRooms = new Map() // userId -> roomId
const typingUsers = new Map() // roomId -> Set of userIds

// Criar servidor HTTP para o Render
const server = http.createServer((req, res) => {
  // Configurar CORS para permitir conexões do InfinityFree
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        status: "ok",
        message: "GORILA CHAT Backend is running!",
        timestamp: new Date().toISOString(),
        connectedUsers: connectedUsers.size,
      }),
    )
  } else {
    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Not found" }))
  }
})

// WebSocket Server
const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: false,
  clientTracking: true
})

// Funções de broadcast
const broadcast = (data, excludeWs = null, roomId = null) => {
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === client.OPEN) {
      const user = connectedUsers.get(client)
      if (!roomId || (user && userRooms.get(user.id) === roomId)) {
        client.send(JSON.stringify(data))
      }
    }
  })
}

const broadcastToRoom = (roomId, data, excludeWs = null) => {
  broadcast(data, excludeWs, roomId)
}

const broadcastUserList = (roomId = null) => {
  const users = Array.from(connectedUsers.values())
  const roomUsers = roomId 
    ? users.filter(user => userRooms.get(user.id) === roomId)
    : users

  const userList = roomUsers.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    color: user.color,
    avatar: user.avatar,
    status: user.status || 'online',
    lastSeen: user.lastSeen
  }))

  const broadcastData = {
    type: "userList",
    users: userList,
    roomId
  }

  if (roomId) {
    broadcastToRoom(roomId, broadcastData)
  } else {
    broadcast(broadcastData)
  }
}

const broadcastTyping = (roomId) => {
  const typing = Array.from(typingUsers.get(roomId) || [])
  const typingUserNames = typing.map(userId => {
    const user = Array.from(connectedUsers.values()).find(u => u.id === userId)
    return user ? user.name : null
  }).filter(Boolean)

  broadcastToRoom(roomId, {
    type: "typing",
    users: typingUserNames,
    roomId
  })
}

// Handlers
const handleAuth = (ws, message) => {
  console.log("🔐 Verificando senha master:", message.masterPassword)
  if (message.masterPassword === MASTER_PASSWORD) {
    console.log("✅ Senha master correta!")
    ws.send(JSON.stringify({
      type: "authSuccess",
      message: "🔓 Acesso liberado! Bem-vindo ao GORILA CHAT."
    }))
  } else {
    console.log("❌ Senha master incorreta!")
    ws.send(JSON.stringify({
      type: "authError",
      message: "❌ Senha incorreta! Acesso negado."
    }))
  }
}

const handleRegister = (ws, message) => {
  const users = loadUsers()
  const existingUser = users.find(u => u.email === message.email)

  if (existingUser) {
    ws.send(JSON.stringify({
      type: "registerError",
      message: "📧 Email já cadastrado! Tente fazer login."
    }))
    return
  }

  const newUser = {
    id: crypto.randomUUID(),
    name: message.name,
    email: message.email,
    color: message.color,
    avatar: message.avatar,
    status: 'online',
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  }

  users.push(newUser)
  saveUsers(users)
  connectedUsers.set(ws, newUser)
  userRooms.set(newUser.id, "general")

  const rooms = loadRooms()
  const messages = loadMessages().filter(m => m.roomId === "general").slice(-50)

  ws.send(JSON.stringify({
    type: "registerSuccess",
    user: newUser,
    rooms,
    messages,
    currentRoom: "general"
  }))

  broadcastUserList("general")
}

const handleLogin = (ws, message) => {
  const users = loadUsers()
  const user = users.find(u => u.email === message.email && u.name === message.name)

  if (!user) {
    ws.send(JSON.stringify({
      type: "loginError",
      message: "👤 Usuário não encontrado! Verifique seus dados."
    }))
    return
  }

  user.status = 'online'
  user.lastSeen = new Date().toISOString()
  saveUsers(users)

  connectedUsers.set(ws, user)
  userRooms.set(user.id, "general")

  const rooms = loadRooms()
  const messages = loadMessages().filter(m => m.roomId === "general").slice(-50)

  ws.send(JSON.stringify({
    type: "loginSuccess",
    user,
    rooms,
    messages,
    currentRoom: "general"
  }))

  broadcastUserList("general")
}

const handleMessage = (ws, message) => {
  const user = connectedUsers.get(ws)
  if (!user) return

  const roomId = userRooms.get(user.id) || "general"

  const newMessage = {
    id: crypto.randomUUID(),
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    userColor: user.color,
    userAvatar: user.avatar,
    content: message.content,
    type: message.messageType || "text",
    roomId,
    timestamp: new Date().toISOString(),
    readBy: [user.id],
    reactions: {},
    edited: false,
    replyTo: message.replyTo || null
  }

  const messages = loadMessages()
  messages.push(newMessage)
  saveMessages(messages)

  broadcastToRoom(roomId, {
    type: "newMessage",
    message: newMessage
  })

  // Remover usuário da lista de digitando
  const typing = typingUsers.get(roomId)
  if (typing && typing.has(user.id)) {
    typing.delete(user.id)
    broadcastTyping(roomId)
  }
}

const handleDeleteMessage = (ws, message) => {
  const user = connectedUsers.get(ws)
  if (!user) return

  const messages = loadMessages()
  const messageIndex = messages.findIndex(m => m.id === message.messageId)

  if (messageIndex === -1) return

  const messageToDelete = messages[messageIndex]
  const roomId = messageToDelete.roomId

  if (messageToDelete.userId !== user.id && message.deleteType !== "forEveryone") {
    return
  }

  if (message.deleteType === "forEveryone" && messageToDelete.userId === user.id) {
    messages.splice(messageIndex, 1)
    saveMessages(messages)

    broadcastToRoom(roomId, {
      type: "messageDeleted",
      messageId: message.messageId,
      deleteType: "forEveryone",
      roomId
    })
  } else if (message.deleteType === "forMe") {
    ws.send(JSON.stringify({
      type: "messageDeleted",
      messageId: message.messageId,
      deleteType: "forMe",
      userId: user.id,
      roomId
    }))
  }
}

const handleReaction = (ws, message) => {
  const user = connectedUsers.get(ws)
  if (!user) return

  const messages = loadMessages()
  const messageToUpdate = messages.find(m => m.id === message.messageId)

  if (!messageToUpdate) return

  if (!messageToUpdate.reactions) {
    messageToUpdate.reactions = {}
  }

  const emoji = message.emoji
  if (!messageToUpdate.reactions[emoji]) {
    messageToUpdate.reactions[emoji] = []
  }

  const userIndex = messageToUpdate.reactions[emoji].indexOf(user.id)
  if (userIndex > -1) {
    messageToUpdate.reactions[emoji].splice(userIndex, 1)
    if (messageToUpdate.reactions[emoji].length === 0) {
      delete messageToUpdate.reactions[emoji]
    }
  } else {
    messageToUpdate.reactions[emoji].push(user.id)
  }

  saveMessages(messages)

  broadcastToRoom(messageToUpdate.roomId, {
    type: "messageReaction",
    messageId: message.messageId,
    reactions: messageToUpdate.reactions,
    roomId: messageToUpdate.roomId
  })
}

const handleJoinRoom = (ws, message) => {
  const user = connectedUsers.get(ws)
  if (!user) return

  const oldRoomId = userRooms.get(user.id)
  const newRoomId = message.roomId

  userRooms.set(user.id, newRoomId)

  // Remover das listas de digitando
  if (oldRoomId) {
    const oldTyping = typingUsers.get(oldRoomId)
    if (oldTyping && oldTyping.has(user.id)) {
      oldTyping.delete(user.id)
      broadcastTyping(oldRoomId)
    }
    broadcastUserList(oldRoomId)
  }

  // Enviar dados da nova sala
  const messages = loadMessages().filter(m => m.roomId === newRoomId).slice(-50)
  
  ws.send(JSON.stringify({
    type: "roomJoined",
    roomId: newRoomId,
    messages
  }))

  broadcastUserList(newRoomId)
}

const handleTyping = (ws, message) => {
  const user = connectedUsers.get(ws)
  if (!user) return

  const roomId = userRooms.get(user.id)
  if (!roomId) return

  if (!typingUsers.has(roomId)) {
    typingUsers.set(roomId, new Set())
  }

  const typing = typingUsers.get(roomId)

  if (message.isTyping) {
    typing.add(user.id)
    // Auto-remover após 3 segundos
    setTimeout(() => {
      typing.delete(user.id)
      broadcastTyping(roomId)
    }, 3000)
  } else {
    typing.delete(user.id)
  }

  broadcastTyping(roomId)
}

const handleDisconnect = (ws) => {
  const user = connectedUsers.get(ws)
  if (user) {
    const roomId = userRooms.get(user.id)
    
    // Atualizar status do usuário
    const users = loadUsers()
    const userIndex = users.findIndex(u => u.id === user.id)
    if (userIndex > -1) {
      users[userIndex].status = 'offline'
      users[userIndex].lastSeen = new Date().toISOString()
      saveUsers(users)
    }

    // Remover das listas
    connectedUsers.delete(ws)
    userRooms.delete(user.id)

    // Remover da lista de digitando
    if (roomId) {
      const typing = typingUsers.get(roomId)
      if (typing && typing.has(user.id)) {
        typing.delete(user.id)
        broadcastTyping(roomId)
      }
      broadcastUserList(roomId)
    }
  }
}

// Conexão WebSocket
wss.on("connection", (ws) => {
  console.log("🔗 Cliente conectado")

  ws.on("error", (error) => {
    console.error("❌ Erro WebSocket:", error)
  })

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString())
      console.log("📩 Mensagem recebida:", message.type)

      switch (message.type) {
        case "auth":
          handleAuth(ws, message)
          break
        case "login":
          handleLogin(ws, message)
          break
        case "register":
          handleRegister(ws, message)
          break
        case "message":
          handleMessage(ws, message)
          break
        case "deleteMessage":
          handleDeleteMessage(ws, message)
          break
        case "reaction":
          handleReaction(ws, message)
          break
        case "joinRoom":
          handleJoinRoom(ws, message)
          break
        case "typing":
          handleTyping(ws, message)
          break
        case "disconnect":
          handleDisconnect(ws)
          break
        default:
          console.log("❓ Tipo de mensagem desconhecido:", message.type)
      }
    } catch (error) {
      console.error("💥 Erro ao processar mensagem:", error)
    }
  })

  ws.on("close", () => {
    handleDisconnect(ws)
    console.log("🔌 Cliente desconectado")
  })
})

// Limpeza automática de mensagens antigas (opcional)
setInterval(() => {
  const messages = loadMessages()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  
  const filteredMessages = messages.filter(m => new Date(m.timestamp) > oneWeekAgo)
  
  if (filteredMessages.length !== messages.length) {
    saveMessages(filteredMessages)
    console.log(`🧹 Limpeza automática: ${messages.length - filteredMessages.length} mensagens antigas removidas`)
  }
}, 24 * 60 * 60 * 1000) // Executar diariamente

// Iniciar o servidor
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🦍 GORILA CHAT Backend rodando na porta ${PORT}`)
  console.log(`📁 Dados salvos em: ${DATA_DIR}`)
  console.log(`🌐 Health check disponível em: /health`)
})

// Adicionar tratamento de erros
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully")
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})
