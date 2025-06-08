const WebSocket = require("ws")
const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

// Configurações
const PORT = process.env.PORT || 3000
const MASTER_PASSWORD = "sitedogorilão"

// Dados em memória (em produção, usar banco de dados)
let users = new Map()
let messages = []
const connectedClients = new Map()
let bannedUsers = new Set()
let reportedMessages = new Set()
let systemSettings = {
  maxMessageLength: 500,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowImages: true,
  allowReactions: true,
  registrationEnabled: true,
  autoModeration: false,
  bannedWords: [],
  maintenanceMode: false,
}

// Estatísticas do sistema
let systemStats = {
  serverStartTime: Date.now(),
  totalConnections: 0,
  messagesCount: 0,
}

// Criar servidor HTTP
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        status: "ok",
        uptime: Date.now() - systemStats.serverStartTime,
        users: users.size,
        messages: messages.length,
      }),
    )
    return
  }

  // API endpoints
  if (req.url === "/api/stats") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        totalUsers: users.size,
        onlineUsers: connectedClients.size,
        totalMessages: messages.length,
        bannedUsers: bannedUsers.size,
        reportedMessages: reportedMessages.size,
        uptime: Date.now() - systemStats.serverStartTime,
      }),
    )
    return
  }

  // Servir arquivos estáticos (se necessário)
  res.writeHead(404)
  res.end("Not Found")
})

// Criar servidor WebSocket
const wss = new WebSocket.Server({ server })

// Função para gerar ID único
function generateId() {
  return crypto.randomBytes(16).toString("hex")
}

// Função para validar senha master
function validateMasterPassword(password) {
  return password === MASTER_PASSWORD
}

