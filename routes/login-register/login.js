
const express = require("express");
const app = express.Router();

const db = require("../../imports/database");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

app.customPath = "/api";

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    console.log("Login attempt:", {
      email,
      password: password ? "****" : undefined,
    });

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

    console.log("SQL communication");

    const normalizedEmail = email.trim().toLowerCase();

    const result = await db.execute({
      sql: `
        SELECT user_id, email, role, password_hash
        FROM users
        WHERE email = ?
          AND account_status = 'Active'
      `,
      args: [normalizedEmail],
    });

    console.log("SQL query completed");
    console.log("Rows returned:", result.rows.length);

    const user = result.rows[0];

    if (
      !user ||
      typeof user.password_hash !== "string" ||
      user.password_hash !== password
    ) {
      console.log("Invalid email or password");

      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    console.log("SQL communication done");

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
      }
    );

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
