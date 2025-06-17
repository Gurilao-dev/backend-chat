const { WebSocketServer } = require("ws")
const express = require("express")
const cors = require("cors")
const multer = require("multer")
const { v4: uuidv4 } = require("uuid")
const dotenv = require("dotenv")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const bcrypt = require("bcrypt")

dotenv.config()

// Configurações de Segurança
const SECURITY_CONFIG = {
  MAX_PASSWORD_LENGTH: 12,
  ENCRYPTED_PASSWORD_LENGTH: 40,
  ENCRYPTION_ALGORITHM: "aes-256-cbc",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex"),
  SALT_ROUNDS: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_TIME: 15 * 60 * 1000, // 15 minutos
}

// Senhas Criptografadas (40 caracteres cada)
const ENCRYPTED_PASSWORDS = {
  ACCESS: encryptPassword("gorilachat"), // Senha de acesso ao chat
  ADMIN: encryptPassword("admin123"), // Senha de administrador
  MASTER: encryptPassword("sitedogorilão"), // Senha master
}

// Sistema de Criptografia
function encryptPassword(password) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipher(SECURITY_CONFIG.ENCRYPTION_ALGORITHM, SECURITY_CONFIG.ENCRYPTION_KEY)
  let encrypted = cipher.update(password, "utf8", "hex")
  encrypted += cipher.final("hex")
  return iv.toString("hex") + ":" + encrypted
}

function decryptPassword(encryptedPassword) {
  try {
    const textParts = encryptedPassword.split(":")
    const iv = Buffer.from(textParts.shift(), "hex")
    const encryptedText = textParts.join(":")
    const decipher = crypto.createDecipher(SECURITY_CONFIG.ENCRYPTION_ALGORITHM, SECURITY_CONFIG.ENCRYPTION_KEY)
    let decrypted = decipher.update(encryptedText, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
  } catch (error) {
    return null
  }
}

function validatePassword(inputPassword, encryptedPassword) {
  if (inputPassword.length > SECURITY_CONFIG.MAX_PASSWORD_LENGTH) {
    return false
  }
  const decrypted = decryptPassword(encryptedPassword)
  return decrypted === inputPassword
}

// Configurar Express
const app = express()
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  }),
)
app.use(express.json({ limit: "10mb" }))
app.use(express.static(path.join(__dirname, "../public")))

// Configurar Multer para upload de arquivos
const uploadDir = path.join(__dirname, "../uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    cb(null, uniqueSuffix + ext)
  },
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error("Apenas imagens são permitidas!"))
    }
  },
})

// WebSocket Server
const wss = new WebSocketServer({ port: process.env.WS_PORT || 8080 })

// Armazenamento em memória seguro
const secureStore = {
  users: new Map(),
  messages: [],
  groups: new Map(),
  reports: [],
  sessions: new Map(),
  adminSessions: new Map(),
  loginAttempts: new Map(),
  bannedIPs: new Set(),
  settings: {
    maintenanceMode: false,
    maxMessageLength: 1000,
    messageRateLimit: 30,
    allowImages: true,
    allowReactions: true,
    registrationEnabled: true,
    autoModeration: false,
    bannedWords: [],
  },
}

// Conexões ativas
const activeConnections = new Map()

// Sistema de Rate Limiting
const rateLimiter = new Map()

function checkRateLimit(userId, action = "message") {
  const key = `${userId}_${action}`
  const now = Date.now()
  const limit = action === "message" ? secureStore.settings.messageRateLimit : 10
  const window = 60 * 1000 // 1 minuto

  if (!rateLimiter.has(key)) {
    rateLimiter.set(key, [])
  }

  const attempts = rateLimiter.get(key)
  const recentAttempts = attempts.filter((time) => now - time < window)

  if (recentAttempts.length >= limit) {
    return false
  }

  recentAttempts.push(now)
  rateLimiter.set(key, recentAttempts)
  return true
}

// Inicializar grupo padrão
const defaultGroup = {
  id: "general",
  name: "GorilaChat Geral",
  description: "Chat Público Seguro",
  avatar: "🦍",
  color: "#9ACD32",
  createdBy: "system",
  admins: ["system"],
  members: [],
  createdAt: new Date().toISOString(),
  settings: {
    onlyAdminsCanMessage: false,
    onlyAdminsCanAddMembers: false,
    maxMessageLength: secureStore.settings.maxMessageLength,
  },
}

secureStore.groups.set("general", defaultGroup)

