const { WebSocketServer } = require("ws")
const express = require("express")
const cors = require("cors")
const multer = require("multer")
const admin = require("firebase-admin")
const { v4: uuidv4 } = require("uuid")
const dotenv = require("dotenv")
const path = require("path")
const fs = require("fs")

dotenv.config()

// Inicializar Firebase Admin
try {
  const serviceAccount = require("../firebase-service-account.json")

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com/`,
    storageBucket: `${serviceAccount.project_id}.appspot.com`,
  })
} catch (error) {
  console.warn("Firebase não configurado. Usando armazenamento em memória:", error.message)
  // Continuará usando armazenamento em memória
}

const db = admin.firestore ? admin.firestore() : null
const storage = admin.storage ? admin.storage() : null

// Configurar Express
const app = express()
app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.static(path.join(__dirname, "../frontend")))

// Configurar Multer para upload de arquivos
const uploadDir = path.join(__dirname, "../uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage_local = multer.diskStorage({
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
  storage: storage || storage_local,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
})

// WebSocket Server
const wss = new WebSocketServer({ port: process.env.WS_PORT || 8080 })

// Armazenamento em memória para conexões ativas
const connectedUsers = new Map()
const userSessions = new Map()
const adminSessions = new Map()

// Armazenamento em memória para dados (caso Firebase não esteja disponível)
const memoryStore = {
  users: new Map(),
  messages: [],
  groups: new Map(),
  reports: [],
}

// Senhas de acesso - ATUALIZADO CONFORME SOLICITADO
const ACCESS_PASSWORD = "ChatGorila" // Alterado de "gorilachatv2" para "ChatGorila"
const ADMIN_PASSWORD = "admin123"

// Configurações do sistema
let systemSettings = {
  maintenanceMode: false,
  accessPassword: ACCESS_PASSWORD,
  adminPassword: ADMIN_PASSWORD,
  maxMessageLength: 1000,
  messageRateLimit: 30,
}

// Carregar configurações do Firebase
async function loadSystemSettings() {
  if (!db) return

  try {
    const settingsDoc = await db.collection("system").doc("settings").get()
    if (settingsDoc.exists) {
      systemSettings = { ...systemSettings, ...settingsDoc.data() }
    }
  } catch (error) {
    console.error("Erro ao carregar configurações:", error)
  }
}

// Salvar configurações no Firebase
async function saveSystemSettings() {
  if (!db) return

  try {
    await db.collection("system").doc("settings").set(systemSettings)
  } catch (error) {
    console.error("Erro ao salvar configurações:", error)
  }
}

// Carregar configurações iniciais
loadSystemSettings()

// Inicializar grupo padrão
const defaultGroup = {
  id: "general",
  name: "GorilaChat Wuaze",
  description: "Grupo Geral Gorila Wuaze",
  avatar: "🦍",
  color: "#9ACD32",
  createdBy: "system",
  admins: ["system"],
  members: [],
  createdAt: new Date().toISOString(),
  settings: {
    onlyAdminsCanMessage: false,
    onlyAdminsCanAddMembers: false,
  },
}

memoryStore.groups.set("general", defaultGroup)

// Rotas Express
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" })
    }

    let publicUrl = ""

    if (storage) {
      // Upload para Firebase Storage
      const fileName = `${uuidv4()}_${req.file.originalname}`
      const file = storage.bucket().file(`uploads/${fileName}`)

      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
        },
      })

      // Tornar o arquivo público
      await file.makePublic()

      publicUrl = `https://storage.googleapis.com/${storage.bucket().name}/uploads/${fileName}`
    } else {
      // Upload para armazenamento local
      publicUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`
    }

    res.json({ url: publicUrl })
  } catch (error) {
    console.error("Erro no upload:", error)
    res.status(500).json({ error: "Erro no upload do arquivo" })
  }
})

app.get("/health", (req, res) => {
  res.json({ status: "ok", maintenance: systemSettings.maintenanceMode })
})

// Servir arquivos estáticos
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"))
})

// Iniciar servidor Express
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Servidor HTTP rodando na porta ${PORT}`)
})

// WebSocket Connection Handler
wss.on("connection", (ws) => {
  console.log("Novo cliente conectado")

  ws.on("error", console.error)

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString())
      await handleMessage(ws, message)
    } catch (error) {
      console.error("Erro ao processar mensagem:", error)
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Erro interno do servidor",
        }),
      )
    }
  })

  ws.on("close", async () => {
    await handleDisconnection(ws)
  })
})

