import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { db } from "../utils/db.js";
import AppError from "../utils/AppError.js";
import rateLimit from "express-rate-limit";
import { validateEmail, validatePassword } from "../utils/validators.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 attempts per IP in that window
  message: { message: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "7d",
    },
  );

  return { accessToken, refreshToken };
};

router.post("/register", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { email, password } = req.body;

    validatePassword(password);
    validateEmail(email);

    const hashed = await bcrypt.hash(password, 12);

    const result = await client.query(
      'INSERT INTO public."Users" (id, email, password) VALUES ($1, $2, $3) RETURNING id, email',
      [nanoid(), email, hashed],
    );
    const user = result.rows[0];

    const { accessToken, refreshToken } = generateTokens(user);
    // Store refresh token in DB for rotation/revocation
    await client.query(
      'UPDATE public."Users" SET refresh_token = $1 WHERE id = $2',
      [refreshToken, user.id],
    );

    await client.query("COMMIT");

    res
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
        },
      });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  validateEmail(email);

  const result = await db.query(
    'SELECT id, email, password FROM public."Users" WHERE email = $1',
    [email],
  );
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError("Invalid credentials", 401);
  }

  const { accessToken, refreshToken } = generateTokens({
    id: user.id,
    email: user.email,
  });
  await db.query('UPDATE public."Users" SET refresh_token = $1 WHERE id = $2', [
    refreshToken,
    user.id,
  ]);

  res
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
    });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) throw new AppError("Missing refresh token", 401);

  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  const result = await db.query(
    'SELECT id, email FROM public."Users" WHERE id = $1 AND refresh_token = $2',
    [decoded.id, token],
  );
  const user = result.rows[0];

  if (!user) throw new AppError("Invalid refresh token", 401);

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

  // Rotate the refresh token
  await db.query('UPDATE public."Users" SET refresh_token = $1 WHERE id = $2', [
    newRefreshToken,
    user.id,
  ]);

  res
    .cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
    });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies.refreshToken;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      await db.query(
        'UPDATE public."Users" SET refresh_token = NULL WHERE id = $1',
        [decoded.id],
      );
    } catch {
      // invalid token, nothing to revoke
    }
  }
  res.clearCookie("refreshToken").json({ message: "Logged out" });
});

export default router;
