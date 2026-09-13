const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    seen: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const chatSchema = new mongoose.Schema(
  {
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      validate: {
        validator: (participants) => {
          return (
            participants.length === 2 &&
            String(participants[0]) !==
              String(participants[1])
          );
        },
        message:
          "A chat must contain exactly two different participants.",
      },
    },

    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

/* -------------------------------------------------------
   Index
------------------------------------------------------- */

chatSchema.index({
  participants: 1,
});

module.exports = mongoose.model("Chat", chatSchema);