// Rotas Express
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" })
    }

    const publicUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`

    res.json({
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
    })
  } catch (error) {
    console.error("Erro no upload:", error)
    res.status(500).json({ error: "Erro no upload do arquivo" })
  }
})

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    maintenance: secureStore.settings.maintenanceMode,
    timestamp: new Date().toISOString(),
    version: "2.0.0",
  })
})

app.get("/stats", (req, res) => {
  const stats = {
    totalUsers: secureStore.users.size,
    onlineUsers: Array.from(activeConnections.values()).length,
    totalMessages: secureStore.messages.length,
    totalGroups: secureStore.groups.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  }
  res.json(stats)
})

// Servir arquivos estáticos
app.use("/uploads", express.static(uploadDir))

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"))
})

// Iniciar servidor Express
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🔒 Servidor HTTP Seguro rodando na porta ${PORT}`)
  console.log(`🔐 Sistema de criptografia ativado`)
  console.log(`🛡️ Proteções de segurança habilitadas`)
})

// WebSocket Connection Handler
wss.on("connection", (ws, req) => {
  console.log("🔌 Nova conexão segura estabelecida")

  const clientIP = req.socket.remoteAddress

  // Verificar IP banido
  if (secureStore.bannedIPs.has(clientIP)) {
    ws.close(1008, "IP banido")
    return
  }

  ws.on("error", (error) => {
    console.error("❌ Erro WebSocket:", error)
  })

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString())
      await handleSecureMessage(ws, message, clientIP)
    } catch (error) {
      console.error("❌ Erro ao processar mensagem:", error)
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Erro interno do servidor",
        }),
      )
    }
  })

  ws.on("close", async () => {
    await handleSecureDisconnection(ws)
  })
})

// Handlers de mensagens seguras
async function handleSecureMessage(ws, message, clientIP) {
  // Verificar modo manutenção
  if (secureStore.settings.maintenanceMode && message.type !== "auth" && message.type !== "adminAuth") {
    ws.send(
      JSON.stringify({
        type: "maintenanceMode",
        message: "Sistema em manutenção. Tente novamente mais tarde.",
      }),
    )
    return
  }

  switch (message.type) {
    case "auth":
      await handleSecureAuth(ws, message, clientIP)
      break
    case "adminAuth":
      await handleSecureAdminAuth(ws, message, clientIP)
      break
    case "login":
      await handleSecureLogin(ws, message, clientIP)
      break
    case "register":
      await handleSecureRegister(ws, message, clientIP)
      break
    case "message":
      await handleSecureChatMessage(ws, message)
      break
    case "privateMessage":
      await handleSecurePrivateMessage(ws, message)
      break
    case "getUsers":
      await handleGetUsers(ws)
      break
    case "getMessages":
      await handleGetMessages(ws, message)
      break
    case "updateProfile":
      await handleUpdateProfile(ws, message)
      break
    case "reaction":
      await handleReaction(ws, message)
      break
    case "deleteMessage":
      await handleDeleteMessage(ws, message)
      break
    // Admin handlers
    case "adminGetUsers":
      await handleAdminGetUsers(ws)
      break
    case "adminGetMessages":
      await handleAdminGetMessages(ws)
      break
    case "adminBanUser":
      await handleAdminBanUser(ws, message)
      break
    case "adminDeleteUser":
      await handleAdminDeleteUser(ws, message)
      break
    case "adminUpdateSettings":
      await handleAdminUpdateSettings(ws, message)
      break
    case "adminClearMessages":
      await handleAdminClearMessages(ws)
      break
    default:
      console.log("❓ Tipo de mensagem desconhecido:", message.type)
  }
}

// Auth handlers seguros
async function handleSecureAuth(ws, message, clientIP) {
  const key = `auth_${clientIP}`

  if (!checkRateLimit(clientIP, "auth")) {
    ws.send(
      JSON.stringify({
        type: "auth_error",
        message: "Muitas tentativas. Tente novamente em 1 minuto.",
      }),
    )
    return
  }

  if (!message.password || message.password.length > SECURITY_CONFIG.MAX_PASSWORD_LENGTH) {
    ws.send(
      JSON.stringify({
        type: "auth_error",
        message: "Senha inválida",
      }),
    )
    return
  }

  // Verificar senha de acesso
  if (
    validatePassword(message.password, ENCRYPTED_PASSWORDS.ACCESS) ||
    validatePassword(message.password, ENCRYPTED_PASSWORDS.MASTER)
  ) {
    ws.send(
      JSON.stringify({
        type: "auth_success",
        message: "Acesso autorizado",
      }),
    )

    console.log(`✅ Acesso autorizado para IP: ${clientIP}`)
  } else {
    // Registrar tentativa de login falhada
    const attempts = secureStore.loginAttempts.get(key) || 0
    secureStore.loginAttempts.set(key, attempts + 1)

    if (attempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      secureStore.bannedIPs.add(clientIP)
      console.log(`🚫 IP banido por tentativas excessivas: ${clientIP}`)
    }

    ws.send(
      JSON.stringify({
        type: "auth_error",
        message: "Senha de acesso inválida",
      }),
    )
  }
}

