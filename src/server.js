const { WebSocketServer } = require("ws")
const dotenv = require("dotenv")
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")

dotenv.config()

const wss = new WebSocketServer({ port: process.env.PORT || 8080 })

// Armazenamento de dados
const connectedUsers = new Map()
const userSessions = new Map()
const adminSessions = new Map()
const blockedUsers = new Map() // userId -> [blockedUserId1, blockedUserId2, ...]
const reports = [] // Array de denúncias
const bannedUsers = new Set() // Set de IDs de usuários banidos

// Senhas de acesso
const ACCESS_PASSWORD = "gorilachatv2"
const ADMIN_PASSWORD = "admin123"

// Caminho para armazenamento de dados
const DATA_DIR = path.join(__dirname, "data")
const USERS_FILE = path.join(DATA_DIR, "users.json")
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json")
const REPORTS_FILE = path.join(DATA_DIR, "reports.json")
const BANNED_FILE = path.join(DATA_DIR, "banned.json")

// Garantir que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// Carregar dados do armazenamento
function loadData() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))
      users.forEach((user) => {
        if (!bannedUsers.has(user.userId)) {
          // Não carregue usuários banidos
          connectedUsers.set(user.userId, { ...user, isOnline: false, ws: null })
        }
      })
      console.log(`Carregados ${users.length} usuários do armazenamento`)
    }

    if (fs.existsSync(REPORTS_FILE)) {
      const loadedReports = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"))
      reports.push(...loadedReports)
      console.log(`Carregadas ${loadedReports.length} denúncias do armazenamento`)
    }

    if (fs.existsSync(BANNED_FILE)) {
      const banned = JSON.parse(fs.readFileSync(BANNED_FILE, "utf8"))
      banned.forEach((id) => bannedUsers.add(id))
      console.log(`Carregados ${banned.length} usuários banidos do armazenamento`)
    }
  } catch (error) {
    console.error("Erro ao carregar dados:", error)
  }
}

// Salvar dados no armazenamento
function saveData() {
  try {
    // Salvar usuários
    const users = Array.from(connectedUsers.values()).map((user) => {
      // Remover propriedades não serializáveis
      const { ws, ...userData } = user
      return userData
    })
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))

    // Salvar denúncias
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2))

    // Salvar usuários banidos
    fs.writeFileSync(BANNED_FILE, JSON.stringify(Array.from(bannedUsers), null, 2))

    console.log("Dados salvos com sucesso")
  } catch (error) {
    console.error("Erro ao salvar dados:", error)
  }
}

// Carregar dados iniciais
loadData()

// Configurar salvamento automático a cada 5 minutos
setInterval(saveData, 5 * 60 * 1000)