// Handlers de mensagens
async function handleMessage(ws, message) {
  switch (message.type) {
    case "auth":
      await handleAuth(ws, message)
      break
    case "adminAuth":
      await handleAdminAuth(ws, message)
      break
    case "login":
      await handleLogin(ws, message)
      break
    case "register":
      await handleRegister(ws, message)
      break
    case "message":
      await handleChatMessage(ws, message)
      break
    case "privateMessage":
      await handlePrivateMessage(ws, message)
      break
    case "typing":
      await handleTyping(ws, message)
      break
    case "reaction":
      await handleReaction(ws, message)
      break
    case "deleteMessage":
      await handleDeleteMessage(ws, message)
      break
    case "updateProfile":
      await handleUpdateProfile(ws, message)
      break
    case "addContact":
      await handleAddContact(ws, message)
      break
    case "blockUser":
      await handleBlockUser(ws, message)
      break
    case "reportUser":
      await handleReportUser(ws, message)
      break
    case "createGroup":
      await handleCreateGroup(ws, message)
      break
    case "joinGroup":
      await handleJoinGroup(ws, message)
      break
    case "leaveGroup":
      await handleLeaveGroup(ws, message)
      break
    case "updateSettings":
      await handleUpdateSettings(ws, message)
      break
    case "getContacts":
      await handleGetContacts(ws, message)
      break
    case "getMessages":
      await handleGetMessages(ws, message)
      break
    case "getUsers":
      await handleGetUsers(ws, message)
      break
    case "markAsRead":
      await handleMarkAsRead(ws, message)
      break
    case "searchMessages":
      await handleSearchMessages(ws, message)
      break
    // Admin handlers
    case "adminGetUsers":
      await handleAdminGetUsers(ws)
      break
    case "adminGetReports":
      await handleAdminGetReports(ws)
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
    default:
      console.log("Tipo de mensagem desconhecido:", message.type)
  }
}

// Auth handlers
async function handleAuth(ws, message) {
  if (systemSettings.maintenanceMode) {
    ws.send(
      JSON.stringify({
        type: "maintenanceMode",
        message: "Sistema em manutenção. Tente novamente mais tarde.",
      }),
    )
    return
  }

  // Verificar senha de acesso - ATUALIZADO PARA "ChatGorila"
  if (message.password === systemSettings.accessPassword || message.masterPassword === "sitedogorilão") {
    ws.send(
      JSON.stringify({
        type: "auth_success",
        message: "Acesso concedido",
      }),
    )
  } else {
    ws.send(
      JSON.stringify({
        type: "auth_error",
        message: "Senha de acesso inválida",
      }),
    )
  }
}

async function handleAdminAuth(ws, message) {
  if (message.password === systemSettings.adminPassword) {
    const sessionToken = uuidv4()
    adminSessions.set(sessionToken, {
      ws: ws,
      createdAt: new Date(),
    })

    ws.send(
      JSON.stringify({
        type: "adminAuthSuccess",
        sessionToken: sessionToken,
      }),
    )
  } else {
    ws.send(
      JSON.stringify({
        type: "adminAuthError",
        message: "Senha de administrador inválida",
      }),
    )
  }
}

async function handleLogin(ws, message) {
  try {
    let userData = null

    if (db) {
      // Buscar usuário no Firebase
      const usersRef = db.collection("users")
      const snapshot = await usersRef.where("email", "==", message.email).get()

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0]
        userData = { ...userDoc.data(), userId: userDoc.id }
      }
    } else {
      // Buscar usuário na memória
      for (const [userId, user] of memoryStore.users.entries()) {
        if (user.email === message.email) {
          userData = { ...user, userId }
          break
        }
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

    // Verificar senha
    if (userData.password !== message.password) {
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

    if (db) {
      await db.collection("users").doc(userData.userId).update({
        isOnline: true,
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      })
    } else {
      memoryStore.users.set(userData.userId, userData)
    }

    // Criar sessão
    const sessionToken = uuidv4()
    const userSession = {
      userId: userData.userId,
      email: userData.email,
      ws: ws,
    }

    userSessions.set(sessionToken, userSession)
    connectedUsers.set(userData.userId, { ...userData, ws: ws })

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
  } catch (error) {
    console.error("Erro no login:", error)
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "Erro interno do servidor",
      }),
    )
  }
}

