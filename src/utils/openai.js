const chatComplete = async (messages, { json = false } = {}) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error("OPENAI_API_KEY is not set");
    err.code = "NO_KEY";
    throw err;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed");
  }
  return data.choices?.[0]?.message?.content || "";
};

module.exports = { chatComplete };
