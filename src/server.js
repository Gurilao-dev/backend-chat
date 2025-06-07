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
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json")
const MASTER_PASSWORD = "sitedogorilão"
const ADMIN_PASSWORD = "steam.jv.com"
const SITE_STATUS_FILE = path.join(DATA_DIR, "site_status.json")

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
  { id: "general", name: "Geral", description: "Chat principal", createdAt: new Date().toISOString() },
])
initializeFile(SESSIONS_FILE, {})
initializeFile(SITE_STATUS_FILE, { enabled: true })

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
const loadSessions = () => {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"))
  } catch {
    return {}
  }
}
const saveSessions = (sessions) => saveData(SESSIONS_FILE, sessions)
const loadSiteStatus = () => {
  try {
    return JSON.parse(fs.readFileSync(SITE_STATUS_FILE, "utf8"))
  } catch {
    return { enabled: true }
  }
}
const saveSiteStatus = (status) => saveData(SITE_STATUS_FILE, status)

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
        siteEnabled: loadSiteStatus().enabled,
      }),
    )
  } else if (req.url === "/admin/verify") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const data = JSON.parse(body)
        if (data.password === ADMIN_PASSWORD) {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(401, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, message: "Senha incorreta" }))
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, message: "Requisição inválida" }))
      }
    })
  } else if (req.url === "/admin/users") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(loadUsers()))
  } else if (req.url === "/admin/messages") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(loadMessages()))
  } else if (req.url === "/admin/site-status") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(loadSiteStatus()))
  } else if (req.url === "/admin/update-site-status") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const data = JSON.parse(body)
        saveSiteStatus(data)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: true }))

        // Notificar todos os clientes sobre a mudança de status
        broadcast({
          type: "siteStatusChanged",
          enabled: data.enabled,
        })
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, message: "Requisição inválida" }))
      }
    })
  } else if (req.url === "/admin/update-user") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const userData = JSON.parse(body)
        const users = loadUsers()
        const userIndex = users.findIndex((u) => u.id === userData.id)

        if (userIndex !== -1) {
          users[userIndex] = { ...users[userIndex], ...userData }
          saveUsers(users)

          // Notificar o usuário se estiver online
          for (const [ws, user] of connectedUsers.entries()) {
            if (user.id === userData.id) {
              ws.send(
                JSON.stringify({
                  type: "userUpdated",
                  user: users[userIndex],
                }),
              )
              break
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(404, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, message: "Usuário não encontrado" }))
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, message: "Requisição inválida" }))
      }
    })
  } else if (req.url === "/admin/delete-user") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const data = JSON.parse(body)
        const users = loadUsers()
        const userIndex = users.findIndex((u) => u.id === data.userId)

        if (userIndex !== -1) {
          users.splice(userIndex, 1)
          saveUsers(users)

          // Desconectar o usuário se estiver online
          for (const [ws, user] of connectedUsers.entries()) {
            if (user.id === data.userId) {
              ws.send(
                JSON.stringify({
                  type: "accountDeleted",
                }),
              )
              ws.close()
              break
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(404, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, message: "Usuário não encontrado" }))
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, message: "Requisição inválida" }))
      }
    })
  } else if (req.url === "/admin/ban-user") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const data = JSON.parse(body)
        const users = loadUsers()
        const userIndex = users.findIndex((u) => u.id === data.userId)

        if (userIndex !== -1) {
          users[userIndex].banned = data.banned
          saveUsers(users)

          // Notificar o usuário se estiver online
          for (const [ws, user] of connectedUsers.entries()) {
            if (user.id === data.userId) {
              ws.send(
                JSON.stringify({
                  type: "userBanned",
                  banned: data.banned,
                }),
              )
              if (data.banned) {
                ws.close()
              }
              break
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(404, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, message: "Usuário não encontrado" }))
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, message: "Requisição inválida" }))
      }
    })
  } else if (req.url === "/admin/clear-chat") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const data = JSON.parse(body)
        let messages = loadMessages()

        if (data.type === "all") {
          messages = []
        } else if (data.type === "images") {
          messages = messages.filter((m) => m.type !== "image")
        } else if (data.type === "text") {
          messages = messages.filter((m) => m.type !== "text")
        }

        saveMessages(messages)

        // Notificar todos os clientes
        broadcast({
          type: "chatCleared",
          clearType: data.type,
        })

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: true }))
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, message: "Requisição inválida" }))
      }
    })
  } else if (req.url === "/check-session") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const data = JSON.parse(body)
        const sessions = loadSessions()
        const sessionData = sessions[data.sessionId]

        if (sessionData) {
          const users = loadUsers()
          const user = users.find((u) => u.id === sessionData.userId)

          if (user) {
            if (user.banned) {
              res.writeHead(403, { "Content-Type": "application/json" })
              res.end(
                JSON.stringify({
                  success: false,
                  message: "Sua conta foi banida. Entre em contato com um administrador.",
                }),
              )
            } else {
              res.writeHead(200, { "Content-Type": "application/json" })
              res.end(
                JSON.stringify({
                  success: true,
                  user,
                  siteEnabled: loadSiteStatus().enabled,
                }),
              )
            }
          } else {
            res.writeHead(404, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ success: false, message: "Usuário não encontrado" }))
          }
        } else {
          res.writeHead(401, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, message: "Sessão inválida" }))
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, message: "Requisição inválida" }))
      }
    })
  } else if (req.url === "/admin/delete-message") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const data = JSON.parse(body)
        const messages = loadMessages()
        const messageIndex = messages.findIndex((m) => m.id === data.messageId)

        if (messageIndex !== -1) {
          messages.splice(messageIndex, 1)
          saveMessages(messages)

          // Notificar todos os clientes
          broadcast({
            type: "messageDeleted",
            messageId: data.messageId,
            deleteType: "forEveryone",
          })

          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(404, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, message: "Mensagem não encontrada" }))
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, message: "Requisição inválida" }))
      }
    })
  } else {
    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Not found" }))
  }
})

