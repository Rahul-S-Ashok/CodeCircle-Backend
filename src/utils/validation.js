const validator = require("validator");

/* -------------------------------------------------------
   Signup validation
------------------------------------------------------- */

const validateSignUpData = (req) => {
  const {
    firstName,
    lastName,
    emailId,
    password,
  } = req.body || {};

  if (
    typeof firstName !== "string" ||
    firstName.trim().length < 2 ||
    firstName.trim().length > 50
  ) {
    throw new Error("First name must be between 2 and 50 characters.");
  }

  if (
    typeof lastName !== "string" ||
    lastName.trim().length < 2 ||
    lastName.trim().length > 50
  ) {
    throw new Error("Last name must be between 2 and 50 characters.");
  }

  if (
    typeof emailId !== "string" ||
    !validator.isEmail(emailId.trim())
  ) {
    throw new Error("Please enter a valid email address.");
  }

  if (
    typeof password !== "string" ||
    !validator.isStrongPassword(password, {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    })
  ) {
    throw new Error(
      "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number and one symbol."
    );
  }
};

/* -------------------------------------------------------
   Allowed profile fields
------------------------------------------------------- */

const allowedEditFields = [
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

/* -------------------------------------------------------
   Profile edit validation
------------------------------------------------------- */

const validateProfileEditData = (req) => {
  const body = req.body || {};

  const invalidFields = Object.keys(body).filter(
    (field) => !allowedEditFields.includes(field)
  );

  if (invalidFields.length > 0) {
    throw new Error(
      `Invalid profile fields: ${invalidFields.join(", ")}`
    );
  }

  return true;
};

module.exports = {
  validateSignUpData,
  validateProfileEditData,
  allowedEditFields,
};