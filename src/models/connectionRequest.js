const mongoose = require("mongoose");

const connectionRequestSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "interested",
        "ignored",
        "accepted",
        "rejected",
      ],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

/* -------------------------------------------------------
   Prevent self requests
------------------------------------------------------- */

connectionRequestSchema.pre("validate", function (next) {
  if (
    this.fromUserId &&
    this.toUserId &&
    this.fromUserId.equals(this.toUserId)
  ) {
    return next(
      new Error("You cannot send a connection request to yourself.")
    );
  }

  next();
});

/* -------------------------------------------------------
   Indexes
------------------------------------------------------- */

// Used frequently when checking both directions.
connectionRequestSchema.index({
  fromUserId: 1,
  toUserId: 1,
});

// Used for received requests.
connectionRequestSchema.index({
  toUserId: 1,
  status: 1,
  createdAt: -1,
});

// Used for sent requests.
connectionRequestSchema.index({
  fromUserId: 1,
  status: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "ConnectionRequest",
  connectionRequestSchema
);