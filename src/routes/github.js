const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const { userAuth } = require("../middlewares/auth");

const router = express.Router();

/*
 * Temporary OAuth state storage.
 *
 * For a college/demo project this is enough.
 * In production, use Redis or another shared store.
 */
const oauthStates = new Map();

const STATE_EXPIRY = 10 * 60 * 1000;

/*
 * Generate a secure random state value.
 */
const generateState = () => {
  return crypto.randomBytes(32).toString("hex");
};

/*
 * Remove expired OAuth states periodically.
 */
const cleanupStates = () => {
  const now = Date.now();

  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt > STATE_EXPIRY) {
      oauthStates.delete(state);
    }
  }
};

setInterval(cleanupStates, 5 * 60 * 1000).unref();

/*
 * Start GitHub OAuth.
 *
 * GET /github/connect
 */
router.get("/connect", userAuth, async (req, res) => {
  try {
    if (
      !process.env.GITHUB_CLIENT_ID ||
      !process.env.GITHUB_CLIENT_SECRET
    ) {
      return res.status(500).json({
        message: "GitHub OAuth is not configured",
      });
    }

    const state = generateState();

    oauthStates.set(state, {
      userId: req.user._id.toString(),
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri:
        process.env.GITHUB_CALLBACK_URL ||
        `${process.env.BACKEND_URL}/github/callback`,
      scope: "read:user user:email repo",
      state,
    });

    const githubUrl =
      `https://github.com/login/oauth/authorize?${params.toString()}`;

    return res.redirect(githubUrl);
  } catch (err) {
    console.error("GitHub connect error:", err);

    return res.status(500).json({
      message: "Unable to connect GitHub",
    });
  }
});

/*
 * GitHub OAuth callback.
 *
 * GET /github/callback?code=...&state=...
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Invalid GitHub OAuth request");
    }

    /*
     * Verify state.
     */
    const stateData = oauthStates.get(state);

    if (!stateData) {
      return res.status(400).send("Invalid or expired OAuth state");
    }

    oauthStates.delete(state);

    if (Date.now() - stateData.createdAt > STATE_EXPIRY) {
      return res.status(400).send("OAuth session expired");
    }

    /*
     * Exchange authorization code for access token.
     */
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:
          process.env.GITHUB_CALLBACK_URL ||
          `${process.env.BACKEND_URL}/github/callback`,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const accessToken = tokenResponse.data?.access_token;

    if (!accessToken) {
      console.error(
        "GitHub token error:",
        tokenResponse.data
      );

      return res.status(400).send(
        "Could not authenticate with GitHub"
      );
    }

    const githubHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CodeCircle",
    };

    /*
     * Get GitHub profile.
     */
    const githubUserResponse = await axios.get(
      "https://api.github.com/user",
      {
        headers: githubHeaders,
      }
    );

    const githubUser = githubUserResponse.data;

    /*
     * Get repositories.
     *
     * We only need a small amount of data for
     * CodeCircle's developer profile.
     */
    const reposResponse = await axios.get(
      "https://api.github.com/user/repos",
      {
        headers: githubHeaders,
        params: {
          per_page: 100,
          sort: "updated",
          direction: "desc",
        },
      }
    );

    const repositories = reposResponse.data || [];

    /*
     * Calculate some useful developer statistics.
     */
    const totalStars = repositories.reduce(
      (total, repo) =>
        total + Number(repo.stargazers_count || 0),
      0
    );

    const languages = {};

    for (const repo of repositories) {
      if (!repo.language) continue;

      languages[repo.language] =
        (languages[repo.language] || 0) + 1;
    }

    const topLanguages = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([language]) => language);

    /*
     * Get the authenticated user's public email if available.
     */
    let email = githubUser.email || null;

    if (!email) {
      try {
        const emailsResponse = await axios.get(
          "https://api.github.com/user/emails",
          {
            headers: githubHeaders,
          }
        );

        const emails = emailsResponse.data || [];

        const primaryEmail =
          emails.find(
            (item) => item.primary && item.verified
          ) ||
          emails.find((item) => item.verified);

        email = primaryEmail?.email || null;
      } catch {
        /*
         * Email permission isn't essential.
         */
      }
    }

    const User = require("../models/user");

    const user = await User.findById(stateData.userId);

    if (!user) {
      return res.status(404).send("CodeCircle user not found");
    }

    /*
     * Save GitHub information.
     */
    user.githubUsername = githubUser.login;

    user.githubStats = {
      contributions: Number(githubUser.public_gists || 0),
      repos: Number(githubUser.public_repos || 0),
      achievements: totalStars,
    };

    /*
     * Store useful information in the profile
     * only if the user doesn't already have it.
     */
    if (!user.about && githubUser.bio) {
      user.about = githubUser.bio.slice(0, 1000);
    }

    if (!user.location && githubUser.location) {
      user.location = githubUser.location.slice(0, 100);
    }

    /*
     * Add GitHub's detected languages to skills.
     */
    if (topLanguages.length > 0) {
      const existingSkills = new Set(
        (user.skills || []).map((skill) =>
          String(skill).toLowerCase()
        )
      );

      for (const language of topLanguages) {
        if (!existingSkills.has(language.toLowerCase())) {
          user.skills.push(language);
        }
      }

      user.skills = user.skills.slice(0, 30);
    }

    await user.save();

    /*
     * Redirect back to CodeCircle.
     */
    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:5173";

    return res.redirect(
      `${frontendUrl}/profile?github=connected`
    );
  } catch (err) {
    console.error(
      "GitHub callback error:",
      err.response?.data || err.message
    );

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:5173";

    return res.redirect(
      `${frontendUrl}/profile?github=error`
    );
  }
});

/*
 * Simple GitHub username connection.
 *
 * POST /github/username
 *
 * Useful if the user doesn't want OAuth.
 */
router.post("/username", userAuth, async (req, res) => {
  try {
    const username = String(
      req.body.username || ""
    )
      .trim()
      .replace(/^@/, "");

    if (!username) {
      return res.status(400).json({
        message: "GitHub username is required",
      });
    }

    if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
      return res.status(400).json({
        message: "Invalid GitHub username",
      });
    }

    const response = await axios.get(
      `https://api.github.com/users/${encodeURIComponent(
        username
      )}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "CodeCircle",
        },
      }
    );

    const githubUser = response.data;

    const User = require("../models/user");

    req.user.githubUsername = githubUser.login;

    req.user.githubStats = {
      contributions: Number(githubUser.public_gists || 0),
      repos: Number(githubUser.public_repos || 0),
      achievements: Number(githubUser.followers || 0),
    };

    await req.user.save();

    return res.json({
      message: "GitHub connected successfully",
      data: {
        githubUsername: req.user.githubUsername,
        githubStats: req.user.githubStats,
      },
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({
        message: "GitHub user not found",
      });
    }

    console.error("GitHub username error:", err);

    return res.status(500).json({
      message: "Unable to connect GitHub",
    });
  }
});

module.exports = router;