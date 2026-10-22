const express = require("express");
const app = express.Router();

const db = require("../../imports/database");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { promisify } = require("util");

const JWT_SECRET = process.env.JWT_SECRET;
const scrypt = promisify(crypto.scrypt);

app.customPath = "/api";

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;

  const [algorithm, salt, digest] = storedHash.split(":");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/i.test(salt || "") ||
    !/^[a-f0-9]{128}$/i.test(digest || "")
  ) {
    return false;
  }

  const expected = Buffer.from(digest, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (email.trim().length > 254 || password.length > 64) {
      return res.status(400).json({ error: "Email or password is too long" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await db.execute({
      sql: `
        SELECT user_id, full_name, email, role, password_hash
        FROM users
        WHERE email = ?
          AND account_status = 'Active'
      `,
      args: [normalizedEmail],
    });

    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const role = String(user.role).toLowerCase() === "admin" ? "admin" : "user";
    const token = jwt.sign(
      { userId: user.user_id, email: user.email, role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      role,
      user: {
        userId: user.user_id,
        fullName: user.full_name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = app;
