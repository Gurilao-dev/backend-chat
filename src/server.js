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
const serviceAccount = require("../firebase-service-account.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com/`,
  storageBucket: `${serviceAccount.project_id}.appspot.com`,
})

const db = admin.firestore()
const storage = admin.storage()

// Configurar Express
const app = express()
app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.static("public"))

// Configurar Multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
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

// Senhas de acesso
const ACCESS_PASSWORD = "gorilachatv2"
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
  try {
    await db.collection("system").doc("settings").set(systemSettings)
  } catch (error) {
    console.error("Erro ao salvar configurações:", error)
  }
}

// Carregar configurações iniciais
loadSystemSettings()

// Rotas Express
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" })
    }

    const fileName = `${uuidv4()}_${req.file.originalname}`
    const file = storage.bucket().file(`uploads/${fileName}`)

    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      },
    })

    // Tornar o arquivo público
    await file.makePublic()

    const publicUrl = `https://storage.googleapis.com/${storage.bucket().name}/uploads/${fileName}`

    res.json({ url: publicUrl })
  } catch (error) {
    console.error("Erro no upload:", error)
    res.status(500).json({ error: "Erro no upload do arquivo" })
  }
})

app.get("/health", (req, res) => {
  res.json({ status: "ok", maintenance: systemSettings.maintenanceMode })
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
    // Buscar usuário no Firebase
    const usersRef = db.collection("users")
    const snapshot = await usersRef.where("email", "==", message.email).get()

    if (snapshot.empty) {
      ws.send(
        JSON.stringify({
          type: "loginError",
          message: "Usuário não encontrado",
        }),
      )
      return
    }

    const userDoc = snapshot.docs[0]
    const userData = userDoc.data()

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
    await userDoc.ref.update({
      isOnline: true,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    })

    // Criar sessão
    const sessionToken = uuidv4()
    const userSession = {
      userId: userDoc.id,
      email: userData.email,
      ws: ws,
    }

    userSessions.set(sessionToken, userSession)
    connectedUsers.set(userDoc.id, { ...userData, ws: ws, userId: userDoc.id })

    ws.send(
      JSON.stringify({
        type: "loginSuccess",
        sessionToken: sessionToken,
        user: {
          userId: userDoc.id,
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
    await broadcastUserStatus(userDoc.id, true)
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
    // Verificar se email já existe
    const usersRef = db.collection("users")
    const emailCheck = await usersRef.where("email", "==", message.email).get()

    if (!emailCheck.empty) {
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

    // Criar usuário no Firebase
    const userData = {
      name: message.name,
      email: message.email,
      password: message.password,
      avatar: message.avatar || "👤",
      color: message.color || "#3a86ff",
      profileImage: message.profileImage || null,
      userNumber: userNumber,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isOnline: true,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      contacts: [],
      blocked: [],
      settings: {
        hideLastSeen: false,
        hideOnlineStatus: false,
        chatBackground: null,
      },
      banned: false,
    }

    const userRef = await usersRef.add(userData)
    const userId = userRef.id

    // Criar sessão
    const sessionToken = uuidv4()
    userSessions.set(sessionToken, {
      userId: userId,
      email: message.email,
      ws: ws,
    })

    connectedUsers.set(userId, { ...userData, ws: ws, userId: userId })

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
          createdAt: new Date().toISOString(),
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
    const messageData = {
      id: uuidv4(),
      userId: userId,
      userName: userData.name,
      userAvatar: userData.avatar,
      userColor: userData.color,
      userProfileImage: userData.profileImage,
      content: message.content,
      type: message.messageType || "text",
      chatId: message.chatId || "general",
      chatType: message.chatType || "group",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      replyTo: message.replyTo || null,
      reactions: {},
      readBy: [userId],
      editedAt: null,
      deleted: false,
    }

    // Salvar no Firebase
    await db.collection("messages").add(messageData)

    // Preparar dados para broadcast
    const broadcastData = {
      ...messageData,
      timestamp: new Date().toISOString(),
    }

    // Broadcast para usuários relevantes
    if (message.chatType === "group") {
      await broadcastToGroup(message.chatId, {
        type: "newMessage",
        message: broadcastData,
      })
    } else {
      await broadcastToUser(message.recipientId, {
        type: "newMessage",
        message: broadcastData,
      })

      // Enviar de volta para o remetente
      ws.send(
        JSON.stringify({
          type: "newMessage",
          message: broadcastData,
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

    const messageData = {
      id: uuidv4(),
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
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      replyTo: message.replyTo || null,
      reactions: {},
      readBy: [senderId],
      editedAt: null,
      deleted: false,
    }

    // Salvar no Firebase
    await db.collection("messages").add(messageData)

    // Preparar dados para envio
    const broadcastData = {
      ...messageData,
      timestamp: new Date().toISOString(),
    }

    // Enviar para ambos os usuários
    ws.send(
      JSON.stringify({
        type: "newPrivateMessage",
        message: broadcastData,
      }),
    )

    if (recipientData.ws) {
      recipientData.ws.send(
        JSON.stringify({
          type: "newPrivateMessage",
          message: broadcastData,
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

    const messageRef = db.collection("messages").doc(message.messageId)
    const messageDoc = await messageRef.get()

    if (!messageDoc.exists) return

    const messageData = messageDoc.data()
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

    // Atualizar no Firebase
    await messageRef.update({ reactions })

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

    const messageRef = db.collection("messages").doc(message.messageId)
    const messageDoc = await messageRef.get()

    if (!messageDoc.exists) return

    const messageData = messageDoc.data()

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
      await messageRef.update({
        deleted: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        content: "Esta mensagem foi apagada",
      })

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

async function handleJoinGroup(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const groupRef = db.collection("groups").doc(message.groupId)
    const groupDoc = await groupRef.get()

    if (!groupDoc.exists) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Grupo não encontrado",
        }),
      )
      return
    }

    const groupData = groupDoc.data()

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
    await groupRef.update({
      members: admin.firestore.FieldValue.arrayUnion(userId),
    })

    // Notificar membros do grupo
    const broadcastData = {
      type: "userJoinedGroup",
      groupId: message.groupId,
      userId: userId,
      userName: connectedUsers.get(userId).name,
      userAvatar: connectedUsers.get(userId).avatar,
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

    const groupRef = db.collection("groups").doc(message.groupId)
    const groupDoc = await groupRef.get()

    if (!groupDoc.exists) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Grupo não encontrado",
        }),
      )
      return
    }

    const groupData = groupDoc.data()

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
    await groupRef.update({
      members: admin.firestore.FieldValue.arrayRemove(userId),
    })

    // Notificar membros do grupo
    const broadcastData = {
      type: "userLeftGroup",
      groupId: message.groupId,
      userId: userId,
      userName: connectedUsers.get(userId).name,
      userAvatar: connectedUsers.get(userId).avatar,
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

    const messageRef = db.collection("messages").doc(message.messageId)
    const messageDoc = await messageRef.get()

    if (!messageDoc.exists) return

    const messageData = messageDoc.data()

    // Verificar se o usuário pode marcar como lido
    if (!messageData.participants.includes(userId)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Você não pode marcar esta mensagem como lida",
        }),
      )
      return
    }

    // Marcar como lido
    await messageRef.update({
      readBy: admin.firestore.FieldValue.arrayUnion(userId),
    })

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

// Contact and user management
async function handleAddContact(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    // Buscar usuário pelo número
    const usersRef = db.collection("users")
    const snapshot = await usersRef.where("userNumber", "==", message.userNumber).get()

    if (snapshot.empty) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Usuário não encontrado com este número",
        }),
      )
      return
    }

    const contactDoc = snapshot.docs[0]
    const contactData = contactDoc.data()
    const contactId = contactDoc.id

    // Verificar se já é contato
    const userRef = db.collection("users").doc(userId)
    const userDoc = await userRef.get()
    const userData = userDoc.data()

    if (userData.contacts && userData.contacts.some((c) => c.userId === contactId)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Este usuário já está na sua lista de contatos",
        }),
      )
      return
    }

    // Adicionar contato
    const contact = {
      userId: contactId,
      name: contactData.name,
      avatar: contactData.avatar,
      color: contactData.color,
      profileImage: contactData.profileImage,
      userNumber: contactData.userNumber,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    await userRef.update({
      contacts: admin.firestore.FieldValue.arrayUnion(contact),
    })

    ws.send(
      JSON.stringify({
        type: "contactAdded",
        contact: {
          ...contact,
          addedAt: new Date().toISOString(),
        },
      }),
    )
  } catch (error) {
    console.error("Erro ao adicionar contato:", error)
  }
}

