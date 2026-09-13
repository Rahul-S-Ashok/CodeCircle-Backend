require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");

const connectDB = require("./config/database");
const initSocket = require("./utils/socket");

const app = express();
const server = http.createServer(app);

/* -------------------------------------------------------
   Environment validation
------------------------------------------------------- */

const requiredEnv = [
  "MONGO_URI",
  "JWT_SECRET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

/* -------------------------------------------------------
   CORS
------------------------------------------------------- */

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin header
      // Postman, server-to-server requests, etc.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Not allowed by CodeCircle CORS policy")
      );
    },
    credentials: true,
  })
);

// /* -------------------------------------------------------
//    Webhook

//    Razorpay webhook needs raw request body
// ------------------------------------------------------- */

// app.use(
//   "/payment/webhook",
//   express.raw({
//     type: "application/json",
//   })
// );

/* -------------------------------------------------------
   Normal JSON requests
------------------------------------------------------- */

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

app.use(cookieParser());

/* -------------------------------------------------------
   Health check
------------------------------------------------------- */

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "CodeCircle API",
    environment: process.env.NODE_ENV || "development",
  });
});

/* -------------------------------------------------------
   Routes
------------------------------------------------------- */

app.use("/auth", require("./routes/auth"));

app.use("/profile", require("./routes/profile"));

app.use("/request", require("./routes/request"));

app.use("/user", require("./routes/user"));

app.use("/payment", require("./routes/payment"));

app.use("/ai", require("./routes/ai"));

app.use("/projects", require("./routes/projects"));

app.use("/github", require("./routes/github"));

app.use("/", require("./routes/chat"));

/* -------------------------------------------------------
   404
------------------------------------------------------- */

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found.",
  });
});

/* -------------------------------------------------------
   Global error handler
------------------------------------------------------- */

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    message:
      process.env.NODE_ENV === "production"
        ? "Something went wrong."
        : err.message || "Internal server error.",
  });
});

/* -------------------------------------------------------
   Start server
------------------------------------------------------- */

const PORT = Number(process.env.PORT) || 8080;

const startServer = async () => {
  try {
    await connectDB();

    initSocket(server);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `🚀 CodeCircle API running on port ${PORT}`
      );

      console.log(
        `🌍 Environment: ${
          process.env.NODE_ENV || "development"
        }`
      );
    });
  } catch (err) {
    console.error(
      "❌ Server startup failed:",
      err
    );

    process.exit(1);
  }
};

startServer();