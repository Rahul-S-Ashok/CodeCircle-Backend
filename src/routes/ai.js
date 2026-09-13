const express = require("express");
const { userAuth } = require("../middlewares/auth");
const User = require("../models/user");
const { runChat } = require("../utils/openai");
const {
  matchPercent,
  whyYouMatch,
  normalize,
} = require("../utils/matchScore");

const router = express.Router();

/*
 * Safely parse JSON returned by the AI.
 */
const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text?.match(/\{[\s\S]*\}/);

    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

/*
 * Convert skills into a clean array.
 */
const cleanSkills = (skills) => {
  if (!Array.isArray(skills)) return [];

  return [
    ...new Set(
      skills
        .map((skill) => String(skill).trim())
        .filter(Boolean)
    ),
  ].slice(0, 30);
};

/*
 * =========================================================
 * AI BIO GENERATOR
 * =========================================================
 *
 * POST /ai/bio
 */
router.post("/bio", userAuth, async (req, res) => {
  try {
    const {
      firstName,
      headline,
      location,
      skills,
      experienceYears,
    } = req.body;

    const safeSkills = cleanSkills(skills);

    /*
     * Fallback if OpenAI isn't configured.
     */
    if (!process.env.OPENAI_API_KEY) {
      const fallbackAbout = [
        `${firstName || "Developer"} is a software developer`,
        headline ? `focused on ${headline}` : "",
        safeSkills.length
          ? `with experience in ${safeSkills.slice(0, 5).join(", ")}`
          : "",
        experienceYears
          ? `and ${experienceYears} years of experience`
          : "",
        location ? `based in ${location}` : "",
        ".",
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+\./, ".");

      return res.json({
        data: {
          about: fallbackAbout,
          headline:
            headline ||
            "Software Developer | Open to Collaboration",
          skills: safeSkills,
        },
      });
    }

    const prompt = `
You are an expert technical recruiter and professional developer profile writer.

Create a strong but natural CodeCircle developer profile.

Developer:
Name: ${firstName || ""}
Headline: ${headline || ""}
Location: ${location || ""}
Experience: ${experienceYears || 0} years
Skills: ${safeSkills.join(", ")}

Return ONLY valid JSON:

{
  "about": "professional 2-4 sentence bio",
  "headline": "short professional headline",
  "skills": ["skill1", "skill2", "skill3"]
}

Rules:
- Do not invent experience.
- Do not invent companies.
- Do not invent degrees.
- Keep the bio under 500 characters.
- Keep headline under 100 characters.
- Return technical skills only.
`;

    const result = await runChat({
      messages: [
        {
          role: "system",
          content:
            "You create concise, truthful developer profiles.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.6,
      json: true,
    });

    const parsed = parseJson(result);

    if (!parsed) {
      return res.status(500).json({
        message: "AI returned an invalid response",
      });
    }

    return res.json({
      data: {
        about: String(parsed.about || "").slice(0, 1000),
        headline: String(parsed.headline || "").slice(0, 120),
        skills: cleanSkills(parsed.skills),
      },
    });
  } catch (err) {
    console.error("AI bio error:", err);

    return res.status(500).json({
      message: "Unable to generate AI bio",
    });
  }
});

/*
 * =========================================================
 * AI ICEBREAKERS
 * =========================================================
 *
 * POST /ai/icebreaker
 */
router.post("/icebreaker", userAuth, async (req, res) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({
        message: "Target user is required",
      });
    }

    const target = await User.findOne({
      _id: targetUserId,
      profileComplete: true,
    }).select(
      "firstName lastName headline about skills location githubUsername"
    );

    if (!target) {
      return res.status(404).json({
        message: "Developer not found",
      });
    }

    const currentUser = req.user;

    const sharedSkills = (currentUser.skills || []).filter(
      (skill) =>
        (target.skills || [])
          .map(normalize)
          .includes(normalize(skill))
    );

    /*
     * Fallback without OpenAI.
     */
    if (!process.env.OPENAI_API_KEY) {
      const suggestions = [
        sharedSkills.length
          ? `I noticed we both work with ${sharedSkills
              .slice(0, 2)
              .join(" and ")} — what are you building with it?`
          : `Hey ${target.firstName}, what are you currently building?`,

        target.headline
          ? `Your work around "${target.headline}" caught my attention. How did you get into it?`
          : `Hey ${target.firstName}, what kind of projects are you excited about right now?`,

        target.githubUsername
          ? `I saw you're on GitHub — what's the most interesting project you've worked on recently?`
          : `Hey ${target.firstName}, are you currently looking for people to collaborate with?`,
      ];

      return res.json({
        data: suggestions,
      });
    }

    const prompt = `
Create 3 short, natural conversation starters for a developer networking platform.

My profile:
Name: ${currentUser.firstName}
Skills: ${(currentUser.skills || []).join(", ")}
About: ${currentUser.about || ""}

Other developer:
Name: ${target.firstName}
Headline: ${target.headline || ""}
Skills: ${(target.skills || []).join(", ")}
About: ${target.about || ""}
Location: ${target.location || ""}

Return ONLY JSON:

{
  "icebreakers": [
    "message 1",
    "message 2",
    "message 3"
  ]
}

Rules:
- Each message should feel human.
- No generic "Hi, how are you?"
- Mention a real skill/project/topic when possible.
- Keep each under 180 characters.
`;

    const result = await runChat({
      messages: [
        {
          role: "system",
          content:
            "You create concise developer networking conversation starters.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8,
      json: true,
    });

    const parsed = parseJson(result);

    if (!parsed?.icebreakers) {
      return res.status(500).json({
        message: "AI returned an invalid response",
      });
    }

    return res.json({
      data: parsed.icebreakers
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 3),
    });
  } catch (err) {
    console.error("AI icebreaker error:", err);

    return res.status(500).json({
      message: "Unable to generate icebreakers",
    });
  }
});

