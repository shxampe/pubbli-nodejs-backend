import { Server } from "socket.io";
import { logger } from "./logger.js";

let io;
const onlineUsers = new Map();

const initialize = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "https://pubbli-frontend-git-staging-octalooptechnologies-projects.vercel.app",
        "https://pubbli-advertiser-git-frontend-octalooptechnologies-projects.vercel.app",
        "https://pubbli-influencer-git-development-octalooptechnologies-projects.vercel.app",
        "https://pubbli-admin-git-development-octalooptechnologies-projects.vercel.app",
        "https://admin.pubbli.com",
        "https://creator.pubbli.com",
        "https://brand.pubbli.com",
        "https://pubbli-advertiser-git-development-pubblis-projects.vercel.app/",
        "https://pubbli-influencer-git-development-pubblis-projects.vercel.app/"
      ],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on("register", (userId) => {
      onlineUsers.set(userId, socket.id);
    });

    socket.on("disconnect", () => {
      // Remove user from online users
      for (const [userId, id] of onlineUsers.entries()) {
        if (id === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
    });
  });
};

// src/utils/socketService.js
const emitToUser = (userId, event, data) => {
  const socketId = onlineUsers.get(userId);

  if (socketId && io) {
    io.to(socketId).emit(event, data);
  } else {
    logger.error(`❌ User not online or socket not found for user: ${userId}`);
  }
};

const sendToUser = (userId, event, data) => {
  const socketId = onlineUsers.get(userId);

  if (socketId && io) {
    io.to(socketId).emit(event, data);
  } else {
    logger.error(`❌ User not online or socket not found for user: ${userId}`);
  }
};

export default {
  initialize,
  emitToUser,
  sendToUser,
};