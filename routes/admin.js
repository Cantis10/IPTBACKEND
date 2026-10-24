const express = require("express");
const { checkAuth } = require("../imports/token");
const db = require("../imports/database");
const productImageUrl = require("../imports/productImageUrl");
const app = express.Router();
app.customPath = "/api";
const adminOnly = checkAuth("admin");

app.get("/admin/overview", adminOnly, async (_req, res) => {
  try {
    const [orders, products, customers] = await Promise.all([
      db.execute("SELECT COUNT(*) AS order_count, COALESCE(SUM(CASE WHEN order_status != 'Cancelled' THEN total_amount ELSE 0 END), 0) AS sales_total, SUM(CASE WHEN order_status IN ('Pending', 'Confirmed') THEN 1 ELSE 0 END) AS pending_orders, SUM(CASE WHEN order_status IN ('Packed', 'Out for Delivery', 'Processing') THEN 1 ELSE 0 END) AS processing_orders, SUM(CASE WHEN order_status IN ('Delivered', 'Completed') THEN 1 ELSE 0 END) AS completed_orders, SUM(CASE WHEN order_status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled_orders FROM orders"),
      db.execute("SELECT COUNT(*) AS product_count, SUM(CASE WHEN is_active = 1 AND stock_quantity <= 5 THEN 1 ELSE 0 END) AS low_stock_count FROM products"),
      db.execute("SELECT COUNT(*) AS customer_count FROM users WHERE LOWER(role) != 'admin'"),
    ]);
    return res.json({
      orderCount: Number(orders.rows[0]?.order_count || 0),
      salesTotal: Number(orders.rows[0]?.sales_total || 0),
      pendingOrders: Number(orders.rows[0]?.pending_orders || 0),
      processingOrders: Number(orders.rows[0]?.processing_orders || 0),
      completedOrders: Number(orders.rows[0]?.completed_orders || 0),
      cancelledOrders: Number(orders.rows[0]?.cancelled_orders || 0),
      productCount: Number(products.rows[0]?.product_count || 0),
      lowStockCount: Number(products.rows[0]?.low_stock_count || 0),
      customerCount: Number(customers.rows[0]?.customer_count || 0),
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return res.status(500).json({ error: "Unable to load admin overview" });
  }
});

app.get("/admin/products", adminOnly, async (_req, res) => {
  try {
    const result = await db.execute("SELECT p.product_id, p.product_name, p.description, p.price, p.stock_quantity, p.unit, p.image_url, p.is_active, p.category_id, c.category_name FROM products p LEFT JOIN categories c ON c.category_id = p.category_id ORDER BY p.product_name");
    return res.json(result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active), image_url: productImageUrl(row.image_url) || null })));
  } catch (error) {
    console.error("Admin products error:", error);
    return res.status(500).json({ error: "Unable to load products" });
  }
});

app.post("/admin/products", adminOnly, async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const unit = String(body.unit || "").trim();
  const price = Number(body.price);
  const stock = Number(body.stockQuantity);
  const categoryId = body.categoryId == null || body.categoryId === "" ? null : Number(body.categoryId);
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : null;
  if (!name || name.length > 120 || description.length > 2000 || !unit || unit.length > 40 || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(stock) || stock < 0 || categoryId === null || !Number.isSafeInteger(categoryId) || categoryId < 1 || (imageUrl && imageUrl.length > 750000)) {
    return res.status(400).json({ error: "Enter valid product details, price, stock, category, and image" });
  }
  try {
    const result = await db.execute({ sql: "INSERT INTO products (product_name, description, price, stock_quantity, unit, image_url, category_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", args: [name, description, price, stock, unit, imageUrl, categoryId] });
    return res.status(201).json({ productId: Number(result.lastInsertRowid) });
  } catch (error) {
    console.error("Admin product create error:", error);
    return res.status(500).json({ error: "Unable to create product" });
  }
});

app.get("/admin/categories", adminOnly, async (_req, res) => {
  try {
    const result = await db.execute("SELECT category_id, category_name, description FROM categories ORDER BY category_name");
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin categories error:", error);
    return res.status(500).json({ error: "Unable to load categories" });
  }
});

