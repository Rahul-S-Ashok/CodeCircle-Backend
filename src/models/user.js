const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      minlength: 2,
      maxlength: 50,
      trim: true,
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      minlength: 2,
      maxlength: 50,
      trim: true,
    },

    emailId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (value) => validator.isEmail(value),
        message: "Please enter a valid email address",
      },
    },

    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      minlength: 6,
      select: false,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    /* ---------------------------------------------
       Profile
    --------------------------------------------- */

    age: {
      type: Number,
      min: 18,
      max: 100,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },

    photoUrl: {
      type: String,
      default:
        "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80",
      trim: true,
    },

    about: {
      type: String,
      maxlength: 1000,
      trim: true,
      default: "",
    },

    headline: {
      type: String,
      maxlength: 120,
      trim: true,
      default: "",
    },

    location: {
      type: String,
      maxlength: 100,
      trim: true,
      default: "",
    },

    skills: {
      type: [String],
      default: [],
      validate: {
        validator: (skills) => skills.length <= 30,
        message: "You can have a maximum of 30 skills",
      },
    },

    skillLevels: {
      type: Map,
      of: {
        type: String,
        enum: ["beginner", "intermediate", "advanced", "expert"],
      },
      default: {},
    },

    experienceYears: {
      type: Number,
      min: 0,
      max: 50,
      default: 0,
    },

    openToCollaborate: {
      type: Boolean,
      default: false,
    },

    profileComplete: {
      type: Boolean,
      default: false,
    },

    /* ---------------------------------------------
       Social / developer links
    --------------------------------------------- */

    githubUsername: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    githubStats: {
      contributions: {
        type: Number,
        default: 0,
      },

      repos: {
        type: Number,
        default: 0,
      },

      achievements: {
        type: Number,
        default: 0,
      },
    },

    linkedinUrl: {
      type: String,
      trim: true,
      default: "",
    },

    twitterUrl: {
      type: String,
      trim: true,
      default: "",
    },

    /* ---------------------------------------------
       Premium
    --------------------------------------------- */

    isPremium: {
      type: Boolean,
      default: false,
    },

    membershipType: {
      type: String,
      enum: ["", "silver", "gold"],
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

/* -------------------------------------------------------
   Indexes
------------------------------------------------------- */

userSchema.index({ firstName: 1 });
userSchema.index({ gender: 1 });
userSchema.index({ profileComplete: 1 });
userSchema.index({ skills: 1 });
userSchema.index({ location: 1 });

/* -------------------------------------------------------
   Password validation
------------------------------------------------------- */

userSchema.methods.validatePassword = async function (passwordInput) {
  if (!this.password) return false;

  return await bcrypt.compare(passwordInput, this.password);
};

/* -------------------------------------------------------
   JWT
------------------------------------------------------- */

userSchema.methods.getJWT = function () {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

module.exports = mongoose.model("User", userSchema);