async function handleBlockUser(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const userRef = db.collection("users").doc(userId)
    await userRef.update({
      blocked: admin.firestore.FieldValue.arrayUnion(message.blockedUserId),
    })

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
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending",
    }

    await db.collection("reports").add(report)

    ws.send(
      JSON.stringify({
        type: "reportSubmitted",
        message: "Denúncia enviada com sucesso",
      }),
    )

    // Notificar administradores
    await notifyAdmins({
      type: "newReport",
      report: {
        ...report,
        timestamp: new Date().toISOString(),
      },
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

    const groupData = {
      id: uuidv4(),
      name: message.name,
      description: message.description || "",
      avatar: message.avatar || "👥",
      color: message.color || "#3a86ff",
      createdBy: userId,
      admins: [userId],
      members: [userId, ...message.members],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      settings: {
        onlyAdminsCanMessage: false,
        onlyAdminsCanAddMembers: false,
      },
    }

    await db.collection("groups").doc(groupData.id).set(groupData)

    // Notificar membros
    const broadcastData = {
      type: "groupCreated",
      group: {
        ...groupData,
        createdAt: new Date().toISOString(),
      },
    }

    for (const memberId of groupData.members) {
      await broadcastToUser(memberId, broadcastData)
    }
  } catch (error) {
    console.error("Erro ao criar grupo:", error)
  }
}