// WebSocket Server
const wss = new WebSocketServer({
  server,
  perMessageDeflate: false,
  clientTracking: true,
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
  const roomUsers = roomId ? users.filter((user) => userRooms.get(user.id) === roomId) : users

  const userList = roomUsers.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    color: user.color,
    avatar: user.avatar,
    status: user.status || "online",
    lastSeen: user.lastSeen,
  }))

  const broadcastData = {
    type: "userList",
    users: userList,
    roomId,
  }

  if (roomId) {
    broadcastToRoom(roomId, broadcastData)
  } else {
    broadcast(broadcastData)
  }
}

const broadcastTyping = (roomId) => {
  const typing = Array.from(typingUsers.get(roomId) || [])
  const typingUserNames = typing
    .map((userId) => {
      const user = Array.from(connectedUsers.values()).find((u) => u.id === userId)
      return user ? user.name : null
    })
    .filter(Boolean)

  broadcastToRoom(roomId, {
    type: "typing",
    users: typingUserNames,
    roomId,
  })
}

// Handlers
const handleAuth = (ws, message) => {
  console.log("🔐 Verificando senha master:", message.masterPassword)
  if (message.masterPassword === MASTER_PASSWORD) {
    console.log("✅ Senha master correta!")
    ws.send(
      JSON.stringify({
        type: "authSuccess",
        message: "🔓 Acesso liberado! Bem-vindo ao GORILA CHAT.",
      }),
    )
  } else {
    console.log("❌ Senha master incorreta!")
    ws.send(
      JSON.stringify({
        type: "authError",
        message: "❌ Senha incorreta! Acesso negado.",
      }),
    )
  }
}

const handleRegister = (ws, message) => {
  const users = loadUsers()
  const existingUser = users.find((u) => u.email === message.email)

  if (existingUser) {
    ws.send(
      JSON.stringify({
        type: "registerError",
        message: "📧 Email já cadastrado! Tente fazer login.",
      }),
    )
    return
  }

  // Verificar se o email termina com @gorila.chat
  if (!message.email.endsWith("@gorila.chat")) {
    ws.send(
      JSON.stringify({
        type: "registerError",
        message: "📧 Apenas emails @gorila.chat são permitidos.",
      }),
    )
    return
  }

  // Verificar se a senha foi fornecida
  if (!message.password || message.password.length < 6) {
    ws.send(
      JSON.stringify({
        type: "registerError",
        message: "🔑 A senha deve ter pelo menos 6 caracteres.",
      }),
    )
    return
  }

  const newUser = {
    id: crypto.randomUUID(),
    name: message.name,
    email: message.email,
    password: message.password, // Em produção, deveria ser hash
    color: message.color,
    avatar: message.avatar,
    profileImage: message.profileImage || null,
    status: "online",
    banned: false,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  }

  users.push(newUser)
  saveUsers(users)
  connectedUsers.set(ws, newUser)
  userRooms.set(newUser.id, "general")

  // Criar sessão para o usuário
  const sessionId = crypto.randomUUID()
  const sessions = loadSessions()
  sessions[sessionId] = {
    userId: newUser.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dias
  }
  saveSessions(sessions)

  const rooms = loadRooms()
  const messages = loadMessages()
    .filter((m) => m.roomId === "general")
    .slice(-50)

  ws.send(
    JSON.stringify({
      type: "registerSuccess",
      user: newUser,
      sessionId,
      rooms,
      messages,
      currentRoom: "general",
    }),
  )

  broadcastUserList("general")
}