async function handleSecureAdminAuth(ws, message, clientIP) {
  if (!checkRateLimit(clientIP, "admin_auth")) {
    ws.send(
      JSON.stringify({
        type: "adminAuthError",
        message: "Muitas tentativas. Tente novamente em 1 minuto.",
      }),
    )
    return
  }

  if (!message.password || message.password.length > SECURITY_CONFIG.MAX_PASSWORD_LENGTH) {
    ws.send(
      JSON.stringify({
        type: "adminAuthError",
        message: "Senha inválida",
      }),
    )
    return
  }

  if (
    validatePassword(message.password, ENCRYPTED_PASSWORDS.ADMIN) ||
    validatePassword(message.password, ENCRYPTED_PASSWORDS.MASTER)
  ) {
    const sessionToken = uuidv4()
    secureStore.adminSessions.set(sessionToken, {
      ws: ws,
      createdAt: new Date(),
      ip: clientIP,
    })

    ws.send(
      JSON.stringify({
        type: "adminAuthSuccess",
        sessionToken: sessionToken,
      }),
    )

    console.log(`👑 Admin autenticado: ${clientIP}`)
  } else {
    ws.send(
      JSON.stringify({
        type: "adminAuthError",
        message: "Senha de administrador inválida",
      }),
    )
  }
}

async function handleSecureLogin(ws, message, clientIP) {
  if (!checkRateLimit(clientIP, "login")) {
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "Muitas tentativas de login. Aguarde 1 minuto.",
      }),
    )
    return
  }

  try {
    // Validar dados de entrada
    if (!message.name || !message.email || !message.password) {
      ws.send(
        JSON.stringify({
          type: "loginError",
          message: "Todos os campos são obrigatórios",
        }),
      )
      return
    }

    if (message.password.length > SECURITY_CONFIG.MAX_PASSWORD_LENGTH) {
      ws.send(
        JSON.stringify({
          type: "loginError",
          message: "Senha excede o limite permitido",
        }),
      )
      return
    }

    // Buscar usuário
    let userData = null
    for (const [userId, user] of secureStore.users.entries()) {
      if (user.email === message.email) {
        userData = { ...user, userId }
        break
      }
    }

    if (!userData) {
      ws.send(
        JSON.stringify({
          type: "loginError",
          message: "Usuário não encontrado",
        }),
      )
      return
    }

    // Verificar se está banido
    if (userData.banned) {
      ws.send(
        JSON.stringify({
          type: "loginError",
          message: "Sua conta foi banida",
        }),
      )
      return
    }

    // Verificar senha (criptografada)
    const isValidPassword = await bcrypt.compare(message.password, userData.passwordHash)
    if (!isValidPassword) {
      ws.send(
        JSON.stringify({
          type: "loginError",
          message: "Senha incorreta",
        }),
      )
      return
    }

    // Atualizar status online
    userData.isOnline = true
    userData.lastSeen = new Date().toISOString()
    userData.ip = clientIP
    secureStore.users.set(userData.userId, userData)

    // Criar sessão segura
    const sessionToken = uuidv4()
    secureStore.sessions.set(sessionToken, {
      userId: userData.userId,
      email: userData.email,
      ws: ws,
      ip: clientIP,
      createdAt: new Date(),
    })

    activeConnections.set(userData.userId, { ...userData, ws: ws })

    // Resposta segura (sem dados sensíveis)
    ws.send(
      JSON.stringify({
        type: "loginSuccess",
        sessionToken: sessionToken,
        user: {
          userId: userData.userId,
          name: userData.name,
          email: userData.email,
          avatar: userData.avatar,
          color: userData.color,
          profileImage: userData.profileImage,
          userNumber: userData.userNumber,
          settings: userData.settings || {},
          createdAt: userData.createdAt,
        },
      }),
    )

    // Notificar outros usuários
    await broadcastUserStatus(userData.userId, true)

    console.log(`👤 Login seguro: ${userData.name} (${clientIP})`)
  } catch (error) {
    console.error("❌ Erro no login:", error)
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "Erro interno do servidor",
      }),
    )
  }
}