wss.on("connection", (ws) => {
  console.log("Novo cliente conectado")

  ws.on("error", console.error)

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString())

      switch (message.type) {
        case "auth":
          handleAuth(ws, message)
          break
        case "adminAuth":
          handleAdminAuth(ws, message)
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
        case "privateMessage":
          handlePrivateMessage(ws, message)
          break
        case "typing":
          handleTyping(message)
          break
        case "user_status":
          handleUserStatus(message)
          break
        case "add_contact":
          handleAddContact(ws, message)
          break
        case "create_group":
          handleCreateGroup(message)
          break
        case "updateProfile":
          handleUpdateProfile(ws, message)
          break
        case "blockUser":
          handleBlockUser(ws, message)
          break
        case "unblockUser":
          handleUnblockUser(ws, message)
          break
        case "reportUser":
          handleReportUser(ws, message)
          break
        case "reaction":
          handleReaction(message)
          break
        case "deleteMessage":
          handleDeleteMessage(ws, message)
          break
        case "getUsers":
          sendUsersList(ws)
          break
        case "getMessages":
          sendMessagesList(ws)
          break
        case "getContacts":
          sendContactsList(ws, message)
          break
        // Admin commands
        case "adminGetUsers":
          handleAdminGetUsers(ws)
          break
        case "adminGetReports":
          handleAdminGetReports(ws)
          break
        case "adminBanUser":
          handleAdminBanUser(ws, message)
          break
        case "adminUnbanUser":
          handleAdminUnbanUser(ws, message)
          break
        case "adminDeleteUser":
          handleAdminDeleteUser(ws, message)
          break
        case "adminEditUser":
          handleAdminEditUser(ws, message)
          break
        case "adminResolveReport":
          handleAdminResolveReport(ws, message)
          break
        default:
          console.log("Tipo de mensagem desconhecido:", message.type)
      }
    } catch (error) {
      console.error("Erro ao processar mensagem:", error)
    }
  })

  ws.on("close", () => {
    // Remover usuário da lista de conectados
    for (const [userId, userData] of connectedUsers.entries()) {
      if (userData.ws === ws) {
        const updatedUserData = { ...userData, isOnline: false, lastSeen: new Date() }
        updatedUserData.ws = null
        connectedUsers.set(userId, updatedUserData)
        broadcastUserStatus(userId, false)
        break
      }
    }

    // Remover sessão de admin
    for (const [sessionId, sessionData] of adminSessions.entries()) {
      if (sessionData.ws === ws) {
        adminSessions.delete(sessionId)
        console.log("Sessão de admin encerrada")
        break
      }
    }

    console.log("Cliente desconectado")
  })
})

function handleAuth(ws, message) {
  if (message.password === ACCESS_PASSWORD || message.masterPassword === "sitedogorilão") {
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

function handleAdminAuth(ws, message) {
  if (message.password === ADMIN_PASSWORD) {
    const sessionToken = crypto.randomUUID()
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

function handleLogin(ws, message) {
  // Verificar se o usuário existe
  let foundUser = null
  for (const [userId, userData] of connectedUsers.entries()) {
    if (userData.email === message.email) {
      foundUser = { ...userData, userId }
      break
    }
  }

  if (!foundUser) {
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "Usuário não encontrado",
      }),
    )
    return
  }

  // Verificar se o usuário está banido
  if (bannedUsers.has(foundUser.userId)) {
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "Sua conta foi banida por violar os termos de uso",
      }),
    )
    return
  }

  // Verificar senha
  if (foundUser.password !== message.password) {
    ws.send(
      JSON.stringify({
        type: "loginError",
        message: "Senha incorreta",
      }),
    )
    return
  }

  // Criar sessão
  const sessionToken = crypto.randomUUID()
  userSessions.set(sessionToken, {
    userId: foundUser.userId,
    email: foundUser.email,
    ws: ws,
  })

  // Atualizar status do usuário
  foundUser.ws = ws
  foundUser.lastSeen = new Date()
  foundUser.isOnline = true
  connectedUsers.set(foundUser.userId, foundUser)

  ws.send(
    JSON.stringify({
      type: "loginSuccess",
      sessionToken: sessionToken,
      user: {
        userId: foundUser.userId,
        name: foundUser.name,
        email: foundUser.email,
        avatar: foundUser.avatar,
        color: foundUser.color,
        profileImage: foundUser.profileImage,
        userNumber: foundUser.userNumber,
        createdAt: foundUser.createdAt,
      },
    }),
  )

  broadcastUserStatus(foundUser.userId, true)
}

