const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/user");
const ConnectionRequest = require("../models/connectionRequest");
const { userAuth } = require("../middlewares/auth");

const router = express.Router();

const FREE_DAILY_LIMIT = 20;
const SILVER_DAILY_LIMIT = 100;

/* -------------------------------------------------------
   POST /request/send/:status/:toUserId
------------------------------------------------------- */

router.post(
  "/send/:status/:toUserId",
  userAuth,
  async (req, res) => {
    try {
      const { status, toUserId } = req.params;

      /* ---------------------------------------------
         Validate status
      --------------------------------------------- */

      if (!["interested", "ignored"].includes(status)) {
        return res.status(400).json({
          message: "Invalid connection action.",
        });
      }

      /* ---------------------------------------------
         Validate user ID
      --------------------------------------------- */

      if (!mongoose.isValidObjectId(toUserId)) {
        return res.status(400).json({
          message: "Invalid developer ID.",
        });
      }

      if (
        String(req.user._id) ===
        String(toUserId)
      ) {
        return res.status(400).json({
          message: "You cannot connect with yourself.",
        });
      }

      /* ---------------------------------------------
         Check target user
      --------------------------------------------- */

      const targetUser = await User.findOne({
        _id: toUserId,
        profileComplete: true,
      });

      if (!targetUser) {
        return res.status(404).json({
          message: "Developer not found.",
        });
      }

      /* ---------------------------------------------
         Check daily limit

         Only "interested" counts as a connection
         attempt. Passing doesn't consume the limit.
      --------------------------------------------- */

      if (status === "interested") {
        let dailyLimit = FREE_DAILY_LIMIT;

        if (req.user.membershipType === "silver") {
          dailyLimit = SILVER_DAILY_LIMIT;
        }

        if (req.user.membershipType === "gold") {
          dailyLimit = Infinity;
        }

        if (dailyLimit !== Infinity) {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);

          const interestedToday =
            await ConnectionRequest.countDocuments({
              fromUserId: req.user._id,
              status: "interested",
              createdAt: {
                $gte: startOfDay,
              },
            });

          if (interestedToday >= dailyLimit) {
            return res.status(403).json({
              message:
                req.user.membershipType === "silver"
                  ? "You've reached your daily connection limit."
                  : "You've reached today's free connection limit.",
              code: "DAILY_LIMIT_REACHED",
              limit: dailyLimit,
            });
          }
        }
      }

      /* ---------------------------------------------
         Check existing relationship
      --------------------------------------------- */

      const existingRequest =
        await ConnectionRequest.findOne({
          $or: [
            {
              fromUserId: req.user._id,
              toUserId,
            },
            {
              fromUserId: toUserId,
              toUserId: req.user._id,
            },
          ],
        });

      if (existingRequest) {
        return res.status(409).json({
          message:
            existingRequest.status === "accepted"
              ? "You're already connected."
              : "You've already interacted with this developer.",
          code: "ALREADY_INTERACTED",
        });
      }

      /* ---------------------------------------------
         Create request
      --------------------------------------------- */

      const connectionRequest =
        await ConnectionRequest.create({
          fromUserId: req.user._id,
          toUserId,
          status,
        });

      return res.status(201).json({
        message:
          status === "interested"
            ? "Connection request sent."
            : "Developer passed.",
        data: connectionRequest,
      });
    } catch (err) {
      console.error(
        "POST /request/send error:",
        err
      );

      /*
        Handles a duplicate created because of
        simultaneous requests.
      */
      if (err.code === 11000) {
        return res.status(409).json({
          message:
            "You've already interacted with this developer.",
          code: "ALREADY_INTERACTED",
        });
      }

      return res.status(500).json({
        message: "Unable to process connection request.",
      });
    }
  }
);

/* -------------------------------------------------------
   POST /request/review/:status/:requestId
------------------------------------------------------- */

router.post(
  "/review/:status/:requestId",
  userAuth,
  async (req, res) => {
    try {
      const { status, requestId } = req.params;

      if (!["accepted", "rejected"].includes(status)) {
        return res.status(400).json({
          message: "Invalid review action.",
        });
      }

      if (!mongoose.isValidObjectId(requestId)) {
        return res.status(400).json({
          message: "Invalid request ID.",
        });
      }

      const request =
        await ConnectionRequest.findOne({
          _id: requestId,
          toUserId: req.user._id,
          status: "interested",
        });

      if (!request) {
        return res.status(404).json({
          message: "Connection request not found.",
        });
      }

      request.status = status;

      await request.save();

      return res.status(200).json({
        message:
          status === "accepted"
            ? "Connection accepted."
            : "Connection request rejected.",
        data: request,
      });
    } catch (err) {
      console.error(
        "POST /request/review error:",
        err
      );

      return res.status(500).json({
        message:
          "Unable to process connection request.",
      });
    }
  }
);

module.exports = router;