app.post("/admin/categories", adminOnly, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  if (!name || name.length > 100 || description.length > 1000) return res.status(400).json({ error: "Enter a category name and a shorter description" });
  try {
    const result = await db.execute({ sql: "INSERT INTO categories (category_name, description) VALUES (?, ?)", args: [name, description] });
    return res.status(201).json({ categoryId: Number(result.lastInsertRowid) });
  } catch (error) {
    console.error("Admin category create error:", error);
    return res.status(500).json({ error: "Unable to create category" });
  }
});

app.patch("/admin/categories/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !name || name.length > 100 || description.length > 1000) return res.status(400).json({ error: "Enter a valid category name and description" });
  try {
    const result = await db.execute({ sql: "UPDATE categories SET category_name = ?, description = ? WHERE category_id = ?", args: [name, description, id] });
    if (!Number(result.rowsAffected)) return res.status(404).json({ error: "Category not found" });
    return res.json({ saved: true });
  } catch (error) {
    console.error("Admin category update error:", error);
    return res.status(500).json({ error: "Unable to update category" });
  }
});

app.delete("/admin/categories/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid category" });
  try {
    const used = await db.execute({ sql: "SELECT COUNT(*) AS product_count FROM products WHERE category_id = ?", args: [id] });
    if (Number(used.rows[0]?.product_count || 0)) return res.status(409).json({ error: "Reassign or remove products in this category first" });
    const result = await db.execute({ sql: "DELETE FROM categories WHERE category_id = ?", args: [id] });
    if (!Number(result.rowsAffected)) return res.status(404).json({ error: "Category not found" });
    return res.json({ deleted: true });
  } catch (error) {
    console.error("Admin category delete error:", error);
    return res.status(500).json({ error: "Unable to delete category" });
  }
});

app.get("/admin/reports", adminOnly, async (req, res) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !datePattern.test(from)) || (to && !datePattern.test(to))) return res.status(400).json({ error: "Use YYYY-MM-DD dates" });
  const conditions = [];
  const args = [];
  if (from) { conditions.push("date(placed_at) >= date(?)"); args.push(from); }
  if (to) { conditions.push("date(placed_at) <= date(?)"); args.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderWhere = conditions.length ? `WHERE ${conditions.map((condition) => condition.replaceAll("placed_at", "o.placed_at")).join(" AND ")} AND o.order_status != 'Cancelled'` : "WHERE o.order_status != 'Cancelled'";
  try {
    const [summary, daily, bestSellers, lowStock] = await Promise.all([
      db.execute({ sql: `SELECT COUNT(*) AS order_count, COALESCE(SUM(CASE WHEN order_status != 'Cancelled' THEN total_amount ELSE 0 END), 0) AS sales_total FROM orders ${where}`, args }),
      db.execute({ sql: `SELECT date(placed_at) AS sale_date, COUNT(*) AS order_count, COALESCE(SUM(CASE WHEN order_status != 'Cancelled' THEN total_amount ELSE 0 END), 0) AS sales_total FROM orders ${where} GROUP BY date(placed_at) ORDER BY sale_date DESC LIMIT 31`, args }),
      db.execute({ sql: `SELECT i.product_id, i.product_name, SUM(i.quantity) AS units_sold, SUM(i.quantity * i.unit_price) AS sales_total FROM order_items i INNER JOIN orders o ON o.order_id = i.order_id ${orderWhere} GROUP BY i.product_id, i.product_name ORDER BY units_sold DESC LIMIT 10`, args }),
      db.execute("SELECT product_id, product_name, stock_quantity, unit FROM products WHERE is_active = 1 AND stock_quantity <= 5 ORDER BY stock_quantity, product_name"),
    ]);
    return res.json({ summary: summary.rows[0], daily: daily.rows, bestSellers: bestSellers.rows, lowStock: lowStock.rows });
  } catch (error) {
    console.error("Admin report error:", error);
    return res.status(500).json({ error: "Unable to load sales reports" });
  }
});