function handleRegister(ws, message) {
  // Verificar se o email já está em uso
  for (const userData of connectedUsers.values()) {
    if (userData.email === message.email) {
      ws.send(
        JSON.stringify({
          type: "registerError",
          message: "Este email já está em uso",
        }),
      )
      return
    }
  }

  // Gerar número único de 8 dígitos
  const userNumber = generateUniqueNumber()

  const userId = generateUserId()
  const userData = {
    userId: userId,
    name: message.name,
    email: message.email,
    password: message.password,
    avatar: message.avatar || "👤",
    color: message.color || "#3a86ff",
    profileImage: message.profileImage || null,
    userNumber: userNumber,
    createdAt: new Date().toISOString(),
    lastSeen: new Date(),
    isOnline: true,
    contacts: [],
    blocked: [],
    ws: ws,
  }

  connectedUsers.set(userId, userData)

  // Criar sessão
  const sessionToken = crypto.randomUUID()
  userSessions.set(sessionToken, {
    userId: userId,
    email: message.email,
    ws: ws,
  })

  ws.send(
    JSON.stringify({
      type: "registerSuccess",
      sessionToken: sessionToken,
      user: {
        userId: userId,
        name: message.name,
        email: message.email,
        avatar: message.avatar,
        color: message.color,
        profileImage: message.profileImage,
        userNumber: userNumber,
        createdAt: userData.createdAt,
      },
    }),
  )

  // Notificar outros usuários
  broadcastUserStatus(userId, true)

  // Salvar dados
  saveData()
}

function handleMessage(ws, message) {
  // Verificar se o usuário está autenticado
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Não autenticado",
      }),
    )
    return
  }

  const userData = connectedUsers.get(userId)
  if (!userData) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Usuário não encontrado",
      }),
    )
    return
  }

  // Criar mensagem
  const messageData = {
    id: crypto.randomUUID(),
    userId: userId,
    userName: userData.name,
    userAvatar: userData.avatar,
    userColor: userData.color,
    userProfileImage: userData.profileImage,
    content: message.content,
    type: message.messageType || "text",
    timestamp: new Date().toISOString(),
    replyTo: message.replyTo || null,
    reactions: {},
  }

  // Broadcast para todos os usuários
  for (const [otherUserId, otherUserData] of connectedUsers.entries()) {
    // Não enviar para usuários que bloquearam este usuário
    if (isUserBlocked(otherUserId, userId)) continue

    if (otherUserData.ws) {
      otherUserData.ws.send(
        JSON.stringify({
          type: "newMessage",
          message: messageData,
        }),
      )
    }
  }
}

function handlePrivateMessage(ws, message) {
  // Verificar se o usuário está autenticado
  const senderId = getUserIdFromWebSocket(ws)
  if (!senderId) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Não autenticado",
      }),
    )
    return
  }

  const senderData = connectedUsers.get(senderId)
  if (!senderData) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Usuário não encontrado",
      }),
    )
    return
  }

  // Verificar se o destinatário existe
  const recipientId = message.recipientId
  const recipientData = connectedUsers.get(recipientId)
  if (!recipientData) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Destinatário não encontrado",
      }),
    )
    return
  }

  // Verificar se o destinatário bloqueou o remetente
  if (isUserBlocked(recipientId, senderId)) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Você não pode enviar mensagens para este usuário",
      }),
    )
    return
  }

  // Criar mensagem privada
  const messageData = {
    id: crypto.randomUUID(),
    userId: senderId,
    userName: senderData.name,
    userAvatar: senderData.avatar,
    userColor: senderData.color,
    userProfileImage: senderData.profileImage,
    recipientId: recipientId,
    recipientName: recipientData.name,
    content: message.content,
    type: message.messageType || "text",
    timestamp: new Date().toISOString(),
    isPrivate: true,
    replyTo: message.replyTo || null,
    reactions: {},
  }

  // Enviar para o remetente
  ws.send(
    JSON.stringify({
      type: "newPrivateMessage",
      message: messageData,
    }),
  )

  // Enviar para o destinatário se estiver online
  if (recipientData.ws) {
    recipientData.ws.send(
      JSON.stringify({
        type: "newPrivateMessage",
        message: messageData,
      }),
    )
  }
}

