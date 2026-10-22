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
app.get("/dbworking", async (req, res) => {
  try {
    const result = await db.execute("SELECT 1 AS connected");

    return res.status(200).json({
      success: true,
      message: "Database connection successful",
      database: "connected",
      result: result.rows[0],
    });
  } catch (error) {
    console.error("Database availability check failed:", {
      message: error.message,
      code: error.code,
      status: error.cause?.status,
    });

    return res.status(503).json({
      success: false,
      message: "Database connection failed",
      database: "unavailable",
      error: error.message,
      code: error.code || null,
      status: error.cause?.status || null,
    });
  }
});
app.get("/allproducts", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        product_id,
        product_name
      FROM products
      ORDER BY product_id ASC
    `);



    res.json(result);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      error: "Failed to fetch products",
    });
  }
});

module.exports = app;
