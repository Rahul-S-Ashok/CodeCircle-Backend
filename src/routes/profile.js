const express = require("express");
const validator = require("validator");

const { userAuth } = require("../middlewares/auth");
const User = require("../models/user");

const router = express.Router();

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "photoUrl",
  "about",
  "gender",
  "age",
  "skills",
  "skillLevels",
  "headline",
  "location",
  "experienceYears",
  "openToCollaborate",
  "linkedinUrl",
  "twitterUrl",
  "githubUsername",
];

const isProfileComplete = (user) => {
  const hasName =
    typeof user.firstName === "string" &&
    user.firstName.trim().length >= 2;

  const hasHeadline =
    typeof user.headline === "string" &&
    user.headline.trim().length >= 2;

  const hasAbout =
    typeof user.about === "string" &&
    user.about.trim().length >= 10 &&
    user.about.trim() !== "Hey there! I am using DevTinder";

  const hasSkills =
    Array.isArray(user.skills) &&
    user.skills.length > 0;

  return Boolean(
    hasName &&
      hasHeadline &&
      hasAbout &&
      hasSkills
  );
};

const safeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };

  delete obj.password;

  return obj;
};

/* -------------------------------------------------------
   GET /profile/view
   Get logged-in user's profile
------------------------------------------------------- */

router.get("/view", userAuth, async (req, res) => {
  try {
    return res.status(200).json({
      data: safeUser(req.user),
    });
  } catch (err) {
    console.error("GET /profile/view error:", err);

    return res.status(500).json({
      message: "Unable to fetch profile",
    });
  }
});

/* -------------------------------------------------------
   PATCH /profile/edit
   Update logged-in user's profile
------------------------------------------------------- */

router.patch("/edit", userAuth, async (req, res) => {
  try {
    const body = req.body || {};

    /* ---------------------------------------------
       Reject unknown / protected fields
    --------------------------------------------- */

    const invalidFields = Object.keys(body).filter(
      (field) => !PROFILE_FIELDS.includes(field)
    );

    if (invalidFields.length > 0) {
      return res.status(400).json({
        message: `Invalid profile fields: ${invalidFields.join(", ")}`,
      });
    }

    /* ---------------------------------------------
       Build update object safely
    --------------------------------------------- */

    const update = {};

    for (const field of PROFILE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        update[field] = body[field];
      }
    }

    /* ---------------------------------------------
       Name validation
    --------------------------------------------- */

    if (update.firstName !== undefined) {
      if (
        typeof update.firstName !== "string" ||
        update.firstName.trim().length < 2
      ) {
        return res.status(400).json({
          message: "First name must contain at least 2 characters.",
        });
      }

      update.firstName = update.firstName.trim();
    }

    if (update.lastName !== undefined) {
      if (typeof update.lastName !== "string") {
        return res.status(400).json({
          message: "Last name is invalid.",
        });
      }

      update.lastName = update.lastName.trim();
    }

    /* ---------------------------------------------
       Age validation
    --------------------------------------------- */

    if (update.age !== undefined) {
      if (update.age === "" || update.age === null) {
        update.age = undefined;
      } else {
        const age = Number(update.age);

        if (!Number.isInteger(age) || age < 18 || age > 100) {
          return res.status(400).json({
            message: "Age must be a whole number between 18 and 100.",
          });
        }

        update.age = age;
      }
    }

    /* ---------------------------------------------
       Gender validation
    --------------------------------------------- */

    if (update.gender !== undefined) {
      const allowedGenders = ["male", "female", "other", ""];

      if (!allowedGenders.includes(update.gender)) {
        return res.status(400).json({
          message: "Invalid gender.",
        });
      }
    }

    /* ---------------------------------------------
       Skills validation
    --------------------------------------------- */

    if (update.skills !== undefined) {
      if (!Array.isArray(update.skills)) {
        return res.status(400).json({
          message: "Skills must be an array.",
        });
      }

      update.skills = update.skills
        .filter((skill) => typeof skill === "string")
        .map((skill) => skill.trim())
        .filter(Boolean)
        .slice(0, 30);
    }

    /* ---------------------------------------------
       Skill levels validation
    --------------------------------------------- */

    if (update.skillLevels !== undefined) {
      if (
        typeof update.skillLevels !== "object" ||
        Array.isArray(update.skillLevels)
      ) {
        return res.status(400).json({
          message: "Skill levels must be an object.",
        });
      }
    }

    /* ---------------------------------------------
       Experience validation
    --------------------------------------------- */

    if (update.experienceYears !== undefined) {
      if (
        update.experienceYears === "" ||
        update.experienceYears === null
      ) {
        update.experienceYears = undefined;
      } else {
        const experience = Number(update.experienceYears);

        if (!Number.isFinite(experience) || experience < 0 || experience > 50) {
          return res.status(400).json({
            message: "Experience must be between 0 and 50 years.",
          });
        }

        update.experienceYears = experience;
      }
    }

    /* ---------------------------------------------
       Boolean validation
    --------------------------------------------- */

    if (update.openToCollaborate !== undefined) {
      if (typeof update.openToCollaborate !== "boolean") {
        return res.status(400).json({
          message: "openToCollaborate must be true or false.",
        });
      }
    }

    /* ---------------------------------------------
       Text fields
    --------------------------------------------- */

    const textFields = [
      "photoUrl",
      "about",
      "headline",
      "location",
      "githubUsername",
    ];

    for (const field of textFields) {
      if (update[field] !== undefined) {
        if (typeof update[field] !== "string") {
          return res.status(400).json({
            message: `${field} must be text.`,
          });
        }

        update[field] = update[field].trim();
      }
    }

    /* ---------------------------------------------
       URL validation
    --------------------------------------------- */

    const urlFields = [
      "linkedinUrl",
      "twitterUrl",
    ];

    for (const field of urlFields) {
      if (update[field] !== undefined) {
        const value = update[field].trim();

        if (value !== "" && !validator.isURL(value, {
          protocols: ["http", "https"],
          require_protocol: true,
        })) {
          return res.status(400).json({
            message: `${field} must be a valid URL.`,
          });
        }

        update[field] = value;
      }
    }

    /* ---------------------------------------------
       Apply update
    --------------------------------------------- */

    Object.assign(req.user, update);

    /* ---------------------------------------------
       IMPORTANT:
       Server decides profileComplete.
       Client cannot set it manually.
    --------------------------------------------- */

    req.user.profileComplete = isProfileComplete(req.user);

    await req.user.save();

    return res.status(200).json({
      message: "Profile updated successfully.",
      data: safeUser(req.user),
    });
  } catch (err) {
    console.error("PATCH /profile/edit error:", err);

    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: Object.values(err.errors)
          .map((error) => error.message)
          .join(", "),
      });
    }

    return res.status(500).json({
      message: "Unable to update profile.",
    });
  }
});

module.exports = router;