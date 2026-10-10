const express = require("express");
const app = express.Router();

const db = require("../../imports/database");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

app.customPath = "/api";

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    const result = await db.execute({
      sql: `
        SELECT user_id, email, role
        FROM users
        WHERE email = ?
          AND password_hash = ?
          AND account_status = 'Active'
      `,
      args: [email.trim().toLowerCase(), password],
    });

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const isAdmin = String(user.role).toLowerCase() === "admin";

    const token = jwt.sign(
      {
        userId: user.user_id,
        email: user.email,
        role: isAdmin ? "admin" : "user",
      },
      JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    // Store JWT in HTTP-only cookie
    res.cookie("auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      role: isAdmin ? "admin" : "user",
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Server error",
    });
  }
});

module.exports = app;
