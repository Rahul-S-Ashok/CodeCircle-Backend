const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/user");
const Project = require("../models/project");
const ConnectionRequest = require("../models/connectionRequest");

const { userAuth } = require("../middlewares/auth");
const { matchPercent, whyYouMatch } = require("../utils/matchScore");

const router = express.Router();

/* -------------------------------------------------------
   Fields safe to expose publicly
------------------------------------------------------- */

const PUBLIC_FIELDS = [
  "firstName",
  "lastName",
  "photoUrl",
  "age",
  "gender",
  "about",
  "skills",
  "skillLevels",
  "headline",
  "location",
  "githubUsername",
  "githubStats",
  "experienceYears",
  "openToCollaborate",
  "linkedinUrl",
  "twitterUrl",
  "profileComplete",
  "isPremium",
  "membershipType",
];

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

const safePublicUser = (user) => {
  const obj = user.toObject
    ? user.toObject()
    : { ...user };

  const safe = {};

  for (const field of PUBLIC_FIELDS) {
    if (obj[field] !== undefined) {
      safe[field] = obj[field];
    }
  }

  safe._id = obj._id;

  return safe;
};

const getMatchData = (viewer, other) => {
  return {
    matchScore: matchPercent(viewer, other),
    whyYouMatch: whyYouMatch(viewer, other),
  };
};

/* -------------------------------------------------------
   GET /user/feed
------------------------------------------------------- */

router.get("/feed", userAuth, async (req, res) => {
  try {
    const page = Math.max(
      Number.parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number.parseInt(req.query.limit, 10) || 20,
        1
      ),
      50
    );

    const skip = (page - 1) * limit;

    /* ---------------------------------------------
       Find users already interacted with
    --------------------------------------------- */

    const requests = await ConnectionRequest.find({
      $or: [
        { fromUserId: req.user._id },
        { toUserId: req.user._id },
      ],
    })
      .select("fromUserId toUserId")
      .lean();

    const excludedIds = new Set([
      String(req.user._id),
    ]);

    for (const request of requests) {
      excludedIds.add(String(request.fromUserId));
      excludedIds.add(String(request.toUserId));
    }

    const excludedObjectIds = Array.from(excludedIds)
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    /* ---------------------------------------------
       Fetch completed profiles
    --------------------------------------------- */

    const users = await User.find({
      _id: { $nin: excludedObjectIds },
      profileComplete: true,
    })
      .select(PUBLIC_FIELDS.join(" "))
      .lean();

    /* ---------------------------------------------
       Calculate match score
    --------------------------------------------- */

    const rankedUsers = users
      .map((other) => {
        const score = getMatchData(req.user, other);

        return {
          ...other,
          ...score,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore);

    const total = rankedUsers.length;

    const feed = rankedUsers.slice(
      skip,
      skip + limit
    );

    return res.status(200).json({
      data: feed,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + limit < total,
      },
    });
  } catch (err) {
    console.error("GET /user/feed error:", err);

    return res.status(500).json({
      message: "Unable to load developer feed.",
    });
  }
});

/* -------------------------------------------------------
   GET /user/connections
------------------------------------------------------- */

router.get("/connections", userAuth, async (req, res) => {
  try {
    const requests = await ConnectionRequest.find({
      $or: [
        {
          fromUserId: req.user._id,
          status: "accepted",
        },
        {
          toUserId: req.user._id,
          status: "accepted",
        },
      ],
    })
      .populate(
        "fromUserId",
        PUBLIC_FIELDS.join(" ")
      )
      .populate(
        "toUserId",
        PUBLIC_FIELDS.join(" ")
      )
      .lean();

    const connections = requests
      .map((request) => {
        const isFromCurrentUser =
          String(request.fromUserId?._id) ===
          String(req.user._id);

        const otherUser = isFromCurrentUser
          ? request.toUserId
          : request.fromUserId;

        if (!otherUser) return null;

        return {
          ...safePublicUser(otherUser),
          matchScore: matchPercent(
            req.user,
            otherUser
          ),
          whyYouMatch: whyYouMatch(
            req.user,
            otherUser
          ),
          connectedAt: request.updatedAt,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.connectedAt) -
          new Date(a.connectedAt)
      );

    return res.status(200).json({
      data: connections,
    });
  } catch (err) {
    console.error(
      "GET /user/connections error:",
      err
    );

    return res.status(500).json({
      message: "Unable to load your connections.",
    });
  }
});

/* -------------------------------------------------------
   GET /user/requests/received
------------------------------------------------------- */

router.get(
  "/requests/received",
  userAuth,
  async (req, res) => {
    try {
      const requests = await ConnectionRequest.find({
        toUserId: req.user._id,
        status: "interested",
      })
        .populate(
          "fromUserId",
          PUBLIC_FIELDS.join(" ")
        )
        .sort({ createdAt: -1 })
        .lean();

      const data = requests
        .filter((request) => request.fromUserId)
        .map((request) => ({
          ...safePublicUser(request.fromUserId),
          requestId: request._id,
          matchScore: matchPercent(
            req.user,
            request.fromUserId
          ),
          whyYouMatch: whyYouMatch(
            req.user,
            request.fromUserId
          ),
          createdAt: request.createdAt,
        }));

      return res.status(200).json({
        data,
      });
    } catch (err) {
      console.error(
        "GET /user/requests/received error:",
        err
      );

      return res.status(500).json({
        message: "Unable to load connection requests.",
      });
    }
  }
);

/* -------------------------------------------------------
   GET /user/:userId
------------------------------------------------------- */

router.get("/:userId", userAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        message: "Invalid user ID.",
      });
    }

    if (String(req.user._id) === String(userId)) {
      return res.status(400).json({
        message: "You cannot view yourself as another user.",
      });
    }

    const user = await User.findOne({
      _id: userId,
      profileComplete: true,
    })
      .select(PUBLIC_FIELDS.join(" "))
      .lean();

    if (!user) {
      return res.status(404).json({
        message: "Developer profile not found.",
      });
    }

    const projects = await Project.find({
      ownerId: user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    const matchData = getMatchData(
      req.user,
      user
    );

    return res.status(200).json({
      data: {
        ...safePublicUser(user),
        ...matchData,
        projects,
      },
    });
  } catch (err) {
    console.error(
      "GET /user/:userId error:",
      err
    );

    return res.status(500).json({
      message: "Unable to load developer profile.",
    });
  }
});

module.exports = router;