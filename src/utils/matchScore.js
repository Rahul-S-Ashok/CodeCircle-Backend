const normalize = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => typeof item === "string")
    .map((item) =>
      item
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    )
    .filter(Boolean);
};

const normalizeText = (value) => {
  if (typeof value !== "string") return "";

  return value
    .toLowerCase()
    .replace(/[^\w\s+#.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/* -------------------------------------------------------
   Skill similarity
------------------------------------------------------- */

const jaccard = (first, second) => {
  const a = new Set(normalize(first));
  const b = new Set(normalize(second));

  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const skill of a) {
    if (b.has(skill)) {
      intersection++;
    }
  }

  const union = new Set([...a, ...b]).size;

  return union === 0 ? 0 : intersection / union;
};

/* -------------------------------------------------------
   Shared skills
------------------------------------------------------- */

const sharedSkills = (first, second) => {
  const a = new Set(normalize(first));
  const b = new Set(normalize(second));

  return [...a].filter((skill) => b.has(skill));
};

/* -------------------------------------------------------
   Keyword overlap for about/headline
------------------------------------------------------- */

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "has",
  "are",
  "you",
  "your",
  "our",
  "they",
  "their",
  "into",
  "about",
  "using",
  "build",
  "building",
  "developer",
  "developers",
  "software",
  "engineer",
]);

const keywordOverlap = (firstText, secondText) => {
  const first = new Set(
    normalizeText(firstText)
      .split(" ")
      .filter(
        (word) =>
          word.length >= 3 &&
          !STOP_WORDS.has(word)
      )
  );

  const second = new Set(
    normalizeText(secondText)
      .split(" ")
      .filter(
        (word) =>
          word.length >= 3 &&
          !STOP_WORDS.has(word)
      )
  );

  if (first.size === 0 || second.size === 0) {
    return 0;
  }

  let matches = 0;

  for (const word of first) {
    if (second.has(word)) {
      matches++;
    }
  }

  return matches / Math.max(first.size, second.size);
};

/* -------------------------------------------------------
   Location similarity
------------------------------------------------------- */

const locationSimilarity = (viewer, other) => {
  const first = normalizeText(viewer?.location);
  const second = normalizeText(other?.location);

  if (!first || !second) {
    return 0;
  }

  if (first === second) {
    return 1;
  }

  const firstParts = first.split(",");
  const secondParts = second.split(",");

  const firstCity = firstParts[0]?.trim();
  const secondCity = secondParts[0]?.trim();

  if (
    firstCity &&
    secondCity &&
    firstCity === secondCity
  ) {
    return 0.8;
  }

  return 0;
};

/* -------------------------------------------------------
   Collaboration compatibility
------------------------------------------------------- */

const collaborationScore = (viewer, other) => {
  if (
    viewer?.openToCollaborate === true &&
    other?.openToCollaborate === true
  ) {
    return 1;
  }

  if (
    viewer?.openToCollaborate === true ||
    other?.openToCollaborate === true
  ) {
    return 0.5;
  }

  return 0;
};

/* -------------------------------------------------------
   Experience similarity
------------------------------------------------------- */

const experienceSimilarity = (viewer, other) => {
  const first = Number(viewer?.experienceYears);
  const second = Number(other?.experienceYears);

  if (
    !Number.isFinite(first) ||
    !Number.isFinite(second)
  ) {
    return 0;
  }

  const difference = Math.abs(first - second);

  if (difference === 0) return 1;
  if (difference <= 1) return 0.9;
  if (difference <= 2) return 0.75;
  if (difference <= 4) return 0.5;

  return 0.2;
};

/* -------------------------------------------------------
   Main match percentage
------------------------------------------------------- */

const matchPercent = (viewer, other) => {
  const skillsScore = jaccard(
    viewer?.skills,
    other?.skills
  );

  const aboutScore = keywordOverlap(
    `${viewer?.headline || ""} ${viewer?.about || ""}`,
    `${other?.headline || ""} ${other?.about || ""}`
  );

  const locationScore = locationSimilarity(
    viewer,
    other
  );

  const collaborationScoreValue =
    collaborationScore(viewer, other);

  const experienceScore =
    experienceSimilarity(viewer, other);

  /*
    Weighted score

    Skills        → 50%
    Interests     → 20%
    Location      → 10%
    Collaboration → 10%
    Experience    → 10%
  */

  const rawScore =
    skillsScore * 50 +
    aboutScore * 20 +
    locationScore * 10 +
    collaborationScoreValue * 10 +
    experienceScore * 10;

  /*
    Don't show extremely low numbers.
    A profile with no overlap shouldn't look
    like a perfect match.
  */

  const score = Math.round(
    Math.min(99, Math.max(5, rawScore))
  );

  return score;
};

/* -------------------------------------------------------
   Why you match
------------------------------------------------------- */

const whyYouMatch = (viewer, other) => {
  const reasons = [];

  const skills = sharedSkills(
    viewer?.skills,
    other?.skills
  );

  if (skills.length > 0) {
    const displaySkills = skills.slice(0, 3);

    reasons.push(
      `You both know ${displaySkills.join(", ")}`
    );
  }

  const locationScore = locationSimilarity(
    viewer,
    other
  );

  if (locationScore >= 0.8) {
    reasons.push(
      `You're both in ${other.location}`
    );
  }

  if (
    viewer?.openToCollaborate === true &&
    other?.openToCollaborate === true
  ) {
    reasons.push(
      "Both of you are open to collaboration"
    );
  }

  const experienceScore =
    experienceSimilarity(viewer, other);

  if (experienceScore >= 0.75) {
    reasons.push(
      "Your experience levels are similar"
    );
  }

  const aboutScore = keywordOverlap(
    `${viewer?.headline || ""} ${viewer?.about || ""}`,
    `${other?.headline || ""} ${other?.about || ""}`
  );

  if (aboutScore >= 0.2) {
    reasons.push(
      "You have similar developer interests"
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      "You may have complementary skills"
    );
  }

  return reasons.slice(0, 3);
};

module.exports = {
  normalize,
  jaccard,
  keywordOverlap,
  sharedSkills,
  matchPercent,
  whyYouMatch,
};