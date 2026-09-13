const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    // Project creator = Admin
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    tags: {
      type: [String],
      default: [],
    },

    lookingFor: {
      type: [String],
      default: [],
    },

    // Developers added by the project owner
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Project", projectSchema);