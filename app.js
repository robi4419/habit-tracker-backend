import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import habitsRouter from "./routes/habits.js";
import entriesRouter from "./routes/entries.js";
import authRouter from "./routes/auth.js";
import authenticate from "./middleware/auth.js";
import cookieParser from "cookie-parser";
import errorHandler from "./utils/errorHandler.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const allowedOrigins = process.env.CLIENT_URLS.split(","); // "https://a.com,https://b.com"

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    exposedHeaders: [
      "RateLimit-Reset",
      "RateLimit-Limit",
      "RateLimit-Remaining",
    ],
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.use("/api/auth", authRouter);
app.use("/api", authenticate, habitsRouter, entriesRouter);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