function handleTyping(message) {
  const userId = message.userId
  const userData = connectedUsers.get(userId)
  if (!userData) return

  if (message.isPrivate && message.recipientId) {
    // Typing privado
    const recipientData = connectedUsers.get(message.recipientId)
    if (recipientData && recipientData.ws && !isUserBlocked(message.recipientId, userId)) {
      recipientData.ws.send(
        JSON.stringify({
          type: "typing",
          userId: userId,
          userName: userData.name,
          isTyping: message.isTyping,
          isPrivate: true,
        }),
      )
    }
  } else {
    // Typing em grupo
    for (const [otherUserId, otherUserData] of connectedUsers.entries()) {
      if (otherUserId !== userId && otherUserData.ws && !isUserBlocked(otherUserId, userId)) {
        otherUserData.ws.send(
          JSON.stringify({
            type: "typing",
            userId: userId,
            userName: userData.name,
            isTyping: message.isTyping,
            isPrivate: false,
          }),
        )
      }
    }
  }
}

function handleUserStatus(message) {
  const userId = message.userId
  if (connectedUsers.has(userId)) {
    const userData = connectedUsers.get(userId)
    userData.lastSeen = new Date()
    userData.isOnline = message.isOnline
    connectedUsers.set(userId, userData)

    broadcastUserStatus(userId, message.isOnline)
  }
}

function handleAddContact(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  // Verificar se o número de usuário existe
  let contactUser = null
  for (const [otherUserId, userData] of connectedUsers.entries()) {
    if (userData.userNumber === message.userNumber) {
      contactUser = { ...userData, userId: otherUserId }
      break
    }
  }

  if (!contactUser) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Usuário não encontrado com este número",
      }),
    )
    return
  }

  // Verificar se já é um contato
  const userData = connectedUsers.get(userId)
  if (userData.contacts.some((contact) => contact.userId === contactUser.userId)) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Este usuário já está na sua lista de contatos",
      }),
    )
    return
  }

  // Adicionar contato
  const contactData = {
    userId: contactUser.userId,
    name: contactUser.name,
    avatar: contactUser.avatar,
    color: contactUser.color,
    profileImage: contactUser.profileImage,
    userNumber: contactUser.userNumber,
    addedAt: new Date().toISOString(),
  }

  userData.contacts.push(contactData)
  connectedUsers.set(userId, userData)

  ws.send(
    JSON.stringify({
      type: "contactAdded",
      contact: contactData,
    }),
  )

  // Salvar dados
  saveData()
}

function handleCreateGroup(message) {
  // Implementação básica para grupos
  const groupId = crypto.randomUUID()
  const groupData = {
    ...message,
    groupId: groupId,
    createdAt: new Date().toISOString(),
  }

  // Notificar todos os membros do grupo
  message.members.forEach((memberId) => {
    const userData = connectedUsers.get(memberId)
    if (userData && userData.ws) {
      userData.ws.send(
        JSON.stringify({
          type: "group_created",
          group: groupData,
        }),
      )
    }
  })
}

function handleUpdateProfile(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const userData = connectedUsers.get(userId)
  if (!userData) return

  // Atualizar dados do perfil
  const updatedUserData = {
    ...userData,
    name: message.user.name || userData.name,
    avatar: message.user.avatar || userData.avatar,
    color: message.user.color || userData.color,
    profileImage: message.user.profileImage !== undefined ? message.user.profileImage : userData.profileImage,
  }

  connectedUsers.set(userId, updatedUserData)

  ws.send(
    JSON.stringify({
      type: "profileUpdated",
      user: {
        userId: userId,
        name: updatedUserData.name,
        email: updatedUserData.email,
        avatar: updatedUserData.avatar,
        color: updatedUserData.color,
        profileImage: updatedUserData.profileImage,
        userNumber: updatedUserData.userNumber,
      },
    }),
  )

  // Notificar outros usuários
  broadcastUserUpdate(userId)

  // Salvar dados
  saveData()
}

function handleBlockUser(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const blockedUserId = message.blockedUserId
  if (!blockedUserId || userId === blockedUserId) return

  const userData = connectedUsers.get(userId)
  if (!userData) return

  // Adicionar à lista de bloqueados
  if (!userData.blocked) {
    userData.blocked = []
  }

  if (!userData.blocked.includes(blockedUserId)) {
    userData.blocked.push(blockedUserId)
    connectedUsers.set(userId, userData)

    ws.send(
      JSON.stringify({
        type: "userBlocked",
        blockedUserId: blockedUserId,
      }),
    )

    // Salvar dados
    saveData()
  }
}

