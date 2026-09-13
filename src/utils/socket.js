const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const Chat = require("../models/chat");
const ConnectionRequest = require("../models/connectionRequest");

const Project = require("../models/project");
const ProjectMessage = require("../models/projectMessage");

/* -------------------------------------------------------
   Runtime state
------------------------------------------------------- */

const onlineUsers = new Map();
// userId -> Set(socketId)

const socketUsers = new Map();
// socketId -> userId

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

const addOnlineUser = (userId, socketId) => {
  const key = String(userId);

  if (!onlineUsers.has(key)) {
    onlineUsers.set(key, new Set());
  }

  onlineUsers.get(key).add(socketId);
};

const removeOnlineUser = (userId, socketId) => {
  const key = String(userId);

  const sockets = onlineUsers.get(key);

  if (!sockets) return;

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(key);
  }
};

const getSocketsForUser = (userId) => {
  return [...(onlineUsers.get(String(userId)) || [])];
};

const emitToUser = (io, userId, event, payload) => {
  const sockets = getSocketsForUser(userId);

  for (const socketId of sockets) {
    io.to(socketId).emit(event, payload);
  }
};

const areConnected = async (userA, userB) => {
  const connection = await ConnectionRequest.exists({
    status: "accepted",

    $or: [
      {
        fromUserId: userA,
        toUserId: userB,
      },
      {
        fromUserId: userB,
        toUserId: userA,
      },
    ],
  });

  return Boolean(connection);
};

const isValidMessage = (text) => {
  return (
    typeof text === "string" &&
    text.trim().length > 0 &&
    text.trim().length <= 2000
  );
};

/* -------------------------------------------------------
   PROJECT ACCESS CHECK
------------------------------------------------------- */

const canAccessProject = (project, userId) => {
  const id = String(userId);

  const isOwner =
    String(project.ownerId) === id;

  const isMember = project.members.some(
    (memberId) =>
      String(memberId) === id
  );

  return isOwner || isMember;
};

/* -------------------------------------------------------
   Socket Authentication
------------------------------------------------------- */

const authenticateSocket = async (socket, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      return next(
        new Error(
          "Server authentication is not configured."
        )
      );
    }

    const cookieHeader =
      socket.handshake.headers?.cookie || "";

    const cookies = {};

    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .forEach((cookie) => {
        const separator =
          cookie.indexOf("=");

        if (separator === -1) return;

        const key =
          cookie.slice(0, separator);

        const value =
          cookie.slice(separator + 1);

        cookies[key] =
          decodeURIComponent(value);
      });

    const token = cookies.token;

    if (!token) {
      return next(
        new Error(
          "Authentication required."
        )
      );
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (!decoded?._id) {
      return next(
        new Error(
          "Invalid authentication token."
        )
      );
    }

    const user =
      await User.findById(decoded._id)
        .select(
          "_id firstName lastName photoUrl"
        )
        .lean();

    if (!user) {
      return next(
        new Error(
          "User account not found."
        )
      );
    }

    socket.user = user;

    next();
  } catch (err) {
    console.error(
      "Socket authentication error:",
      err
    );

    next(
      new Error(
        "Authentication failed."
      )
    );
  }
};

/* -------------------------------------------------------
   Initialize Socket.IO
------------------------------------------------------- */