// Função para broadcast para todos os clientes
function broadcast(data, excludeClient = null) {
  const message = JSON.stringify(data)
  connectedClients.forEach((clientData, client) => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

// Função para broadcast apenas para admins
function broadcastToAdmins(data) {
  const message = JSON.stringify(data)
  connectedClients.forEach((clientData, client) => {
    if (clientData.isAdmin && client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

// Função para salvar dados em JSON
function saveDataToJSON() {
  const data = {
    users: Array.from(users.entries()),
    messages: messages,
    bannedUsers: Array.from(bannedUsers),
    reportedMessages: Array.from(reportedMessages),
    systemSettings: systemSettings,
    systemStats: systemStats,
    lastSaved: new Date().toISOString(),
  }

  try {
    fs.writeFileSync("gorila-chat-data.json", JSON.stringify(data, null, 2))
    console.log("✅ Dados salvos em gorila-chat-data.json")
  } catch (error) {
    console.error("❌ Erro ao salvar dados:", error)
  }
}

// Função para carregar dados do JSON
function loadDataFromJSON() {
  try {
    if (fs.existsSync("gorila-chat-data.json")) {
      const data = JSON.parse(fs.readFileSync("gorila-chat-data.json", "utf8"))

      users = new Map(data.users || [])
      messages = data.messages || []
      bannedUsers = new Set(data.bannedUsers || [])
      reportedMessages = new Set(data.reportedMessages || [])
      systemSettings = { ...systemSettings, ...(data.systemSettings || {}) }
      systemStats = { ...systemStats, ...(data.systemStats || {}) }

      console.log("✅ Dados carregados do arquivo JSON")
      console.log(`📊 Usuários: ${users.size}, Mensagens: ${messages.length}`)
    }
  } catch (error) {
    console.error("❌ Erro ao carregar dados:", error)
  }
}

// Função para verificar palavras banidas
function containsBannedWords(text) {
  if (!systemSettings.autoModeration || !systemSettings.bannedWords.length) {
    return false
  }

  const lowerText = text.toLowerCase()
  return systemSettings.bannedWords.some((word) => lowerText.includes(word.toLowerCase()))
}

// Função para limpar usuários offline
function cleanupOfflineUsers() {
  const onlineUserIds = new Set()
  connectedClients.forEach((clientData) => {
    if (clientData.user) {
      onlineUserIds.add(clientData.user.id)
    }
  })

  users.forEach((user, userId) => {
    if (!onlineUserIds.has(userId)) {
      user.online = false
      user.lastSeen = new Date().toISOString()
    }
  })
}

// Conexão WebSocket
wss.on("connection", (ws, req) => {
  console.log("🔌 Nova conexão WebSocket")
  systemStats.totalConnections++

  // Dados do cliente
  const clientData = {
    id: generateId(),
    ip: req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
    connectedAt: new Date().toISOString(),
    isAuthenticated: false,
    isAdmin: false,
    user: null,
  }

  connectedClients.set(ws, clientData)

  // Enviar status de conexão
  ws.send(
    JSON.stringify({
      type: "connected",
      clientId: clientData.id,
    }),
  )

  // Manipular mensagens
  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data)

      // Autenticação master password
      if (message.type === "auth") {
        if (validateMasterPassword(message.masterPassword)) {
          clientData.isAuthenticated = true
          ws.send(
            JSON.stringify({
              type: "authSuccess",
              message: "Autenticado com sucesso",
            }),
          )
        } else {
          ws.send(
            JSON.stringify({
              type: "authError",
              message: "Senha master incorreta",
            }),
          )
        }
        return
      }

      // Verificar autenticação
      if (!clientData.isAuthenticated) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Não autenticado",
          }),
        )
        return
      }

      // Autenticação admin
      if (message.type === "adminAuth") {
        if (validateMasterPassword(message.masterPassword)) {
          clientData.isAdmin = true
          ws.send(
            JSON.stringify({
              type: "adminAuthSuccess",
              message: "Admin autenticado",
            }),
          )
        } else {
          ws.send(
            JSON.stringify({
              type: "adminAuthError",
              message: "Senha admin incorreta",
            }),
          )
        }
        return
      }

      // Verificar modo manutenção
      if (systemSettings.maintenanceMode && !clientData.isAdmin) {
        ws.send(
          JSON.stringify({
            type: "maintenanceMode",
            message: "Sistema em manutenção",
          }),
        )
        return
      }

      // Login
      if (message.type === "login") {
        const { name, email } = message

        if (!name || !email) {
          ws.send(
            JSON.stringify({
              type: "loginError",
              message: "Nome e email são obrigatórios",
            }),
          )
          return
        }

        // Verificar se usuário existe
        const user = Array.from(users.values()).find((u) => u.email === email)

        if (!user) {
          ws.send(
            JSON.stringify({
              type: "loginError",
              message: "Usuário não encontrado. Faça seu cadastro primeiro.",
            }),
          )
          return
        }

        // Verificar se está banido
        if (bannedUsers.has(user.id)) {
          ws.send(
            JSON.stringify({
              type: "loginError",
              message: "Usuário banido do sistema",
            }),
          )
          return
        }

        // Atualizar status online
        user.online = true
        user.lastSeen = new Date().toISOString()
        clientData.user = user

        ws.send(
          JSON.stringify({
            type: "loginSuccess",
            user: user,
          }),
        )

        // Broadcast lista de usuários atualizada
        broadcastUserList()

        console.log(`✅ Login: ${user.name} (${user.email})`)
        return
      }

      // Registro
      if (message.type === "register") {
        if (!systemSettings.registrationEnabled) {
          ws.send(
            JSON.stringify({
              type: "registerError",
              message: "Cadastros estão desabilitados",
            }),
          )
          return
        }

        const { name, email, password, avatar, color, profileImage } = message

        if (!name || !email || !password) {
          ws.send(
            JSON.stringify({
              type: "registerError",
              message: "Todos os campos são obrigatórios",
            }),
          )
          return
        }

        // Verificar se email já existe
        const existingUser = Array.from(users.values()).find((u) => u.email === email)
        if (existingUser) {
          ws.send(
            JSON.stringify({
              type: "registerError",
              message: "Este email já está cadastrado",
            }),
          )
          return
        }

        // Verificar se nome já existe
        const existingName = Array.from(users.values()).find((u) => u.name === name)
        if (existingName) {
          ws.send(
            JSON.stringify({
              type: "registerError",
              message: "Este nome já está em uso",
            }),
          )
          return
        }

        // Criar novo usuário
        const userId = generateId()
        const newUser = {
          id: userId,
          name: name,
          email: email,
          password: password, // Em produção, usar hash
          avatar: avatar || "👤",
          color: color || "#3a86ff",
          profileImage: profileImage || null,
          online: true,
          joinDate: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          banned: false,
        }

        users.set(userId, newUser)
        clientData.user = newUser

        ws.send(
          JSON.stringify({
            type: "registerSuccess",
            user: newUser,
          }),
        )

        // Broadcast lista de usuários atualizada
        broadcastUserList()

        console.log(`✅ Registro: ${newUser.name} (${newUser.email})`)
        saveDataToJSON()
        return
      }

      // Verificar se usuário está logado para outras operações
      if (!clientData.user && !clientData.isAdmin) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Usuário não logado",
          }),
        )
        return
      }

      // Obter lista de usuários
      if (message.type === "getUsers") {
        const userList = Array.from(users.values())
          .filter((user) => !bannedUsers.has(user.id))
          .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            color: user.color,
            profileImage: user.profileImage,
            online: user.online,
          }))

        ws.send(
          JSON.stringify({
            type: "userList",
            users: userList,
          }),
        )
        return
      }

      // Obter mensagens
      if (message.type === "getMessages") {
        const messageList = messages.slice(-50) // Últimas 50 mensagens
        ws.send(
          JSON.stringify({
            type: "messageList",
            messages: messageList,
          }),
        )
        return
      }

      // Enviar mensagem
      if (message.type === "message") {
        const user = clientData.user
        if (!user) return

        const { content, messageType, replyTo } = message

        if (!content) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Conteúdo da mensagem é obrigatório",
            }),
          )
          return
        }

        // Verificar tamanho da mensagem
        if (content.length > systemSettings.maxMessageLength) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: `Mensagem muito longa. Máximo ${systemSettings.maxMessageLength} caracteres.`,
            }),
          )
          return
        }

        // Verificar palavras banidas
        if (messageType === "text" && containsBannedWords(content)) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Mensagem contém palavras não permitidas",
            }),
          )
          return
        }

        // Verificar se imagens estão permitidas
        if (messageType === "image" && !systemSettings.allowImages) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Envio de imagens está desabilitado",
            }),
          )
          return
        }

        const newMessage = {
          id: generateId(),
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userAvatar: user.avatar,
          userColor: user.color,
          userProfileImage: user.profileImage,
          content: content,
          type: messageType || "text",
          timestamp: new Date().toISOString(),
          replyTo: replyTo || null,
          reactions: {},
          reported: false,
        }

        messages.push(newMessage)
        systemStats.messagesCount++

        // Broadcast mensagem para todos
        broadcast({
          type: "newMessage",
          message: newMessage,
        })

        console.log(`💬 Mensagem de ${user.name}: ${messageType === "image" ? "[IMAGEM]" : content.substring(0, 50)}`)
        saveDataToJSON()
        return
      }

      // Reação a mensagem
      if (message.type === "reaction") {
        const user = clientData.user
        if (!user) return

        if (!systemSettings.allowReactions) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Reações estão desabilitadas",
            }),
          )
          return
        }

        const { messageId, emoji } = message
        const messageIndex = messages.findIndex((m) => m.id === messageId)

        if (messageIndex === -1) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Mensagem não encontrada",
            }),
          )
          return
        }

        const targetMessage = messages[messageIndex]

        if (!targetMessage.reactions) {
          targetMessage.reactions = {}
        }

        if (!targetMessage.reactions[emoji]) {
          targetMessage.reactions[emoji] = []
        }

        const userIndex = targetMessage.reactions[emoji].indexOf(user.id)

        if (userIndex === -1) {
          // Adicionar reação
          targetMessage.reactions[emoji].push(user.id)
        } else {
          // Remover reação
          targetMessage.reactions[emoji].splice(userIndex, 1)

          // Remover emoji se não há mais reações
          if (targetMessage.reactions[emoji].length === 0) {
            delete targetMessage.reactions[emoji]
          }
        }

        // Broadcast reação atualizada
        broadcast({
          type: "messageReaction",
          messageId: messageId,
          reactions: targetMessage.reactions,
        })

        saveDataToJSON()
        return
      }

      // Deletar mensagem
      if (message.type === "deleteMessage") {
        const user = clientData.user
        const { messageId, deleteType } = message

        const messageIndex = messages.findIndex((m) => m.id === messageId)
        if (messageIndex === -1) return

        const targetMessage = messages[messageIndex]

        // Verificar se é o autor da mensagem ou admin
        if (targetMessage.userId !== user.id && !clientData.isAdmin) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Sem permissão para deletar esta mensagem",
            }),
          )
          return
        }

        if (deleteType === "forEveryone") {
          messages.splice(messageIndex, 1)
          broadcast({
            type: "messageDeleted",
            messageId: messageId,
            deleteType: "forEveryone",
          })
        } else {
          // Para deleteType 'forMe', apenas enviar confirmação
          ws.send(
            JSON.stringify({
              type: "messageDeleted",
              messageId: messageId,
              deleteType: "forMe",
            }),
          )
        }

        saveDataToJSON()
        return
      }

      // Atualizar perfil
      if (message.type === "updateProfile") {
        const user = clientData.user
        const updatedUser = message.user

        if (user.id !== updatedUser.id) return

        // Verificar se nome já existe (exceto o próprio usuário)
        const existingName = Array.from(users.values()).find((u) => u.name === updatedUser.name && u.id !== user.id)

        if (existingName) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Este nome já está em uso",
            }),
          )
          return
        }

        // Atualizar dados do usuário
        const userToUpdate = users.get(user.id)
        userToUpdate.name = updatedUser.name
        userToUpdate.avatar = updatedUser.avatar
        userToUpdate.color = updatedUser.color
        userToUpdate.profileImage = updatedUser.profileImage

        clientData.user = userToUpdate

        // Broadcast lista de usuários atualizada
        broadcastUserList()

        console.log(`✏️ Perfil atualizado: ${userToUpdate.name}`)
        saveDataToJSON()
        return
      }

      // Denunciar usuário
      if (message.type === "reportUser") {
        const { reportedUserId, reportedUserName } = message

        console.log(`🚩 Usuário ${reportedUserName} foi denunciado por ${clientData.user.name}`)

        // Notificar admins
        broadcastToAdmins({
          type: "userReported",
          reportedUserId: reportedUserId,
          reportedUserName: reportedUserName,
          reportedBy: clientData.user.name,
          timestamp: new Date().toISOString(),
        })

        return
      }

      // ===== COMANDOS ADMIN =====
      if (clientData.isAdmin) {
        // Banir usuário
        if (message.type === "banUser") {
          const { userId } = message
          const user = users.get(userId)

          if (user) {
            bannedUsers.add(userId)
            user.banned = true
            user.online = false

            // Desconectar usuário banido
            connectedClients.forEach((clientData, client) => {
              if (clientData.user && clientData.user.id === userId) {
                client.send(
                  JSON.stringify({
                    type: "banned",
                    message: "Você foi banido do sistema",
                  }),
                )
                client.close()
              }
            })

            broadcast({
              type: "userBanned",
              userId: userId,
            })

            console.log(`🚫 Usuário banido: ${user.name}`)
            saveDataToJSON()
          }
          return
        }

        // Desbanir usuário
        if (message.type === "unbanUser") {
          const { userId } = message
          const user = users.get(userId)

          if (user) {
            bannedUsers.delete(userId)
            user.banned = false

            broadcast({
              type: "userUnbanned",
              userId: userId,
            })

            console.log(`✅ Usuário desbanido: ${user.name}`)
            saveDataToJSON()
          }
          return
        }

        // Deletar usuário
        if (message.type === "deleteUser") {
          const { userId } = message
          const user = users.get(userId)

          if (user) {
            // Remover todas as mensagens do usuário
            messages = messages.filter((m) => m.userId !== userId)

            // Remover usuário
            users.delete(userId)
            bannedUsers.delete(userId)

            // Desconectar usuário
            connectedClients.forEach((clientData, client) => {
              if (clientData.user && clientData.user.id === userId) {
                client.send(
                  JSON.stringify({
                    type: "accountDeleted",
                    message: "Sua conta foi deletada",
                  }),
                )
                client.close()
              }
            })

            broadcastUserList()

            console.log(`🗑️ Usuário deletado: ${user.name}`)
            saveDataToJSON()
          }
          return
        }

        // Limpar todas as mensagens
        if (message.type === "clearAllMessages") {
          messages = []

          broadcast({
            type: "allMessagesCleared",
          })

          console.log("🗑️ Todas as mensagens foram deletadas")
          saveDataToJSON()
          return
        }

        // Atualizar configurações
        if (message.type === "updateSettings") {
          const { settings } = message
          systemSettings = { ...systemSettings, ...settings }

          // Processar palavras banidas
          if (settings.bannedWords) {
            systemSettings.bannedWords = settings.bannedWords
              .split(",")
              .map((word) => word.trim())
              .filter((word) => word.length > 0)
          }

          console.log("⚙️ Configurações atualizadas")
          saveDataToJSON()
          return
        }

        // Reiniciar servidor
        if (message.type === "restartServer") {
          console.log("🔄 Reiniciando servidor...")
          saveDataToJSON()

          broadcast({
            type: "serverRestarting",
            message: "Servidor reiniciando em 5 segundos...",
          })

          setTimeout(() => {
            process.exit(0)
          }, 5000)
          return
        }

        // Obter estatísticas do sistema
        if (message.type === "getSystemStats") {
          ws.send(
            JSON.stringify({
              type: "systemStats",
              stats: {
                uptime: Date.now() - systemStats.serverStartTime,
                totalUsers: users.size,
                onlineUsers: connectedClients.size,
                totalMessages: messages.length,
                bannedUsers: bannedUsers.size,
                connections: systemStats.totalConnections,
                memory: process.memoryUsage(),
                lastRestart: new Date(systemStats.serverStartTime).toISOString(),
              },
            }),
          )
          return
        }
      }
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

  // Desconexão
  ws.on("close", () => {
    console.log("🔌 Cliente desconectado")

    const clientData = connectedClients.get(ws)
    if (clientData && clientData.user) {
      const user = users.get(clientData.user.id)
      if (user) {
        user.online = false
        user.lastSeen = new Date().toISOString()
      }

      // Broadcast lista de usuários atualizada
      setTimeout(() => {
        broadcastUserList()
      }, 1000)
    }

    connectedClients.delete(ws)
  })

  // Erro na conexão
  ws.on("error", (error) => {
    console.error("❌ Erro WebSocket:", error)
    connectedClients.delete(ws)
  })
})