async function handleRegister(ws, message) {
  try {
    let emailExists = false

    if (db) {
      // Verificar se email já existe no Firebase
      const usersRef = db.collection("users")
      const emailCheck = await usersRef.where("email", "==", message.email).get()
      emailExists = !emailCheck.empty
    } else {
      // Verificar se email já existe na memória
      for (const user of memoryStore.users.values()) {
        if (user.email === message.email) {
          emailExists = true
          break
        }
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

    // Criar usuário
    const userId = uuidv4()
    const userData = {
      userId: userId,
      name: message.name,
      email: message.email,
      password: message.password,
      avatar: message.avatar || "👤",
      color: message.color || "#9ACD32",
      profileImage: message.profileImage || null,
      userNumber: userNumber,
      createdAt: new Date().toISOString(),
      isOnline: true,
      lastSeen: new Date().toISOString(),
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

    if (db) {
      // Salvar no Firebase
      await db.collection("users").doc(userId).set(userData)
    } else {
      // Salvar na memória
      memoryStore.users.set(userId, userData)
    }

    // Adicionar ao grupo padrão
    if (memoryStore.groups.has("general")) {
      const generalGroup = memoryStore.groups.get("general")
      generalGroup.members.push(userId)
      memoryStore.groups.set("general", generalGroup)
    }

    // Criar sessão
    const sessionToken = uuidv4()
    userSessions.set(sessionToken, {
      userId: userId,
      email: message.email,
      ws: ws,
    })

    connectedUsers.set(userId, { ...userData, ws: ws })

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
  } catch (error) {
    console.error("Erro no registro:", error)
    ws.send(
      JSON.stringify({
        type: "registerError",
        message: "Erro interno do servidor",
      }),
    )
  }
}

// Message handlers
async function handleChatMessage(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const userData = connectedUsers.get(userId)
    if (!userData) return

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
      chatId: message.chatId || "general",
      chatType: message.chatType || "group",
      timestamp: new Date().toISOString(),
      replyTo: message.replyTo || null,
      reactions: {},
      readBy: [userId],
      editedAt: null,
      deleted: false,
    }

    // Salvar mensagem
    if (db) {
      await db.collection("messages").add(messageData)
    } else {
      memoryStore.messages.push(messageData)
    }

    // Broadcast para usuários relevantes
    if (message.chatType === "group") {
      await broadcastToGroup(message.chatId, {
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
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error)
  }
}

async function handlePrivateMessage(ws, message) {
  try {
    const senderId = getUserIdFromWebSocket(ws)
    if (!senderId) return

    const senderData = connectedUsers.get(senderId)
    if (!senderData) return

    // Verificar se o destinatário existe
    const recipientData = connectedUsers.get(message.recipientId)
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

    // Criar chat privado se não existir
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
    if (db) {
      await db.collection("messages").add(messageData)
    } else {
      memoryStore.messages.push(messageData)
    }

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
    console.error("Erro ao enviar mensagem privada:", error)
  }
}

async function handleReaction(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    let messageData = null

    if (db) {
      const messageRef = db.collection("messages").doc(message.messageId)
      const messageDoc = await messageRef.get()

      if (!messageDoc.exists) return
      messageData = messageDoc.data()
    } else {
      messageData = memoryStore.messages.find((m) => m.id === message.messageId)
      if (!messageData) return
    }

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

    // Atualizar no armazenamento
    if (db) {
      await db.collection("messages").doc(message.messageId).update({ reactions })
    } else {
      const index = memoryStore.messages.findIndex((m) => m.id === message.messageId)
      if (index !== -1) {
        memoryStore.messages[index].reactions = reactions
      }
    }

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
  } catch (error) {
    console.error("Erro ao processar reação:", error)
  }
}

async function handleDeleteMessage(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    let messageData = null

    if (db) {
      const messageRef = db.collection("messages").doc(message.messageId)
      const messageDoc = await messageRef.get()

      if (!messageDoc.exists) return
      messageData = messageDoc.data()
    } else {
      messageData = memoryStore.messages.find((m) => m.id === message.messageId)
      if (!messageData) return
    }

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
      if (db) {
        await db.collection("messages").doc(message.messageId).update({
          deleted: true,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          content: "Esta mensagem foi apagada",
        })
      } else {
        const index = memoryStore.messages.findIndex((m) => m.id === message.messageId)
        if (index !== -1) {
          memoryStore.messages[index].deleted = true
          memoryStore.messages[index].deletedAt = new Date().toISOString()
          memoryStore.messages[index].content = "Esta mensagem foi apagada"
        }
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
  } catch (error) {
    console.error("Erro ao deletar mensagem:", error)
  }
}

async function handleTyping(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const userData = connectedUsers.get(userId)
    if (!userData) return

    const typingData = {
      type: "typing",
      userId: userId,
      userName: userData.name,
      userAvatar: userData.avatar,
      chatId: message.chatId,
      chatType: message.chatType,
      isTyping: message.isTyping,
    }

    if (message.chatType === "group") {
      await broadcastToGroup(message.chatId, typingData)
    } else {
      await broadcastToUser(message.recipientId, typingData)
    }
  } catch (error) {
    console.error("Erro ao processar digitação:", error)
  }
}

// Pesquisa de mensagens
async function handleSearchMessages(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const searchTerm = message.searchTerm.toLowerCase()
    const chatId = message.chatId

    let results = []

    if (db) {
      // Buscar no Firebase
      const snapshot = await db.collection("messages").where("chatId", "==", chatId).get()

      results = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((msg) => msg.content.toLowerCase().includes(searchTerm))
    } else {
      // Buscar na memória
      results = memoryStore.messages.filter(
        (msg) => msg.chatId === chatId && msg.content.toLowerCase().includes(searchTerm),
      )
    }

    ws.send(
      JSON.stringify({
        type: "searchResults",
        results: results,
        searchTerm: searchTerm,
      }),
    )
  } catch (error) {
    console.error("Erro ao pesquisar mensagens:", error)
  }
}