function handleUnblockUser(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const unblockedUserId = message.unblockedUserId
  if (!unblockedUserId) return

  const userData = connectedUsers.get(userId)
  if (!userData || !userData.blocked) return

  // Remover da lista de bloqueados
  userData.blocked = userData.blocked.filter((id) => id !== unblockedUserId)
  connectedUsers.set(userId, userData)

  ws.send(
    JSON.stringify({
      type: "userUnblocked",
      unblockedUserId: unblockedUserId,
    }),
  )

  // Salvar dados
  saveData()
}

function handleReportUser(ws, message) {
  const reporterId = getUserIdFromWebSocket(ws)
  if (!reporterId) return

  const reportedUserId = message.reportedUserId
  if (!reportedUserId || reporterId === reportedUserId) return

  // Criar relatório
  const report = {
    id: crypto.randomUUID(),
    reporterId: reporterId,
    reporterName: connectedUsers.get(reporterId).name,
    reportedUserId: reportedUserId,
    reportedUserName: message.reportedUserName,
    reason: message.reason || "Não especificado",
    details: message.details || "",
    timestamp: new Date().toISOString(),
    status: "pending", // pending, resolved, dismissed
  }

  reports.push(report)

  ws.send(
    JSON.stringify({
      type: "reportSubmitted",
      message: "Denúncia enviada com sucesso",
    }),
  )

  // Notificar administradores online
  notifyAdmins({
    type: "newReport",
    report: report,
  })

  // Salvar dados
  saveData()
}

function handleReaction(message) {
  const userId = message.userId
  const messageId = message.messageId
  const emoji = message.emoji

  if (!userId || !messageId || !emoji) return

  // Encontrar a mensagem em todas as conversas
  // Na implementação real, você precisaria de um armazenamento de mensagens
  // Aqui estamos apenas enviando a reação para todos os usuários

  // Atualizar as reações (simulado)
  const reactions = {
    [emoji]: [userId],
  }

  // Broadcast para todos os usuários
  for (const [otherUserId, userData] of connectedUsers.entries()) {
    if (userData.ws && !isUserBlocked(otherUserId, userId)) {
      userData.ws.send(
        JSON.stringify({
          type: "messageReaction",
          messageId: messageId,
          reactions: reactions,
        }),
      )
    }
  }
}

function handleDeleteMessage(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const messageId = message.messageId
  const deleteType = message.deleteType // "forMe" ou "forEveryone"

  if (deleteType === "forEveryone") {
    // Broadcast para todos os usuários
    for (const [otherUserId, userData] of connectedUsers.entries()) {
      if (userData.ws) {
        userData.ws.send(
          JSON.stringify({
            type: "messageDeleted",
            messageId: messageId,
            deleteType: deleteType,
          }),
        )
      }
    }
  } else {
    // Apenas para o usuário atual
    ws.send(
      JSON.stringify({
        type: "messageDeleted",
        messageId: messageId,
        deleteType: deleteType,
      }),
    )
  }
}

// Funções de administração
function handleAdminGetUsers(ws) {
  if (!isAdminWebSocket(ws)) return

  const users = Array.from(connectedUsers.values()).map((user) => {
    const { ws, password, ...userData } = user
    return {
      ...userData,
      isBanned: bannedUsers.has(userData.userId),
    }
  })

  ws.send(
    JSON.stringify({
      type: "adminUsersList",
      users: users,
    }),
  )
}

function handleAdminGetReports(ws) {
  if (!isAdminWebSocket(ws)) return

  ws.send(
    JSON.stringify({
      type: "adminReportsList",
      reports: reports,
    }),
  )
}

