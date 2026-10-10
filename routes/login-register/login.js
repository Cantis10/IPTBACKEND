const express = require("express");
const app = express.Router();

const db = require("../../imports/database");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { promisify } = require("util");

const JWT_SECRET = process.env.JWT_SECRET;
const scrypt = promisify(crypto.scrypt);

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

    const user = result.rows[0];
    if (!user || typeof user.password_hash !== "string") {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const storedHash = user.password_hash;
    let validPassword = false;
    if (storedHash.startsWith("scrypt:")) {
      const [, salt, expectedHex] = storedHash.split(":");
      if (salt && /^[\da-f]{128}$/i.test(expectedHex || "")) {
        const expected = Buffer.from(expectedHex, "hex");
        const actual = await scrypt(password, salt, expected.length);
        validPassword = crypto.timingSafeEqual(expected, actual);
      }
    } else {
      // Upgrade legacy plaintext records after their next successful login.
      const submitted = Buffer.from(password);
      const existing = Buffer.from(storedHash);
      validPassword =
        submitted.length === existing.length &&
        crypto.timingSafeEqual(submitted, existing);
      if (validPassword) {
        const salt = crypto.randomBytes(16).toString("hex");
        const upgradedHash = `scrypt:${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
        await db.execute({
          sql: "UPDATE users SET password_hash = ? WHERE user_id = ?",
          args: [upgradedHash, user.user_id],
        });
      }
    }

    if (!validPassword) {
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