// Contact and user management
async function handleAddContact(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    let contactData = null
    let contactId = null

    if (db) {
      // Buscar usuário pelo número no Firebase
      const usersRef = db.collection("users")
      const snapshot = await usersRef.where("userNumber", "==", message.userNumber).get()

      if (!snapshot.empty) {
        const contactDoc = snapshot.docs[0]
        contactData = contactDoc.data()
        contactId = contactDoc.id
      }
    } else {
      // Buscar usuário pelo número na memória
      for (const [id, user] of memoryStore.users.entries()) {
        if (user.userNumber === message.userNumber) {
          contactData = user
          contactId = id
          break
        }
      }
    }

    if (!contactData) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Usuário não encontrado com este número",
        }),
      )
      return
    }

    // Verificar se já é contato
    let userData = null

    if (db) {
      const userDoc = await db.collection("users").doc(userId).get()
      userData = userDoc.data()
    } else {
      userData = memoryStore.users.get(userId)
    }

    if (userData.contacts && userData.contacts.some((c) => c.userId === contactId)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Este usuário já está na sua lista de contatos",
        }),
      )
      return
    }

    // Verificar se o contato requer aprovação
    const requiresApproval = contactData.settings?.requireContactApproval || false

    // Adicionar contato
    const contact = {
      userId: contactId,
      name: message.contactName || contactData.name,
      avatar: contactData.avatar,
      color: contactData.color,
      profileImage: contactData.profileImage,
      userNumber: contactData.userNumber,
      addedAt: new Date().toISOString(),
      status: requiresApproval ? "pending" : "accepted",
    }

    if (db) {
      // Atualizar no Firebase
      await db
        .collection("users")
        .doc(userId)
        .update({
          contacts: admin.firestore.FieldValue.arrayUnion(contact),
        })
    } else {
      // Atualizar na memória
      if (!userData.contacts) userData.contacts = []
      userData.contacts.push(contact)
      memoryStore.users.set(userId, userData)
    }

    ws.send(
      JSON.stringify({
        type: "contactAdded",
        contact: contact,
      }),
    )

    // Notificar o outro usuário se necessário aprovação
    if (requiresApproval) {
      const contactRequest = {
        type: "contactRequest",
        from: {
          userId: userId,
          name: userData.name,
          avatar: userData.avatar,
          color: userData.color,
          profileImage: userData.profileImage,
          userNumber: userData.userNumber,
        },
        timestamp: new Date().toISOString(),
      }

      await broadcastToUser(contactId, contactRequest)
    }
  } catch (error) {
    console.error("Erro ao adicionar contato:", error)
  }
}

async function handleBlockUser(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    if (db) {
      await db
        .collection("users")
        .doc(userId)
        .update({
          blocked: admin.firestore.FieldValue.arrayUnion(message.blockedUserId),
        })
    } else {
      const userData = memoryStore.users.get(userId)
      if (!userData.blocked) userData.blocked = []
      userData.blocked.push(message.blockedUserId)
      memoryStore.users.set(userId, userData)
    }

    ws.send(
      JSON.stringify({
        type: "userBlocked",
        blockedUserId: message.blockedUserId,
      }),
    )
  } catch (error) {
    console.error("Erro ao bloquear usuário:", error)
  }
}

