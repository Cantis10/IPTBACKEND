const express = require("express");
const app = express.Router();
const { checkAuth } = require("../../imports/token");
const db = require("../../imports/database");

app.customPath = "/api";

app.get("/isLoggedIn", checkAuth("user"), async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT user_id, full_name, email, role FROM users WHERE user_id = ?",
      args: [req.user.userId],
    });
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }

    return res.status(200).json({
      loggedIn: true,
      user: {
        userId: user.user_id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Account lookup error:", error);
    return res.status(500).json({ error: "Unable to retrieve account" });
  }
});

module.exports = app;