const initSocket = (server) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },

    path: "/socket.io",
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const userId =
      String(socket.user._id);

    socketUsers.set(
      socket.id,
      userId
    );

    addOnlineUser(
      userId,
      socket.id
    );

    console.log(
      `🔌 Socket connected: ${socket.user.firstName} (${socket.id})`
    );

    /* ===================================================
       PERSONAL CHAT
    =================================================== */

    socket.on(
      "joinChat",
      async ({ targetUserId }) => {
        try {
          if (!targetUserId) return;

          const targetId =
            String(targetUserId);

          const connected =
            await areConnected(
              userId,
              targetId
            );

          if (!connected) {
            socket.emit(
              "chat:error",
              {
                message:
                  "You can only chat with your connections.",
              }
            );

            return;
          }

          const room = [
            userId,
            targetId,
          ]
            .sort()
            .join("_");

          socket.join(room);

          console.log(
            `💬 ${socket.user.firstName} joined chat ${room}`
          );
        } catch (err) {
          console.error(
            "joinChat error:",
            err
          );
        }
      }
    );

    /* ---------------------------------------------------
       SEND PERSONAL MESSAGE
    --------------------------------------------------- */

    socket.on(
      "sendMessage",
      async ({ targetUserId, text }) => {
        try {
          if (!targetUserId) return;

          const targetId =
            String(targetUserId);

          if (!isValidMessage(text)) {
            socket.emit(
              "chat:error",
              {
                message:
                  "Message must contain between 1 and 2000 characters.",
              }
            );

            return;
          }

          const connected =
            await areConnected(
              userId,
              targetId
            );

          if (!connected) {
            socket.emit(
              "chat:error",
              {
                message:
                  "You can only message your connections.",
              }
            );

            return;
          }

          const room = [
            userId,
            targetId,
          ]
            .sort()
            .join("_");

          socket.join(room);

          let chat =
            await Chat.findOne({
              participants: {
                $all: [
                  userId,
                  targetId,
                ],
              },
            });

          if (!chat) {
            chat =
              await Chat.create({
                participants: [
                  userId,
                  targetId,
                ],

                messages: [],
              });
          }

          chat.messages.push({
            senderId:
              socket.user._id,

            text:
              text.trim(),

            seen: false,
          });

          await chat.save();

          const savedMessage =
            chat.messages[
              chat.messages.length - 1
            ];

          const messagePayload = {
            _id:
              savedMessage._id,

            senderId: {
              _id:
                socket.user._id,

              firstName:
                socket.user.firstName,

              lastName:
                socket.user.lastName,

              photoUrl:
                socket.user.photoUrl,
            },

            receiverId:
              targetId,

            text:
              savedMessage.text,

            seen:
              savedMessage.seen,

            createdAt:
              savedMessage.createdAt,
          };

          io.to(room).emit(
            "messageReceived",
            messagePayload
          );

          emitToUser(
            io,
            targetId,
            "messageReceived",
            messagePayload
          );
        } catch (err) {
          console.error(
            "sendMessage error:",
            err
          );

          socket.emit(
            "chat:error",
            {
              message:
                "Unable to send message.",
            }
          );
        }
      }
    );

    /* ===================================================
       PROJECT ROOM
    =================================================== */

    /* ---------------------------------------------------
       JOIN PROJECT ROOM
    --------------------------------------------------- */

    socket.on(
      "joinProject",
      async ({ projectId }) => {
        try {
          if (!projectId) return;

          const project =
            await Project.findById(
              projectId
            );

          if (!project) {
            socket.emit(
              "project:error",
              {
                message:
                  "Project not found.",
              }
            );

            return;
          }

          const allowed =
            canAccessProject(
              project,
              userId
            );

          if (!allowed) {
            socket.emit(
              "project:error",
              {
                message:
                  "You are not a member of this project.",
              }
            );

            return;
          }

          const room =
            `project_${projectId}`;

          socket.join(room);

          console.log(
            `📁 ${socket.user.firstName} joined project room ${room}`
          );
        } catch (err) {
          console.error(
            "joinProject error:",
            err
          );

          socket.emit(
            "project:error",
            {
              message:
                "Unable to join project room.",
            }
          );
        }
      }
    );

    /* ---------------------------------------------------
       SEND PROJECT MESSAGE
    --------------------------------------------------- */

    socket.on(
      "sendProjectMessage",
      async ({ projectId, text }) => {
        try {
          if (!projectId) return;

          if (!isValidMessage(text)) {
            socket.emit(
              "project:error",
              {
                message:
                  "Message must contain between 1 and 2000 characters.",
              }
            );

            return;
          }

          const project =
            await Project.findById(
              projectId
            );

          if (!project) {
            socket.emit(
              "project:error",
              {
                message:
                  "Project not found.",
              }
            );

            return;
          }

          const allowed =
            canAccessProject(
              project,
              userId
            );

          if (!allowed) {
            socket.emit(
              "project:error",
              {
                message:
                  "You are not a member of this project.",
              }
            );

            return;
          }

          const message =
            await ProjectMessage.create({
              projectId:
                project._id,

              senderId:
                socket.user._id,

              text:
                text.trim(),
            });

          const populatedMessage =
            await ProjectMessage.findById(
              message._id
            )
              .populate(
                "senderId",
                "firstName lastName photoUrl"
              )
              .lean();

          const room =
            `project_${projectId}`;

          /*
            Ensure sender is in room
          */

          socket.join(room);

          /*
            Send message to everyone
            in the project room
          */

          io.to(room).emit(
            "projectMessageReceived",
            populatedMessage
          );

          console.log(
            `📨 Project message sent in ${room}`
          );
        } catch (err) {
          console.error(
            "sendProjectMessage error:",
            err
          );

          socket.emit(
            "project:error",
            {
              message:
                "Unable to send project message.",
            }
          );
        }
      }
    );

    /* ===================================================
       DISCONNECT
    =================================================== */

    socket.on(
      "disconnect",
      () => {
        removeOnlineUser(
          userId,
          socket.id
        );

        socketUsers.delete(
          socket.id
        );

        console.log(
          `🔌 Socket disconnected: ${socket.id}`
        );
      }
    );
  });

  return io;
};

module.exports = initSocket;