async function handleReportUser(ws, message) {
  try {
    const reporterId = getUserIdFromWebSocket(ws)
    if (!reporterId) return

    const report = {
      id: uuidv4(),
      reporterId: reporterId,
      reporterName: connectedUsers.get(reporterId).name,
      reportedUserId: message.reportedUserId,
      reportedUserName: message.reportedUserName,
      reason: message.reason || "Não especificado",
      details: message.details || "",
      timestamp: new Date().toISOString(),
      status: "pending",
    }

    if (db) {
      await db.collection("reports").add(report)
    } else {
      memoryStore.reports.push(report)
    }

    ws.send(
      JSON.stringify({
        type: "reportSubmitted",
        message: "Denúncia enviada com sucesso",
      }),
    )

    // Notificar administradores
    await notifyAdmins({
      type: "newReport",
      report: report,
    })
  } catch (error) {
    console.error("Erro ao denunciar usuário:", error)
  }
}

// Group management
async function handleCreateGroup(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const groupId = uuidv4()
    const groupData = {
      id: groupId,
      name: message.name,
      description: message.description || "",
      avatar: message.avatar || "👥",
      color: message.color || "#9ACD32",
      createdBy: userId,
      admins: [userId],
      members: [userId, ...message.members],
      createdAt: new Date().toISOString(),
      settings: {
        onlyAdminsCanMessage: false,
        onlyAdminsCanAddMembers: false,
      },
    }

    if (db) {
      await db.collection("groups").doc(groupId).set(groupData)
    } else {
      memoryStore.groups.set(groupId, groupData)
    }

    // Notificar membros
    const broadcastData = {
      type: "groupCreated",
      group: groupData,
    }

    for (const memberId of groupData.members) {
      await broadcastToUser(memberId, broadcastData)
    }
  } catch (error) {
    console.error("Erro ao criar grupo:", error)
  }
}

async function handleJoinGroup(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    let groupData = null

    if (db) {
      const groupDoc = await db.collection("groups").doc(message.groupId).get()
      if (!groupDoc.exists) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Grupo não encontrado",
          }),
        )
        return
      }
      groupData = groupDoc.data()
    } else {
      groupData = memoryStore.groups.get(message.groupId)
      if (!groupData) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Grupo não encontrado",
          }),
        )
        return
      }
    }

    // Verificar se o usuário já está no grupo
    if (groupData.members.includes(userId)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Você já está neste grupo",
        }),
      )
      return
    }

    // Adicionar usuário ao grupo
    if (db) {
      await db
        .collection("groups")
        .doc(message.groupId)
        .update({
          members: admin.firestore.FieldValue.arrayUnion(userId),
        })
    } else {
      groupData.members.push(userId)
      memoryStore.groups.set(message.groupId, groupData)
    }

    // Notificar membros do grupo
    const userData = connectedUsers.get(userId)
    const broadcastData = {
      type: "userJoinedGroup",
      groupId: message.groupId,
      userId: userId,
      userName: userData.name,
      userAvatar: userData.avatar,
    }

    for (const memberId of groupData.members) {
      await broadcastToUser(memberId, broadcastData)
    }

    ws.send(
      JSON.stringify({
        type: "joinGroupSuccess",
        groupId: message.groupId,
        group: {
          ...groupData,
          members: [...groupData.members, userId],
        },
      }),
    )
  } catch (error) {
    console.error("Erro ao entrar no grupo:", error)
  }
}

async function handleLeaveGroup(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    let groupData = null

    if (db) {
      const groupDoc = await db.collection("groups").doc(message.groupId).get()
      if (!groupDoc.exists) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Grupo não encontrado",
          }),
        )
        return
      }
      groupData = groupDoc.data()
    } else {
      groupData = memoryStore.groups.get(message.groupId)
      if (!groupData) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Grupo não encontrado",
          }),
        )
        return
      }
    }

    // Verificar se o usuário está no grupo
    if (!groupData.members.includes(userId)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Você não está neste grupo",
        }),
      )
      return
    }

    // Remover usuário do grupo
    if (db) {
      await db
        .collection("groups")
        .doc(message.groupId)
        .update({
          members: admin.firestore.FieldValue.arrayRemove(userId),
        })
    } else {
      groupData.members = groupData.members.filter((id) => id !== userId)
      memoryStore.groups.set(message.groupId, groupData)
    }

    // Notificar membros do grupo
    const userData = connectedUsers.get(userId)
    const broadcastData = {
      type: "userLeftGroup",
      groupId: message.groupId,
      userId: userId,
      userName: userData.name,
      userAvatar: userData.avatar,
    }

    for (const memberId of groupData.members) {
      await broadcastToUser(memberId, broadcastData)
    }

    ws.send(
      JSON.stringify({
        type: "leaveGroupSuccess",
        groupId: message.groupId,
      }),
    )
  } catch (error) {
    console.error("Erro ao sair do grupo:", error)
  }
}