async function handleSecureRegister(ws, message, clientIP) {
  if (!secureStore.settings.registrationEnabled) {
    ws.send(
      JSON.stringify({
        type: "registerError",
        message: "Registro de novos usuários está desabilitado",
      }),
    )
    return
  }

  if (!checkRateLimit(clientIP, "register")) {
    ws.send(
      JSON.stringify({
        type: "registerError",
        message: "Muitas tentativas de registro. Aguarde 1 minuto.",
      }),
    )
    return
  }

  try {
    // Validar dados de entrada
    if (!message.name || !message.email || !message.password) {
      ws.send(
        JSON.stringify({
          type: "registerError",
          message: "Todos os campos são obrigatórios",
        }),
      )
      return
    }

    if (message.password.length > SECURITY_CONFIG.MAX_PASSWORD_LENGTH) {
      ws.send(
        JSON.stringify({
          type: "registerError",
          message: "Senha excede o limite permitido",
        }),
      )
      return
    }

    // Verificar se email já existe
    let emailExists = false
    for (const user of secureStore.users.values()) {
      if (user.email === message.email) {
        emailExists = true
        break
      }
    }

    if (emailExists) {
      ws.send(
        JSON.stringify({
          type: "registerError",
          message: "Este email já está em uso",
        }),
      )
      return
    }

    // Gerar número único
    const userNumber = await generateUniqueNumber()

    // Criptografar senha
    const passwordHash = await bcrypt.hash(message.password, SECURITY_CONFIG.SALT_ROUNDS)

    // Criar usuário
    const userId = uuidv4()
    const userData = {
      userId: userId,
      name: message.name,
      email: message.email,
      passwordHash: passwordHash, // Senha criptografada
      avatar: message.avatar || "👤",
      color: message.color || "#9ACD32",
      profileImage: message.profileImage || null,
      userNumber: userNumber,
      createdAt: new Date().toISOString(),
      isOnline: true,
      lastSeen: new Date().toISOString(),
      ip: clientIP,
      contacts: [],
      blocked: [],
      settings: {
        hideLastSeen: false,
        hideOnlineStatus: false,
        chatBackground: null,
        requireContactApproval: false,
      },
      banned: false,
    }

    secureStore.users.set(userId, userData)

    // Adicionar ao grupo padrão
    const generalGroup = secureStore.groups.get("general")
    if (generalGroup) {
      generalGroup.members.push(userId)
      secureStore.groups.set("general", generalGroup)
    }

    // Criar sessão
    const sessionToken = uuidv4()
    secureStore.sessions.set(sessionToken, {
      userId: userId,
      email: message.email,
      ws: ws,
      ip: clientIP,
      createdAt: new Date(),
    })

    activeConnections.set(userId, { ...userData, ws: ws })

    // Resposta segura
    ws.send(
      JSON.stringify({
        type: "registerSuccess",
        sessionToken: sessionToken,
        user: {
          userId: userId,
          name: userData.name,
          email: userData.email,
          avatar: userData.avatar,
          color: userData.color,
          profileImage: userData.profileImage,
          userNumber: userNumber,
          settings: userData.settings,
          createdAt: userData.createdAt,
        },
      }),
    )

    // Notificar outros usuários
    await broadcastUserStatus(userId, true)

    console.log(`✨ Registro seguro: ${userData.name} (${clientIP})`)
  } catch (error) {
    console.error("❌ Erro no registro:", error)
    ws.send(
      JSON.stringify({
        type: "registerError",
        message: "Erro interno do servidor",
      }),
    )
  }
}