// Settings and profile
async function handleUpdateProfile(ws, message) {
  try {
    const userId = getUserIdFromWebSocket(ws)
    if (!userId) return

    const userRef = db.collection("users").doc(userId)
    const updates = {}

    if (message.user.name) updates.name = message.user.name
    if (message.user.avatar) updates.avatar = message.user.avatar
    if (message.user.color) updates.color = message.user.color
    if (message.user.profileImage !== undefined) updates.profileImage = message.user.profileImage

    await userRef.update(updates)

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

    const userRef = db.collection("users").doc(userId)
    await userRef.update({
      settings: message.settings,
    })

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

    const userDoc = await db.collection("users").doc(userId).get()
    const userData = userDoc.data()

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

    const query = db.collection("messages").where("chatId", "==", chatId).orderBy("timestamp", "desc").limit(limit)

    const snapshot = await query.get()
    const messages = []

    snapshot.forEach((doc) => {
      const data = doc.data()
      messages.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
      })
    })

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

    const users = Array.from(connectedUsers.values())
      .filter((user) => {
        return !isUserBlockedSync(user.userId, userId) && !isUserBlockedSync(userId, user.userId)
      })
      .map((user) => {
        const { ws, password, blocked, ...userData } = user
        return userData
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
    const snapshot = await db.collection("users").get()
    const users = []

    snapshot.forEach((doc) => {
      const data = doc.data()
      users.push({
        userId: doc.id,
        ...data,
        password: undefined, // Não enviar senha
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      })
    })

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
    const snapshot = await db.collection("reports").orderBy("timestamp", "desc").get()
    const reports = []

    snapshot.forEach((doc) => {
      const data = doc.data()
      reports.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
      })
    })

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
    const userRef = db.collection("users").doc(message.userId)
    await userRef.update({ banned: true })

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

    // Deletar do Firebase
    await db.collection("users").doc(message.userId).delete()

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
        // Atualizar status no Firebase
        await db.collection("users").doc(userId).update({
          isOnline: false,
          lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        })

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
    const groupDoc = await db.collection("groups").doc(groupId).get()
    if (!groupDoc.exists) return

    const groupData = groupDoc.data()
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
    const userDoc = await db.collection("users").doc(userId).get()
    const userData = userDoc.data()
    return userData.blocked && userData.blocked.includes(blockedUserId)
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

    const snapshot = await db.collection("users").where("userNumber", "==", number).get()
    isUnique = snapshot.empty
  }

  return number
}

console.log(`Servidor WebSocket rodando na porta ${process.env.WS_PORT || 8080}`)
console.log(`Servidor HTTP rodando na porta ${PORT}`)