function handleAdminBanUser(ws, message) {
  if (!isAdminWebSocket(ws)) return

  const userId = message.userId
  if (!userId) return

  // Adicionar à lista de banidos
  bannedUsers.add(userId)

  // Desconectar o usuário se estiver online
  const userData = connectedUsers.get(userId)
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
      userId: userId,
    }),
  )

  // Notificar outros administradores
  notifyAdmins(
    {
      type: "adminUserBanned",
      userId: userId,
      userName: userData ? userData.name : "Usuário desconhecido",
    },
    ws,
  )

  // Salvar dados
  saveData()
}

function handleAdminUnbanUser(ws, message) {
  if (!isAdminWebSocket(ws)) return

  const userId = message.userId
  if (!userId) return

  // Remover da lista de banidos
  bannedUsers.delete(userId)

  ws.send(
    JSON.stringify({
      type: "adminActionSuccess",
      message: "Banimento removido com sucesso",
      action: "unban",
      userId: userId,
    }),
  )

  // Notificar outros administradores
  notifyAdmins(
    {
      type: "adminUserUnbanned",
      userId: userId,
    },
    ws,
  )

  // Salvar dados
  saveData()
}

function handleAdminDeleteUser(ws, message) {
  if (!isAdminWebSocket(ws)) return

  const userId = message.userId
  if (!userId) return

  // Remover usuário
  const userData = connectedUsers.get(userId)
  if (userData && userData.ws) {
    userData.ws.send(
      JSON.stringify({
        type: "accountDeleted",
        message: "Sua conta foi excluída por um administrador",
      }),
    )
    userData.ws.close()
  }

  connectedUsers.delete(userId)

  ws.send(
    JSON.stringify({
      type: "adminActionSuccess",
      message: "Usuário excluído com sucesso",
      action: "delete",
      userId: userId,
    }),
  )

  // Notificar outros administradores
  notifyAdmins(
    {
      type: "adminUserDeleted",
      userId: userId,
      userName: userData ? userData.name : "Usuário desconhecido",
    },
    ws,
  )

  // Salvar dados
  saveData()
}

function handleAdminEditUser(ws, message) {
  if (!isAdminWebSocket(ws)) return

  const userId = message.userId
  const updates = message.updates
  if (!userId || !updates) return

  const userData = connectedUsers.get(userId)
  if (!userData) {
    ws.send(
      JSON.stringify({
        type: "adminActionError",
        message: "Usuário não encontrado",
        action: "edit",
      }),
    )
    return
  }

  // Atualizar dados do usuário
  const updatedUserData = {
    ...userData,
    name: updates.name !== undefined ? updates.name : userData.name,
    email: updates.email !== undefined ? updates.email : userData.email,
    userNumber: updates.userNumber !== undefined ? updates.userNumber : userData.userNumber,
  }

  connectedUsers.set(userId, updatedUserData)

  // Notificar o usuário se estiver online
  if (updatedUserData.ws) {
    updatedUserData.ws.send(
      JSON.stringify({
        type: "profileUpdated",
        user: {
          userId: userId,
          name: updatedUserData.name,
          email: updatedUserData.email,
          avatar: updatedUserData.avatar,
          color: updatedUserData.color,
          profileImage: updatedUserData.profileImage,
          userNumber: updatedUserData.userNumber,
        },
      }),
    )
  }

  ws.send(
    JSON.stringify({
      type: "adminActionSuccess",
      message: "Usuário editado com sucesso",
      action: "edit",
      userId: userId,
      user: {
        userId: userId,
        name: updatedUserData.name,
        email: updatedUserData.email,
        userNumber: updatedUserData.userNumber,
      },
    }),
  )

  // Notificar outros administradores
  notifyAdmins(
    {
      type: "adminUserEdited",
      userId: userId,
      userName: updatedUserData.name,
    },
    ws,
  )

  // Salvar dados
  saveData()
}