/*
 * =========================================================
 * AI DEVELOPER SEARCH
 * =========================================================
 *
 * POST /ai/search
 */
router.post("/search", userAuth, async (req, res) => {
  try {
    const query = String(req.body.query || "").trim();

    if (!query) {
      return res.status(400).json({
        message: "Search query is required",
      });
    }

    if (query.length > 300) {
      return res.status(400).json({
        message: "Search query is too long",
      });
    }

    let intent = {
      skills: [],
      location: "",
      keywords: [],
      openToCollaborate: null,
    };

    /*
     * AI extracts search intent.
     */
    if (process.env.OPENAI_API_KEY) {
      try {
        const result = await runChat({
          messages: [
            {
              role: "system",
              content: `
Extract developer search intent.

Return ONLY JSON:

{
  "skills": [],
  "location": "",
  "keywords": [],
  "openToCollaborate": null
}

Extract only information actually present in the query.
`,
            },
            {
              role: "user",
              content: query,
            },
          ],
          temperature: 0.2,
          json: true,
        });

        intent = parseJson(result) || intent;
      } catch (err) {
        console.error("AI search intent error:", err.message);
      }
    } else {
      /*
       * Basic fallback keyword extraction.
       */
      intent.skills = query
        .toLowerCase()
        .match(
          /\b(react|node\.?js|javascript|typescript|python|java|c\+\+|c#|go|golang|rust|php|angular|vue|flutter|swift|kotlin|django|spring|mongodb|mysql|postgresql|aws|docker|kubernetes|machine learning|ml|ai)\b/g
        ) || [];
    }

    const requestedSkills = cleanSkills(intent.skills);

    /*
     * Search completed profiles.
     */
    const candidates = await User.find({
      _id: { $ne: req.user._id },
      profileComplete: true,
    })
      .select(
        "firstName lastName photoUrl age gender about skills headline location experienceYears openToCollaborate githubUsername githubStats"
      )
      .limit(100);

    const queryWords = query
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((word) => word.length >= 3);

    const results = candidates
      .map((candidate) => {
        const candidateText = [
          candidate.firstName,
          candidate.lastName,
          candidate.headline,
          candidate.about,
          candidate.location,
          ...(candidate.skills || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchedSkills = requestedSkills.filter(
          (skill) =>
            (candidate.skills || [])
              .map(normalize)
              .includes(normalize(skill))
        );

        const textHits = queryWords.filter((word) =>
          candidateText.includes(word)
        ).length;

        const skillScore = requestedSkills.length
          ? matchedSkills.length / requestedSkills.length
          : 0;

        const textScore = queryWords.length
          ? textHits / queryWords.length
          : 0;

        let score =
          skillScore * 70 +
          textScore * 30;

        /*
         * Collaboration preference.
         */
        if (
          intent.openToCollaborate === true &&
          candidate.openToCollaborate
        ) {
          score += 5;
        }

        score = Math.min(99, Math.max(1, Math.round(score)));

        return {
          ...candidate.toObject(),
          matchScore: score,
          matchedSkills,
          whyYouMatch:
            matchedSkills.length > 0
              ? `Matches your search through ${matchedSkills
                  .slice(0, 3)
                  .join(", ")}.`
              : "Relevant developer profile based on your search.",
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 12);

    return res.json({
      data: results,
      query,
      intent,
    });
  } catch (err) {
    console.error("AI search error:", err);

    return res.status(500).json({
      message: "Unable to perform AI search",
    });
  }
});

/*
 * =========================================================
 * AI TEAM BUILDER
 * =========================================================
 *
 * POST /ai/team
 */
router.post("/team", userAuth, async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        message: "Team requirement is required",
      });
    }

    if (prompt.length > 500) {
      return res.status(400).json({
        message: "Team requirement is too long",
      });
    }

    let roles = [];

    /*
     * AI identifies the required roles.
     */
    if (process.env.OPENAI_API_KEY) {
      try {
        const result = await runChat({
          messages: [
            {
              role: "system",
              content: `
You are a technical team architect.

Given a project description, identify the developer roles needed.

Return ONLY JSON:

{
  "roles": [
    "role 1",
    "role 2",
    "role 3"
  ]
}

Keep roles concise.
Maximum 5 roles.
`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.3,
          json: true,
        });

        const parsed = parseJson(result);

        roles = Array.isArray(parsed?.roles)
          ? parsed.roles
              .map((role) => String(role).trim())
              .filter(Boolean)
              .slice(0, 5)
          : [];
      } catch (err) {
        console.error("AI team role extraction error:", err.message);
      }
    }

    /*
     * Simple fallback.
     */
    if (!roles.length) {
      const lower = prompt.toLowerCase();

      if (
        lower.includes("ai") ||
        lower.includes("machine learning") ||
        lower.includes("ml")
      ) {
        roles.push("ML Engineer");
      }

      if (
        lower.includes("frontend") ||
        lower.includes("react") ||
        lower.includes("ui")
      ) {
        roles.push("Frontend Developer");
      }

      if (
        lower.includes("backend") ||
        lower.includes("node") ||
        lower.includes("api")
      ) {
        roles.push("Backend Developer");
      }

      if (
        lower.includes("design") ||
        lower.includes("ux")
      ) {
        roles.push("UI/UX Designer");
      }

      if (!roles.length) {
        roles = ["Full Stack Developer"];
      }
    }

    const candidates = await User.find({
      _id: { $ne: req.user._id },
      profileComplete: true,
    })
      .select(
        "firstName lastName photoUrl age gender about skills headline location experienceYears openToCollaborate githubUsername githubStats"
      )
      .limit(100);

    /*
     * Match candidates against the project description.
     */
    const results = candidates
      .map((candidate) => {
        const candidateSkills = candidate.skills || [];

        const roleMatches = roles.filter((role) => {
          const roleWords = role
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => word.length > 2);

          return roleWords.some((word) =>
            candidateSkills.some((skill) =>
              normalize(skill).includes(normalize(word))
            )
          );
        });

        const projectWords = prompt
          .toLowerCase()
          .split(/[^a-z0-9+#.]+/)
          .filter((word) => word.length > 2);

        const candidateText = [
          candidate.headline,
          candidate.about,
          candidate.location,
          ...candidateSkills,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const textHits = projectWords.filter((word) =>
          candidateText.includes(word)
        ).length;

        const textScore = projectWords.length
          ? textHits / projectWords.length
          : 0;

        let score = Math.round(
          textScore * 60 +
            Math.min(roleMatches.length / Math.max(roles.length, 1), 1) *
              40
        );

        if (candidate.openToCollaborate) {
          score += 5;
        }

        score = Math.min(99, Math.max(1, score));

        return {
          ...candidate.toObject(),

          matchScore: score,

          matchedRoles: roleMatches,

          whyYouMatch:
            roleMatches.length > 0
              ? `Good fit for ${roleMatches
                  .slice(0, 2)
                  .join(" and ")}.`
              : "Skills and profile are relevant to the project.",
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 12);

    return res.json({
      data: {
        project: prompt,
        roles,
        you: {
          _id: req.user._id,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
        },
        team: results,
      },
    });
  } catch (err) {
    console.error("AI team builder error:", err);

    return res.status(500).json({
      message: "Unable to build team",
    });
  }
});

module.exports = router;