const handleLogin = (ws, message) => {
  const users = loadUsers()
  const user = users.find((u) => u.email === message.email)

  if (!user) {
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "👤 Usuário não encontrado! Verifique seus dados.",
      }),
    )
    return
  }

  // Verificar senha
  if (user.password !== message.password) {
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "🔑 Senha incorreta! Tente novamente.",
      }),
    )
    return
  }

  // Verificar se o usuário está banido
  if (user.banned) {
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "🚫 Sua conta foi banida. Entre em contato com um administrador.",
      }),
    )
    return
  }

  user.status = "online"
  user.lastSeen = new Date().toISOString()
  saveUsers(users)

  connectedUsers.set(ws, user)
  userRooms.set(user.id, "general")

  // Criar sessão para o usuário
  const sessionId = crypto.randomUUID()
  const sessions = loadSessions()
  sessions[sessionId] = {
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dias
  }
  saveSessions(sessions)

  const rooms = loadRooms()
  const messages = loadMessages()
    .filter((m) => m.roomId === "general")
    .slice(-50)

  ws.send(
    JSON.stringify({
      type: "loginSuccess",
      user,
      sessionId,
      rooms,
      messages,
      currentRoom: "general",
      siteEnabled: loadSiteStatus().enabled,
    }),
  )

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
    replyTo: message.replyTo || null,
  }

  const messages = loadMessages()
  messages.push(newMessage)
  saveMessages(messages)

  broadcastToRoom(roomId, {
    type: "newMessage",
    message: newMessage,
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
  const messageIndex = messages.findIndex((m) => m.id === message.messageId)

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
      roomId,
    })
  } else if (message.deleteType === "forMe") {
    ws.send(
      JSON.stringify({
        type: "messageDeleted",
        messageId: message.messageId,
        deleteType: "forMe",
        userId: user.id,
        roomId,
      }),
    )
  }
}

const handleReaction = (ws, message) => {
  const user = connectedUsers.get(ws)
  if (!user) return

  const messages = loadMessages()
  const messageToUpdate = messages.find((m) => m.id === message.messageId)

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
    roomId: messageToUpdate.roomId,
  })
}

const handleUpdateProfile = (ws, message) => {
  const user = connectedUsers.get(ws)
  if (!user) return

  const users = loadUsers()
  const userIndex = users.findIndex((u) => u.id === user.id)

  if (userIndex === -1) return

  // Atualizar campos permitidos
  if (message.name) users[userIndex].name = message.name
  if (message.profileImage) users[userIndex].profileImage = message.profileImage

  // Atualizar o usuário conectado
  connectedUsers.set(ws, users[userIndex])

  saveUsers(users)

  ws.send(
    JSON.stringify({
      type: "profileUpdated",
      user: users[userIndex],
    }),
  )

  // Atualizar lista de usuários para todos
  broadcastUserList()
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
  const messages = loadMessages()
    .filter((m) => m.roomId === newRoomId)
    .slice(-50)

  ws.send(
    JSON.stringify({
      type: "roomJoined",
      roomId: newRoomId,
      messages,
    }),
  )

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
    const userIndex = users.findIndex((u) => u.id === user.id)
    if (userIndex > -1) {
      users[userIndex].status = "offline"
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
        case "updateProfile":
          handleUpdateProfile(ws, message)
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
setInterval(
  () => {
    const messages = loadMessages()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const filteredMessages = messages.filter((m) => new Date(m.timestamp) > oneWeekAgo)

    if (filteredMessages.length !== messages.length) {
      saveMessages(filteredMessages)
      console.log(`🧹 Limpeza automática: ${messages.length - filteredMessages.length} mensagens antigas removidas`)
    }
  },
  24 * 60 * 60 * 1000,
) // Executar diariamente

// Limpeza de sessões expiradas
setInterval(
  () => {
    const sessions = loadSessions()
    const now = new Date()
    let changed = false

    Object.keys(sessions).forEach((sessionId) => {
      if (new Date(sessions[sessionId].expiresAt) < now) {
        delete sessions[sessionId]
        changed = true
      }
    })

    if (changed) {
      saveSessions(sessions)
      console.log("🧹 Sessões expiradas removidas")
    }
  },
  6 * 60 * 60 * 1000,
) // Executar a cada 6 horas

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