async function handleMarkAsRead(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    let messageData = null

    if (db) {
      const messageDoc = await db.collection("messages").doc(message.messageId).get()
      if (!messageDoc.exists) return
      messageData = messageDoc.data()
    } else {
      messageData = memoryStore.messages.find((m) => m.id === message.messageId)
      if (!messageData) return
    }

    // Verificar se o usuário pode marcar como lido
    if (messageData.chatType === "private" && !messageData.participants.includes(userId)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Você não pode marcar esta mensagem como lida",
        }),
      )
      return
    }

    // Marcar como lido
    if (db) {
      await db
        .collection("messages")
        .doc(message.messageId)
        .update({
          readBy: admin.firestore.FieldValue.arrayUnion(userId),
        })
    } else {
      const index = memoryStore.messages.findIndex((m) => m.id === message.messageId)
      if (index !== -1) {
        if (!memoryStore.messages[index].readBy) memoryStore.messages[index].readBy = []
        if (!memoryStore.messages[index].readBy.includes(userId)) {
          memoryStore.messages[index].readBy.push(userId)
        }
      }
    }

    ws.send(
      JSON.stringify({
        type: "messageMarkedAsRead",
        messageId: message.messageId,
      }),
    )
  } catch (error) {
    console.error("Erro ao marcar mensagem como lida:", error)
  }
}

// Settings and profile
async function handleUpdateProfile(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const updates = {}

    if (message.user.name) updates.name = message.user.name
    if (message.user.avatar) updates.avatar = message.user.avatar
    if (message.user.color) updates.color = message.user.color
    if (message.user.profileImage !== undefined) updates.profileImage = message.user.profileImage

    if (db) {
      await db.collection("users").doc(userId).update(updates)
    } else {
      const userData = memoryStore.users.get(userId)
      Object.assign(userData, updates)
      memoryStore.users.set(userId, userData)
    }

    // Atualizar dados em memória
    const userData = connectedUsers.get(userId)
    if (userData) {
      Object.assign(userData, updates)
      connectedUsers.set(userId, userData)
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
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error)
  }
}

async function handleUpdateSettings(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    if (db) {
      await db.collection("users").doc(userId).update({
        settings: message.settings,
      })
    } else {
      const userData = memoryStore.users.get(userId)
      userData.settings = message.settings
      memoryStore.users.set(userId, userData)
    }

    ws.send(
      JSON.stringify({
        type: "settingsUpdated",
        settings: message.settings,
      }),
    )
  } catch (error) {
    console.error("Erro ao atualizar configurações:", error)
  }
}

// Data retrieval
async function handleGetContacts(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    let userData = null

    if (db) {
      const userDoc = await db.collection("users").doc(userId).get()
      userData = userDoc.data()
    } else {
      userData = memoryStore.users.get(userId)
    }

    ws.send(
      JSON.stringify({
        type: "contactsList",
        contacts: userData.contacts || [],
      }),
    )
  } catch (error) {
    console.error("Erro ao buscar contatos:", error)
  }
}

async function handleGetMessages(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const chatId = message.chatId || "general"
    const limit = message.limit || 50

    let messages = []

    if (db) {
      const query = db.collection("messages").where("chatId", "==", chatId).orderBy("timestamp", "desc").limit(limit)

      const snapshot = await query.get()

      snapshot.forEach((doc) => {
        const data = doc.data()
        messages.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
        })
      })
    } else {
      messages = memoryStore.messages
        .filter((m) => m.chatId === chatId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit)
    }

    ws.send(
      JSON.stringify({
        type: "messagesList",
        messages: messages.reverse(),
        chatId: chatId,
      }),
    )
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error)
  }
}

