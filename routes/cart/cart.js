const express = require("express");
const { checkAuth } = require("../../imports/token");
const db = require("../../imports/database");

const app = express.Router();

app.customPath = "/api";

app.get("/cart", checkAuth("user"), async (req, res) => {
  const customerId = Number(req.user.userId);

  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    return res.status(401).json({ error: "Invalid customer account" });
  }

  try {
    const result = await db.execute({
      sql: `
        SELECT
          c.cart_id,
          c.user_id,
          c.product_id,
          c.quantity,
          c.added_at,
          p.product_name,
          p.description AS product_description,
          p.price,
          p.stock_quantity,
          p.unit,
          p.image_url
        FROM cart c
        LEFT JOIN products p
          ON p.product_id = c.product_id
        WHERE c.user_id = ?
        ORDER BY c.added_at DESC, c.cart_id DESC
      `,
      args: [customerId],
    });

    return res.json(result.rows);
  } catch (error) {
    console.error("Error fetching customer cart:", error);
    return res.status(500).json({ error: "Failed to fetch cart" });
  }
});

module.exports = app;
