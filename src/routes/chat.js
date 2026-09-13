const express = require("express");
const mongoose = require("mongoose");

const Chat = require("../models/chat");
const User = require("../models/user");
const ConnectionRequest = require("../models/connectionRequest");
const { userAuth } = require("../middlewares/auth");

const router = express.Router();

/* -------------------------------------------------------
   Helper: Check whether two users are connected
------------------------------------------------------- */

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

/* -------------------------------------------------------
   GET /chat/:targetUserId
------------------------------------------------------- */

router.get(
  "/chat/:targetUserId",
  userAuth,
  async (req, res) => {
    try {
      const { targetUserId } = req.params;

      /* ---------------------------------------------
         Validate ID
      --------------------------------------------- */

      if (!mongoose.isValidObjectId(targetUserId)) {
        return res.status(400).json({
          message: "Invalid developer ID.",
        });
      }

      /* ---------------------------------------------
         Prevent chatting with yourself
      --------------------------------------------- */

      if (
        String(req.user._id) ===
        String(targetUserId)
      ) {
        return res.status(400).json({
          message: "You cannot create a chat with yourself.",
        });
      }

      /* ---------------------------------------------
         Check target user exists
      --------------------------------------------- */

      const targetUser = await User.findById(
        targetUserId
      )
        .select("_id firstName lastName photoUrl headline")
        .lean();

      if (!targetUser) {
        return res.status(404).json({
          message: "Developer not found.",
        });
      }

      /* ---------------------------------------------
         Only accepted connections can chat
      --------------------------------------------- */

      const connected = await areConnected(
        req.user._id,
        targetUserId
      );

      if (!connected) {
        return res.status(403).json({
          message:
            "You can only message developers you're connected with.",
          code: "NOT_CONNECTED",
        });
      }

      /* ---------------------------------------------
         Find existing chat
      --------------------------------------------- */

      let chat = await Chat.findOne({
        participants: {
          $all: [
            req.user._id,
            new mongoose.Types.ObjectId(targetUserId),
          ],
        },
      }).populate(
        "messages.senderId",
        "_id firstName lastName photoUrl"
      );

      /* ---------------------------------------------
         Create chat if it doesn't exist
      --------------------------------------------- */

      if (!chat) {
        chat = await Chat.create({
          participants: [
            req.user._id,
            targetUserId,
          ],
          messages: [],
        });
      }

      return res.status(200).json({
        data: {
          _id: chat._id,
          participants: chat.participants,
          messages: chat.messages,
          targetUser,
        },
      });
    } catch (err) {
      console.error(
        "GET /chat/:targetUserId error:",
        err
      );

      return res.status(500).json({
        message: "Unable to load chat.",
      });
    }
  }
);

module.exports = router;