function handleAdminResolveReport(ws, message) {
  if (!isAdminWebSocket(ws)) return

  const reportId = message.reportId
  const resolution = message.resolution // "resolved" ou "dismissed"
  if (!reportId || !resolution) return

  // Encontrar e atualizar o relatório
  const reportIndex = reports.findIndex((report) => report.id === reportId)
  if (reportIndex === -1) {
    ws.send(
      JSON.stringify({
        type: "adminActionError",
        message: "Denúncia não encontrada",
        action: "resolveReport",
      }),
    )
    return
  }

  reports[reportIndex].status = resolution
  reports[reportIndex].resolvedAt = new Date().toISOString()

  ws.send(
    JSON.stringify({
      type: "adminActionSuccess",
      message: "Denúncia resolvida com sucesso",
      action: "resolveReport",
      reportId: reportId,
    }),
  )

  // Notificar outros administradores
  notifyAdmins(
    {
      type: "adminReportResolved",
      reportId: reportId,
      resolution: resolution,
    },
    ws,
  )

  // Salvar dados
  saveData()
}

// Funções auxiliares
function sendUsersList(ws) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const users = Array.from(connectedUsers.values())
    .filter((user) => {
      // Não incluir usuários que bloquearam este usuário ou que este usuário bloqueou
      return !isUserBlocked(user.userId, userId) && !isUserBlocked(userId, user.userId)
    })
    .map((user) => {
      const { ws, password, blocked, ...userData } = user
      return userData
    })

  ws.send(
    JSON.stringify({
      type: "userList",
      users: users,
    }),
  )
}

function sendMessagesList(ws) {
  // Na implementação real, você enviaria mensagens do banco de dados
  // Aqui estamos apenas enviando uma lista vazia
  ws.send(
    JSON.stringify({
      type: "messageList",
      messages: [],
    }),
  )
}

function sendContactsList(ws, message) {
  const userId = getUserIdFromWebSocket(ws)
  if (!userId) return

  const userData = connectedUsers.get(userId)
  if (!userData) return

  ws.send(
    JSON.stringify({
      type: "contactsList",
      contacts: userData.contacts || [],
    }),
  )
}

function broadcastUserStatus(userId, isOnline) {
  const userData = connectedUsers.get(userId)
  if (!userData) return

  for (const [otherUserId, otherUserData] of connectedUsers.entries()) {
    // Não notificar usuários que bloquearam este usuário
    if (isUserBlocked(otherUserId, userId)) continue

    if (otherUserData.ws && otherUserId !== userId) {
      otherUserData.ws.send(
        JSON.stringify({
          type: "user_status_update",
          userId: userId,
          userName: userData.name,
          isOnline: isOnline,
          lastSeen: new Date().toISOString(),
        }),
      )
    }
  }
}

function broadcastUserUpdate(userId) {
  const userData = connectedUsers.get(userId)
  if (!userData) return

  for (const [otherUserId, otherUserData] of connectedUsers.entries()) {
    // Não notificar usuários que bloquearam este usuário
    if (isUserBlocked(otherUserId, userId)) continue

    if (otherUserData.ws && otherUserId !== userId) {
      otherUserData.ws.send(
        JSON.stringify({
          type: "user_updated",
          user: {
            userId: userId,
            name: userData.name,
            avatar: userData.avatar,
            color: userData.color,
            profileImage: userData.profileImage,
            isOnline: userData.isOnline,
            lastSeen: userData.lastSeen,
          },
        }),
      )
    }
  }
}

function notifyAdmins(message, excludeWs = null) {
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

function isUserBlocked(userId, blockedUserId) {
  const userData = connectedUsers.get(userId)
  return userData && userData.blocked && userData.blocked.includes(blockedUserId)
}

function generateUserId() {
  return "user_" + crypto.randomUUID()
}

function generateUniqueNumber() {
  // Gerar número único de 8 dígitos
  let number
  do {
    number = Math.floor(10000000 + Math.random() * 90000000).toString()
  } while (Array.from(connectedUsers.values()).some((user) => user.userNumber === number))
  return number
}

// Iniciar servidor
console.log(`Servidor WebSocket rodando na porta ${process.env.PORT || 8080}`)