// Função para broadcast da lista de usuários
function broadcastUserList() {
  cleanupOfflineUsers()

  const userList = Array.from(users.values())
    .filter((user) => !bannedUsers.has(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      color: user.color,
      profileImage: user.profileImage,
      online: user.online,
    }))

  broadcast({
    type: "userList",
    users: userList,
  })

  // Enviar lista completa para admins
  const adminUserList = Array.from(users.values()).map((user) => ({
    ...user,
    banned: bannedUsers.has(user.id),
  }))

  broadcastToAdmins({
    type: "adminUserList",
    users: adminUserList,
  })
}

// Salvar dados periodicamente
setInterval(
  () => {
    saveDataToJSON()
  },
  5 * 60 * 1000,
) // A cada 5 minutos

// Limpar usuários offline periodicamente
setInterval(() => {
  cleanupOfflineUsers()
  broadcastUserList()
}, 30 * 1000) // A cada 30 segundos

// Manipular encerramento do processo
process.on("SIGINT", () => {
  console.log("\n🛑 Encerrando servidor...")
  saveDataToJSON()
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.log("\n🛑 Encerrando servidor...")
  saveDataToJSON()
  process.exit(0)
})

// Carregar dados ao iniciar
loadDataFromJSON()

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  console.log(`🌐 WebSocket disponível em ws://localhost:${PORT}`)
  console.log(`📊 Usuários carregados: ${users.size}`)
  console.log(`💬 Mensagens carregadas: ${messages.length}`)
  console.log(`🔐 Senha master: ${MASTER_PASSWORD}`)
})

// Exportar para uso em outros módulos (se necessário)
module.exports = {
  server,
  wss,
  users,
  messages,
  systemSettings,
}