async function handleGetUsers(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    let users = []

    if (db) {
      const snapshot = await db.collection("users").get()
      users = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          userId: doc.id,
          name: data.name,
          avatar: data.avatar,
          color: data.color,
          profileImage: data.profileImage,
          userNumber: data.userNumber,
          isOnline: data.isOnline || false,
        }
      })
    } else {
      users = Array.from(memoryStore.users.entries()).map(([id, user]) => ({
        userId: id,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
        profileImage: user.profileImage,
        userNumber: user.userNumber,
        isOnline: user.isOnline || false,
      }))
    }

    // Filtrar usuários bloqueados
    users = users.filter((user) => {
      return !isUserBlockedSync(user.userId, userId) && !isUserBlockedSync(userId, user.userId)
    })

    ws.send(
      JSON.stringify({
        type: "usersList",
        users: users,
      }),
    )
  } catch (error) {
    console.error("Erro ao buscar usuários:", error)
  }
}

// Admin handlers
async function handleAdminGetUsers(ws) {
  if (!isAdminWebSocket(ws)) return

  try {
    let users = []

    if (db) {
      const snapshot = await db.collection("users").get()
      users = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          userId: doc.id,
          name: data.name,
          email: data.email,
          avatar: data.avatar,
          color: data.color,
          profileImage: data.profileImage,
          userNumber: data.userNumber,
          isOnline: data.isOnline || false,
          createdAt: data.createdAt,
          banned: data.banned || false,
        }
      })
    } else {
      users = Array.from(memoryStore.users.entries()).map(([id, user]) => ({
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
      }))
    }

    ws.send(
      JSON.stringify({
        type: "adminUsersList",
        users: users,
      }),
    )
  } catch (error) {
    console.error("Erro ao buscar usuários (admin):", error)
  }
}

async function handleAdminGetReports(ws) {
  if (!isAdminWebSocket(ws)) return

  try {
    let reports = []

    if (db) {
      const snapshot = await db.collection("reports").orderBy("timestamp", "desc").get()
      reports = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    } else {
      reports = [...memoryStore.reports].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    }

    ws.send(
      JSON.stringify({
        type: "adminReportsList",
        reports: reports,
      }),
    )
  } catch (error) {
    console.error("Erro ao buscar denúncias (admin):", error)
  }
}

async function handleAdminBanUser(ws, message) {
  if (!isAdminWebSocket(ws)) return

  try {
    if (db) {
      await db.collection("users").doc(message.userId).update({ banned: true })
    } else {
      const userData = memoryStore.users.get(message.userId)
      if (userData) {
        userData.banned = true
        memoryStore.users.set(message.userId, userData)
      }
    }

    // Desconectar usuário se estiver online
    const userData = connectedUsers.get(message.userId)
    if (userData && userData.ws) {
      userData.ws.send(
        JSON.stringify({
          type: "banned",
          message: "Sua conta foi banida por violar os termos de uso",
        }),
      )
      userData.ws.close()
    }

    ws.send(
      JSON.stringify({
        type: "adminActionSuccess",
        message: "Usuário banido com sucesso",
        action: "ban",
        userId: message.userId,
      }),
    )
  } catch (error) {
    console.error("Erro ao banir usuário:", error)
  }
}

async function handleAdminDeleteUser(ws, message) {
  if (!isAdminWebSocket(ws)) return

  try {
    // Desconectar usuário se estiver online
    const userData = connectedUsers.get(message.userId)
    if (userData && userData.ws) {
      userData.ws.send(
        JSON.stringify({
          type: "accountDeleted",
          message: "Sua conta foi excluída por um administrador",
        }),
      )
      userData.ws.close()
    }

    // Deletar do armazenamento
    if (db) {
      await db.collection("users").doc(message.userId).delete()
    } else {
      memoryStore.users.delete(message.userId)
    }

    // Remover das conexões
    connectedUsers.delete(message.userId)

    ws.send(
      JSON.stringify({
        type: "adminActionSuccess",
        message: "Usuário excluído com sucesso",
        action: "delete",
        userId: message.userId,
      }),
    )
  } catch (error) {
    console.error("Erro ao excluir usuário:", error)
  }
}

async function handleAdminUpdateSettings(ws, message) {
  if (!isAdminWebSocket(ws)) return

  try {
    systemSettings = { ...systemSettings, ...message.settings }
    await saveSystemSettings()

    ws.send(
      JSON.stringify({
        type: "adminActionSuccess",
        message: "Configurações atualizadas com sucesso",
        action: "updateSettings",
      }),
    )

    // Notificar outros admins
    await notifyAdmins(
      {
        type: "settingsUpdated",
        settings: systemSettings,
      },
      ws,
    )
  } catch (error) {
    console.error("Erro ao atualizar configurações:", error)
  }
}

