const express = require("express");
const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");

const User = require("../models/user");
const { setAuthCookie, clearAuthCookie, safeUser } = require("../utils/authCookie");
const { validateSignUpData } = require("../utils/validation");

const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* -------------------------------------------------------
   POST /auth/signup
------------------------------------------------------- */

router.post("/signup", async (req, res) => {
  try {
    validateSignUpData(req);

    const {
      firstName,
      lastName,
      emailId,
      password,
    } = req.body;

    const normalizedEmail = emailId.trim().toLowerCase();

    const existingUser = await User.findOne({
      emailId: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      emailId: normalizedEmail,
      password: passwordHash,
      profileComplete: false,
    });

    const token = user.getJWT();

    setAuthCookie(res, token);

    return res.status(201).json({
      message: "Account created successfully.",
      data: safeUser(user),
    });
  } catch (err) {
    console.error("Signup error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    return res.status(400).json({
      message: err.message || "Unable to create account.",
    });
  }
});

/* -------------------------------------------------------
   POST /auth/login
------------------------------------------------------- */

router.post("/login", async (req, res) => {
  try {
    const { emailId, password } = req.body;

    if (!emailId || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = emailId.trim().toLowerCase();

    // password has select:false in the User model,
    // so explicitly request it here.
    const user = await User.findOne({
      emailId: normalizedEmail,
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        message:
          "This account uses Google Login. Please continue with Google.",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const token = user.getJWT();

    setAuthCookie(res, token);

    return res.status(200).json({
      message: "Login successful.",
      data: safeUser(user),
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      message: "Unable to login.",
    });
  }
});

/* -------------------------------------------------------
   POST /auth/google
------------------------------------------------------- */

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        message: "Google credential is required.",
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error("GOOGLE_CLIENT_ID is not configured.");

      return res.status(500).json({
        message: "Google authentication is not configured.",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        message: "Unable to verify Google account.",
      });
    }

    const {
      sub: googleId,
      email,
      email_verified,
      given_name,
      family_name,
      picture,
    } = payload;

    if (!googleId || !email) {
      return res.status(401).json({
        message: "Google account information is incomplete.",
      });
    }

    if (!email_verified) {
      return res.status(401).json({
        message: "Your Google email is not verified.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    let user = await User.findOne({
      googleId,
    });

    /* ---------------------------------------------
       Existing Google account
    --------------------------------------------- */

    if (user) {
      const token = user.getJWT();

      setAuthCookie(res, token);

      return res.status(200).json({
        message: "Google login successful.",
        data: safeUser(user),
      });
    }

    /* ---------------------------------------------
       Existing email account

       Do NOT automatically attach Google to it.
       This prevents accidental account linking.
    --------------------------------------------- */

    const existingEmailUser = await User.findOne({
      emailId: normalizedEmail,
    });

    if (existingEmailUser) {
      return res.status(409).json({
        message:
          "An account with this email already exists. Login with your password first.",
      });
    }

    /* ---------------------------------------------
       Create new Google user
    --------------------------------------------- */

    user = await User.create({
      firstName:
        typeof given_name === "string" && given_name.trim()
          ? given_name.trim()
          : "CodeCircle",

      lastName:
        typeof family_name === "string" && family_name.trim()
          ? family_name.trim()
          : "Developer",

      emailId: normalizedEmail,

      googleId,

      photoUrl:
        typeof picture === "string" && picture.trim()
          ? picture.trim()
          : undefined,

      profileComplete: false,
    });

    const token = user.getJWT();

    setAuthCookie(res, token);

    return res.status(201).json({
      message: "Google account created successfully.",
      data: safeUser(user),
    });
  } catch (err) {
    console.error("Google authentication error:", err);

    return res.status(401).json({
      message: "Google authentication failed.",
    });
  }
});

/* -------------------------------------------------------
   POST /auth/logout
------------------------------------------------------- */

router.post("/logout", (req, res) => {
  try {
    clearAuthCookie(res);

    return res.status(200).json({
      message: "Logged out successfully.",
    });
  } catch (err) {
    console.error("Logout error:", err);

    return res.status(500).json({
      message: "Unable to logout.",
    });
  }
});

module.exports = router;