// Message handlers seguros
async function handleSecureChatMessage(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const userData = activeConnections.get(userId)
    if (!userData) return

    // Rate limiting
    if (!checkRateLimit(userId, "message")) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Você está enviando mensagens muito rapidamente. Aguarde um momento.",
        }),
      )
      return
    }

    // Validar conteúdo
    if (!message.content || message.content.trim().length === 0) {
      return
    }

    // Verificar limite de caracteres (configurável pelo admin)
    const maxLength = secureStore.settings.maxMessageLength
    if (message.content.length > maxLength) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Mensagem muito longa. Máximo ${maxLength} caracteres.`,
        }),
      )
      return
    }

    // Auto-moderação (se habilitada)
    if (secureStore.settings.autoModeration) {
      const bannedWords = secureStore.settings.bannedWords
      const containsBannedWord = bannedWords.some((word) => message.content.toLowerCase().includes(word.toLowerCase()))

      if (containsBannedWord) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Mensagem contém conteúdo não permitido.",
          }),
        )
        return
      }
    }

    // Verificar configurações do grupo
    const chatId = message.chatId || "general"
    const group = secureStore.groups.get(chatId)

    if (group && group.settings.onlyAdminsCanMessage && !group.admins.includes(userId)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Apenas administradores podem enviar mensagens neste grupo.",
        }),
      )
      return
    }

    // Criar mensagem
    const messageId = uuidv4()
    const messageData = {
      id: messageId,
      userId: userId,
      userName: userData.name,
      userAvatar: userData.avatar,
      userColor: userData.color,
      userProfileImage: userData.profileImage,
      content: message.content,
      type: message.messageType || "text",
      chatId: chatId,
      chatType: message.chatType || "group",
      timestamp: new Date().toISOString(),
      replyTo: message.replyTo || null,
      reactions: {},
      readBy: [userId],
      editedAt: null,
      deleted: false,
    }

    // Salvar mensagem
    secureStore.messages.push(messageData)

    // Broadcast para usuários relevantes
    if (message.chatType === "group") {
      await broadcastToGroup(chatId, {
        type: "newMessage",
        message: messageData,
      })
    } else {
      await broadcastToUser(message.recipientId, {
        type: "newMessage",
        message: messageData,
      })

      // Enviar de volta para o remetente
      ws.send(
        JSON.stringify({
          type: "newMessage",
          message: messageData,
        }),
      )
    }

    console.log(`💬 Mensagem segura: ${userData.name} -> ${chatId}`)
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem:", error)
  }
}

async function handleSecurePrivateMessage(ws, message) {
  try {
    const senderId = getUserIdFromWebSocket(ws)
    if (!senderId) return

    const senderData = activeConnections.get(senderId)
    if (!senderData) return

    // Rate limiting
    if (!checkRateLimit(senderId, "private_message")) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Você está enviando mensagens muito rapidamente.",
        }),
      )
      return
    }

    // Verificar se o destinatário existe
    const recipientData = activeConnections.get(message.recipientId)
    if (!recipientData) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Destinatário não encontrado",
        }),
      )
      return
    }

    // Verificar bloqueios
    if (await isUserBlocked(message.recipientId, senderId)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Você não pode enviar mensagens para este usuário",
        }),
      )
      return
    }

    // Criar chat privado
    const chatId = [senderId, message.recipientId].sort().join("_")

    const messageId = uuidv4()
    const messageData = {
      id: messageId,
      userId: senderId,
      userName: senderData.name,
      userAvatar: senderData.avatar,
      userColor: senderData.color,
      userProfileImage: senderData.profileImage,
      content: message.content,
      type: message.messageType || "text",
      chatId: chatId,
      chatType: "private",
      participants: [senderId, message.recipientId],
      timestamp: new Date().toISOString(),
      replyTo: message.replyTo || null,
      reactions: {},
      readBy: [senderId],
      editedAt: null,
      deleted: false,
    }

    // Salvar mensagem
    secureStore.messages.push(messageData)

    // Enviar para ambos os usuários
    ws.send(
      JSON.stringify({
        type: "newPrivateMessage",
        message: messageData,
      }),
    )

    if (recipientData.ws) {
      recipientData.ws.send(
        JSON.stringify({
          type: "newPrivateMessage",
          message: messageData,
        }),
      )
    }
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem privada:", error)
  }
}

// Handlers de dados
async function handleGetUsers(ws) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const users = Array.from(secureStore.users.entries()).map(([id, user]) => ({
    userId: id,
    name: user.name,
    avatar: user.avatar,
    color: user.color,
    profileImage: user.profileImage,
    userNumber: user.userNumber,
    isOnline: user.isOnline || false,
  }))

  // Filtrar usuários bloqueados
  const filteredUsers = users.filter((user) => {
    return !isUserBlockedSync(user.userId, userId) && !isUserBlockedSync(userId, user.userId)
  })

  ws.send(
    JSON.stringify({
      type: "usersList",
      users: filteredUsers,
    }),
  )
}

async function handleGetMessages(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const chatId = message.chatId || "general"
  const limit = message.limit || 50

  const messages = secureStore.messages
    .filter((m) => m.chatId === chatId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
    .reverse()

  ws.send(
    JSON.stringify({
      type: "messagesList",
      messages: messages,
      chatId: chatId,
    }),
  )
}

async function handleUpdateProfile(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const userData = secureStore.users.get(userId)
  if (!userData) return

  const updates = {}
  if (message.user.name) updates.name = message.user.name
  if (message.user.avatar) updates.avatar = message.user.avatar
  if (message.user.color) updates.color = message.user.color
  if (message.user.profileImage !== undefined) updates.profileImage = message.user.profileImage

  Object.assign(userData, updates)
  secureStore.users.set(userId, userData)

  // Atualizar dados em memória
  const activeUser = activeConnections.get(userId)
  if (activeUser) {
    Object.assign(activeUser, updates)
    activeConnections.set(userId, activeUser)
  }

  ws.send(
    JSON.stringify({
      type: "profileUpdated",
      user: {
        userId: userId,
        ...updates,
      },
    }),
  )

  // Notificar outros usuários
  await broadcastUserUpdate(userId)
}

async function handleReaction(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const messageData = secureStore.messages.find((m) => m.id === message.messageId)
  if (!messageData) return

  const reactions = messageData.reactions || {}

  // Atualizar reação
  if (!reactions[message.emoji]) {
    reactions[message.emoji] = []
  }

  const userIndex = reactions[message.emoji].indexOf(userId)
  if (userIndex > -1) {
    // Remover reação
    reactions[message.emoji].splice(userIndex, 1)
    if (reactions[message.emoji].length === 0) {
      delete reactions[message.emoji]
    }
  } else {
    // Adicionar reação
    reactions[message.emoji].push(userId)
  }

  messageData.reactions = reactions

  // Broadcast para usuários relevantes
  const broadcastData = {
    type: "messageReaction",
    messageId: message.messageId,
    reactions: reactions,
  }

  if (messageData.chatType === "group") {
    await broadcastToGroup(messageData.chatId, broadcastData)
  } else {
    for (const participantId of messageData.participants) {
      await broadcastToUser(participantId, broadcastData)
    }
  }
}

async function handleDeleteMessage(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const messageData = secureStore.messages.find((m) => m.id === message.messageId)
  if (!messageData) return

  // Verificar se o usuário pode deletar a mensagem
  if (messageData.userId !== userId) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Você não pode deletar esta mensagem",
      }),
    )
    return
  }

  if (message.deleteType === "forEveryone") {
    // Marcar como deletada para todos
    const index = secureStore.messages.findIndex((m) => m.id === message.messageId)
    if (index !== -1) {
      secureStore.messages[index].deleted = true
      secureStore.messages[index].deletedAt = new Date().toISOString()
      secureStore.messages[index].content = "Esta mensagem foi apagada"
    }

    // Broadcast para todos
    const broadcastData = {
      type: "messageDeleted",
      messageId: message.messageId,
      deleteType: "forEveryone",
    }

    if (messageData.chatType === "group") {
      await broadcastToGroup(messageData.chatId, broadcastData)
    } else {
      for (const participantId of messageData.participants) {
        await broadcastToUser(participantId, broadcastData)
      }
    }
  } else {
    // Deletar apenas para o usuário atual
    ws.send(
      JSON.stringify({
        type: "messageDeleted",
        messageId: message.messageId,
        deleteType: "forMe",
      }),
    )
  }
}

// Admin handlers
async function handleAdminGetUsers(ws) {
  if (!isAdminWebSocket(ws)) return

  const users = Array.from(secureStore.users.entries()).map(([id, user]) => ({
    userId: id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    color: user.color,
    profileImage: user.profileImage,
    userNumber: user.userNumber,
    isOnline: user.isOnline || false,
    createdAt: user.createdAt,
    banned: user.banned || false,
    ip: user.ip || "N/A",
  }))

  ws.send(
    JSON.stringify({
      type: "adminUsersList",
      users: users,
    }),
  )
}

async function handleAdminGetMessages(ws) {
  if (!isAdminWebSocket(ws)) return

  ws.send(
    JSON.stringify({
      type: "adminMessagesList",
      messages: secureStore.messages,
    }),
  )
}

async function handleAdminBanUser(ws, message) {
  if (!isAdminWebSocket(ws)) return

  const userData = secureStore.users.get(message.userId)
  if (userData) {
    userData.banned = true
    secureStore.users.set(message.userId, userData)

    // Desconectar usuário se estiver online
    const activeUser = activeConnections.get(message.userId)
    if (activeUser && activeUser.ws) {
      activeUser.ws.send(
        JSON.stringify({
          type: "banned",
          message: "Sua conta foi banida por violar os termos de uso",
        }),
      )
      activeUser.ws.close()
    }

    ws.send(
      JSON.stringify({
        type: "adminActionSuccess",
        message: "Usuário banido com sucesso",
        action: "ban",
        userId: message.userId,
      }),
    )

    console.log(`🚫 Usuário banido: ${userData.name}`)
  }
}

async function handleAdminDeleteUser(ws, message) {
  if (!isAdminWebSocket(ws)) return

  // Desconectar usuário se estiver online
  const activeUser = activeConnections.get(message.userId)
  if (activeUser && activeUser.ws) {
    activeUser.ws.send(
      JSON.stringify({
        type: "accountDeleted",
        message: "Sua conta foi excluída por um administrador",
      }),
    )
    activeUser.ws.close()
  }

  // Deletar do armazenamento
  const userData = secureStore.users.get(message.userId)
  secureStore.users.delete(message.userId)

  // Remover das conexões
  activeConnections.delete(message.userId)

  // Remover mensagens do usuário
  secureStore.messages = secureStore.messages.filter((m) => m.userId !== message.userId)

  ws.send(
    JSON.stringify({
      type: "adminActionSuccess",
      message: "Usuário excluído com sucesso",
      action: "delete",
      userId: message.userId,
    }),
  )

  console.log(`🗑️ Usuário deletado: ${userData?.name || message.userId}`)
}

async function handleAdminUpdateSettings(ws, message) {
  if (!isAdminWebSocket(ws)) return

  // Atualizar configurações
  secureStore.settings = { ...secureStore.settings, ...message.settings }

  // Aplicar configurações imediatamente
  if (message.settings.maintenanceMode !== undefined) {
    console.log(`🔧 Modo manutenção: ${message.settings.maintenanceMode ? "ATIVADO" : "DESATIVADO"}`)
  }

  ws.send(
    JSON.stringify({
      type: "adminActionSuccess",
      message: "Configurações atualizadas com sucesso",
      action: "updateSettings",
      settings: secureStore.settings,
    }),
  )

  // Notificar outros admins
  await notifyAdmins(
    {
      type: "settingsUpdated",
      settings: secureStore.settings,
    },
    ws,
  )

  console.log(`⚙️ Configurações atualizadas pelo admin`)
}

async function handleAdminClearMessages(ws) {
  if (!isAdminWebSocket(ws)) return

  secureStore.messages = []

  ws.send(
    JSON.stringify({
      type: "adminActionSuccess",
      message: "Todas as mensagens foram deletadas",
      action: "clearMessages",
    }),
  )

  // Notificar todos os usuários
  await broadcastToAll({
    type: "allMessagesCleared",
    message: "Todas as mensagens foram removidas por um administrador",
  })

  console.log(`🧹 Todas as mensagens foram deletadas pelo admin`)
}

// Utility functions
async function handleSecureDisconnection(ws) {
  // Remover usuário das conexões ativas
  for (const [userId, userData] of activeConnections.entries()) {
    if (userData.ws === ws) {
      try {
        // Atualizar status no armazenamento
        const user = secureStore.users.get(userId)
        if (user) {
          user.isOnline = false
          user.lastSeen = new Date().toISOString()
          secureStore.users.set(userId, user)
        }

        // Remover da memória
        activeConnections.delete(userId)

        // Notificar outros usuários
        await broadcastUserStatus(userId, false)

        console.log(`👋 Desconexão segura: ${userData.name}`)
      } catch (error) {
        console.error("❌ Erro ao processar desconexão:", error)
      }
      break
    }
  }

  // Remover sessão de admin
  for (const [sessionId, sessionData] of secureStore.adminSessions.entries()) {
    if (sessionData.ws === ws) {
      secureStore.adminSessions.delete(sessionId)
      console.log(`👑 Admin desconectado`)
      break
    }
  }
}

async function broadcastUserStatus(userId, isOnline) {
  const userData = activeConnections.get(userId) || secureStore.users.get(userId)
  if (!userData) return

  const statusData = {
    type: "userStatusUpdate",
    userId: userId,
    userName: userData.name,
    isOnline: isOnline,
    lastSeen: new Date().toISOString(),
  }

  for (const [otherUserId, otherUserData] of activeConnections.entries()) {
    if (otherUserId !== userId && otherUserData.ws && !(await isUserBlocked(otherUserId, userId))) {
      otherUserData.ws.send(JSON.stringify(statusData))
    }
  }
}

async function broadcastUserUpdate(userId) {
  const userData = activeConnections.get(userId)
  if (!userData) return

  const updateData = {
    type: "userUpdated",
    user: {
      userId: userId,
      name: userData.name,
      avatar: userData.avatar,
      color: userData.color,
      profileImage: userData.profileImage,
      isOnline: userData.isOnline,
    },
  }

  for (const [otherUserId, otherUserData] of activeConnections.entries()) {
    if (otherUserId !== userId && otherUserData.ws && !(await isUserBlocked(otherUserId, userId))) {
      otherUserData.ws.send(JSON.stringify(updateData))
    }
  }
}

async function broadcastToGroup(groupId, message) {
  try {
    const groupData = secureStore.groups.get(groupId)
    if (!groupData) return

    for (const memberId of groupData.members) {
      await broadcastToUser(memberId, message)
    }
  } catch (error) {
    console.error("❌ Erro ao broadcast para grupo:", error)
  }
}

async function broadcastToUser(userId, message) {
  const userData = activeConnections.get(userId)
  if (userData && userData.ws) {
    userData.ws.send(JSON.stringify(message))
  }
}

async function broadcastToAll(message) {
  for (const [userId, userData] of activeConnections.entries()) {
    if (userData.ws) {
      userData.ws.send(JSON.stringify(message))
    }
  }
}

async function notifyAdmins(message, excludeWs = null) {
  for (const sessionData of secureStore.adminSessions.values()) {
    if (sessionData.ws && sessionData.ws !== excludeWs) {
      sessionData.ws.send(JSON.stringify(message))
    }
  }
}

function getUserIdFromWebSocket(ws) {
  for (const [userId, userData] of activeConnections.entries()) {
    if (userData.ws === ws) {
      return userId
    }
  }
  return null
}

function isAdminWebSocket(ws) {
  for (const sessionData of secureStore.adminSessions.values()) {
    if (sessionData.ws === ws) {
      return true
    }
  }
  return false
}

async function isUserBlocked(userId, blockedUserId) {
  try {
    const userData = secureStore.users.get(userId)
    return userData && userData.blocked && userData.blocked.includes(blockedUserId)
  } catch (error) {
    return false
  }
}

function isUserBlockedSync(userId, blockedUserId) {
  const userData = activeConnections.get(userId)
  return userData && userData.blocked && userData.blocked.includes(blockedUserId)
}

async function generateUniqueNumber() {
  let number
  let isUnique = false

  while (!isUnique) {
    number = Math.floor(10000000 + Math.random() * 90000000).toString()

    isUnique = true
    for (const user of secureStore.users.values()) {
      if (user.userNumber === number) {
        isUnique = false
        break
      }
    }
  }

  return number
}

// Limpeza periódica de sessões expiradas
setInterval(() => {
  const now = Date.now()
  const sessionTimeout = 24 * 60 * 60 * 1000 // 24 horas

  // Limpar sessões de usuário expiradas
  for (const [sessionId, session] of secureStore.sessions.entries()) {
    if (now - session.createdAt.getTime() > sessionTimeout) {
      secureStore.sessions.delete(sessionId)
    }
  }

  // Limpar sessões de admin expiradas
  for (const [sessionId, session] of secureStore.adminSessions.entries()) {
    if (now - session.createdAt.getTime() > sessionTimeout) {
      secureStore.adminSessions.delete(sessionId)
    }
  }

  // Limpar tentativas de login antigas
  for (const [key, attempts] of secureStore.loginAttempts.entries()) {
    if (now - attempts.lastAttempt > SECURITY_CONFIG.LOCKOUT_TIME) {
      secureStore.loginAttempts.delete(key)
    }
  }

  // Limpar rate limiter
  for (const [key, attempts] of rateLimiter.entries()) {
    const recentAttempts = attempts.filter((time) => now - time < 60000)
    if (recentAttempts.length === 0) {
      rateLimiter.delete(key)
    } else {
      rateLimiter.set(key, recentAttempts)
    }
  }
}, 60000) // A cada minuto

console.log(`🔒 Servidor WebSocket Seguro rodando na porta ${process.env.WS_PORT || 8080}`)
console.log(`🛡️ Sistema de segurança máxima ativado`)
console.log(`🔐 Criptografia AES-256 habilitada`)
console.log(`⚡ Rate limiting configurado`)
console.log(`🚫 Sistema anti-spam ativo`)