app.patch("/admin/products/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const unit = String(req.body?.unit || "").trim();
  const price = Number(req.body?.price);
  const stock = Number(req.body?.stockQuantity);
  const active = req.body?.isActive;
  const categoryId = req.body?.categoryId == null || req.body.categoryId === "" ? null : Number(req.body.categoryId);
  const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl : null;
  if (!Number.isSafeInteger(id) || id < 1 || !name || name.length > 120 || description.length > 2000 || !unit || unit.length > 40 || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(stock) || stock < 0 || typeof active !== "boolean" || categoryId === null || !Number.isSafeInteger(categoryId) || categoryId < 1 || (imageUrl && imageUrl.length > 750000)) {
    return res.status(400).json({ error: "Enter valid product details, price, stock, category, and image" });
  }
  try {
    const result = await db.execute({ sql: "UPDATE products SET product_name = ?, description = ?, price = ?, stock_quantity = ?, unit = ?, category_id = ?, image_url = ?, is_active = ? WHERE product_id = ?", args: [name, description, price, stock, unit, categoryId, imageUrl, active ? 1 : 0, id] });
    if (!Number(result.rowsAffected)) return res.status(404).json({ error: "Product not found" });
    return res.json({ saved: true });
  } catch (error) {
    console.error("Admin product update error:", error);
    return res.status(500).json({ error: "Unable to update product" });
  }
});

app.get("/admin/orders", adminOnly, async (_req, res) => {
  try {
    const result = await db.execute("SELECT order_id, customer_name, order_status, total_amount, payment_method, placed_at, shipping_address FROM orders ORDER BY placed_at DESC, order_id DESC LIMIT 200");
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin orders error:", error);
    return res.status(500).json({ error: "Unable to load orders" });
  }
});

app.get("/admin/orders/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid order" });
  try {
    const order = await db.execute({ sql: "SELECT o.*, u.full_name, u.email, u.phone_number FROM orders o LEFT JOIN users u ON u.user_id = o.user_id WHERE o.order_id = ?", args: [id] });
    if (!order.rows.length) return res.status(404).json({ error: "Order not found" });
    const items = await db.execute({ sql: "SELECT product_id, product_name, quantity, unit_price, unit, image_url FROM order_items WHERE order_id = ? ORDER BY rowid", args: [id] });
    return res.json({ ...order.rows[0], items: items.rows });
  } catch (error) {
    console.error("Admin order detail error:", error);
    return res.status(500).json({ error: "Unable to load order details" });
  }
});

app.patch("/admin/orders/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  const allowed = ["Pending", "Packed", "Out for Delivery", "Delivered", "Cancelled", "Processing", "Completed"];
  if (!Number.isSafeInteger(id) || id < 1 || !allowed.includes(status)) return res.status(400).json({ error: "Choose a valid order status" });
  try {
    const result = await db.execute({ sql: "UPDATE orders SET order_status = ? WHERE order_id = ?", args: [status, id] });
    if (!Number(result.rowsAffected)) return res.status(404).json({ error: "Order not found" });
    return res.json({ saved: true });
  } catch (error) {
    console.error("Admin order update error:", error);
    return res.status(500).json({ error: "Unable to update order" });
  }
});

app.get("/admin/customers", adminOnly, async (_req, res) => {
  try {
    const result = await db.execute("SELECT user_id, full_name, username, email, phone_number, account_status FROM users WHERE LOWER(role) != 'admin' ORDER BY full_name");
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin customers error:", error);
    return res.status(500).json({ error: "Unable to load customer accounts" });
  }
});

app.get("/admin/customers/:id/orders", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid customer" });
  try {
    const result = await db.execute({ sql: "SELECT order_id, order_status, total_amount, placed_at FROM orders WHERE user_id = ? ORDER BY placed_at DESC", args: [id] });
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin customer order history error:", error);
    return res.status(500).json({ error: "Unable to load customer order history" });
  }
});

app.patch("/admin/customers/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!Number.isSafeInteger(id) || id < 1 || !["Active", "Inactive"].includes(status)) return res.status(400).json({ error: "Choose Active or Inactive" });
  try {
    const result = await db.execute({ sql: "UPDATE users SET account_status = ? WHERE user_id = ? AND LOWER(role) != 'admin'", args: [status, id] });
    if (!Number(result.rowsAffected)) return res.status(404).json({ error: "Customer account not found" });
    return res.json({ saved: true });
  } catch (error) {
    console.error("Admin customer update error:", error);
    return res.status(500).json({ error: "Unable to update customer account" });
  }
});

module.exports = app;