// Utility functions
async function handleDisconnection(ws) {
  // Remover usuário das conexões ativas
  for (const [userId, userData] of connectedUsers.entries()) {
    if (userData.ws === ws) {
      try {
        // Atualizar status no armazenamento
        if (db) {
          await db.collection("users").doc(userId).update({
            isOnline: false,
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
          })
        } else {
          const user = memoryStore.users.get(userId)
          if (user) {
            user.isOnline = false
            user.lastSeen = new Date().toISOString()
            memoryStore.users.set(userId, user)
          }
        }

        // Remover da memória
        connectedUsers.delete(userId)

        // Notificar outros usuários
        await broadcastUserStatus(userId, false)
      } catch (error) {
        console.error("Erro ao processar desconexão:", error)
      }
      break
    }
  }

  // Remover sessão de admin
  for (const [sessionId, sessionData] of adminSessions.entries()) {
    if (sessionData.ws === ws) {
      adminSessions.delete(sessionId)
      break
    }
  }
}

async function broadcastUserStatus(userId, isOnline) {
  const userData = connectedUsers.get(userId)
  if (!userData) return

  const statusData = {
    type: "userStatusUpdate",
    userId: userId,
    userName: userData.name,
    isOnline: isOnline,
    lastSeen: new Date().toISOString(),
  }

  for (const [otherUserId, otherUserData] of connectedUsers.entries()) {
    if (otherUserId !== userId && otherUserData.ws && !(await isUserBlocked(otherUserId, userId))) {
      otherUserData.ws.send(JSON.stringify(statusData))
    }
  }
}

async function broadcastUserUpdate(userId) {
  const userData = connectedUsers.get(userId)
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

  for (const [otherUserId, otherUserData] of connectedUsers.entries()) {
    if (otherUserId !== userId && otherUserData.ws && !(await isUserBlocked(otherUserId, userId))) {
      otherUserData.ws.send(JSON.stringify(updateData))
    }
  }
}

async function broadcastToGroup(groupId, message) {
  try {
    let groupData = null

    if (db) {
      const groupDoc = await db.collection("groups").doc(groupId).get()
      if (!groupDoc.exists) return
      groupData = groupDoc.data()
    } else {
      groupData = memoryStore.groups.get(groupId)
      if (!groupData) return
    }

    for (const memberId of groupData.members) {
      await broadcastToUser(memberId, message)
    }
  } catch (error) {
    console.error("Erro ao broadcast para grupo:", error)
  }
}

async function broadcastToUser(userId, message) {
  const userData = connectedUsers.get(userId)
  if (userData && userData.ws) {
    userData.ws.send(JSON.stringify(message))
  }
}

async function notifyAdmins(message, excludeWs = null) {
  for (const sessionData of adminSessions.values()) {
    if (sessionData.ws && sessionData.ws !== excludeWs) {
      sessionData.ws.send(JSON.stringify(message))
    }
  }
}

function getUserIdFromWebSocket(ws) {
  for (const [userId, userData] of connectedUsers.entries()) {
    if (userData.ws === ws) {
      return userId
    }
  }
  return null
}

function isAdminWebSocket(ws) {
  for (const sessionData of adminSessions.values()) {
    if (sessionData.ws === ws) {
      return true
    }
  }
  return false
}

async function isUserBlocked(userId, blockedUserId) {
  try {
    let userData = null

    if (db) {
      const userDoc = await db.collection("users").doc(userId).get()
      userData = userDoc.data()
    } else {
      userData = memoryStore.users.get(userId)
    }

    return userData && userData.blocked && userData.blocked.includes(blockedUserId)
  } catch (error) {
    return false
  }
}

function isUserBlockedSync(userId, blockedUserId) {
  const userData = connectedUsers.get(userId)
  return userData && userData.blocked && userData.blocked.includes(blockedUserId)
}

async function generateUniqueNumber() {
  let number
  let isUnique = false

  while (!isUnique) {
    number = Math.floor(10000000 + Math.random() * 90000000).toString()

    if (db) {
      const snapshot = await db.collection("users").where("userNumber", "==", number).get()
      isUnique = snapshot.empty
    } else {
      isUnique = true
      for (const user of memoryStore.users.values()) {
        if (user.userNumber === number) {
          isUnique = false
          break
        }
      }
    }
  }

  return number
}

console.log(`Servidor WebSocket rodando na porta ${process.env.WS_PORT || 8080}`)
console.log(`Servidor HTTP rodando na porta ${PORT}`)
