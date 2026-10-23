const express = require("express");
const { checkAuth } = require("../imports/token");
const db = require("../imports/database");
const productImageUrl = require("../imports/productImageUrl");
const app = express.Router();
app.customPath = "/api";
const authenticated = checkAuth();
let schemaReady;

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    await db.batch([
      `CREATE TABLE IF NOT EXISTS orders (order_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, order_status TEXT NOT NULL DEFAULT 'Pending', payment_method TEXT NOT NULL, subtotal REAL NOT NULL DEFAULT 0, delivery_fee REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL DEFAULT 0, shipping_address TEXT NOT NULL DEFAULT '', placed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, tax_amount REAL NOT NULL DEFAULT 0, delivery_window TEXT NOT NULL DEFAULT '', delivery_schedule TEXT NOT NULL DEFAULT 'same-day', refund_requested INTEGER NOT NULL DEFAULT 0, payment_method_detail TEXT)`,
      `CREATE TABLE IF NOT EXISTS order_items (order_item_id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, unit TEXT NOT NULL DEFAULT '', image_url TEXT)`,
    ], "write");
    const addMissingColumns = async (table, definitions) => {
      const result = await db.execute(`PRAGMA table_info(${table})`);
      const existing = new Set(result.rows.map((row) => row.name));
      for (const [name, definition] of Object.entries(definitions)) {
        if (!existing.has(name)) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    };
    await addMissingColumns("orders", {
      order_status: "TEXT NOT NULL DEFAULT 'Pending'", payment_method: "TEXT NOT NULL DEFAULT 'Cash on Delivery'", subtotal: "REAL NOT NULL DEFAULT 0", delivery_fee: "REAL NOT NULL DEFAULT 0", total_amount: "REAL NOT NULL DEFAULT 0", shipping_address: "TEXT NOT NULL DEFAULT ''", placed_at: "TEXT NOT NULL DEFAULT ''", tax_amount: "REAL NOT NULL DEFAULT 0", delivery_window: "TEXT NOT NULL DEFAULT ''", delivery_schedule: "TEXT NOT NULL DEFAULT 'same-day'", refund_requested: "INTEGER NOT NULL DEFAULT 0", payment_method_detail: "TEXT",
    });
    await addMissingColumns("order_items", {
      product_id: "INTEGER NOT NULL DEFAULT 0", product_name: "TEXT NOT NULL DEFAULT ''", quantity: "INTEGER NOT NULL DEFAULT 1", unit_price: "REAL NOT NULL DEFAULT 0", unit: "TEXT NOT NULL DEFAULT ''", image_url: "TEXT",
    });
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

function customerId(req) {
  const id = Number(req.user?.userId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}


async function insertOrderItem(tx, schema, orderId, item) {
  const values = {
    order_id: orderId, product_id: item.product_id, product_name: item.product_name,
    name: item.product_name, quantity: item.quantity, qty: item.quantity,
    unit_price: item.price, price: item.price, subtotal: Number(item.price) * item.quantity,
    total_price: Number(item.price) * item.quantity, unit: item.unit || "",
    image_url: item.image_url || null,
  };
  const columns = schema.filter((column) => !(Number(column.pk) && String(column.name).toLowerCase().endsWith("id") && column.name !== "order_id" && column.name !== "product_id"));
  const insertColumns = [];
  const args = [];
  for (const column of columns) {
    if (Object.prototype.hasOwnProperty.call(values, column.name)) {
      insertColumns.push(column.name);
      args.push(values[column.name]);
    } else if (Number(column.notnull) && column.dflt_value == null) {
      throw new Error(`Unsupported required order_items column: ${column.name}`);
    }
  }
  await tx.execute({ sql: `INSERT INTO order_items (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`, args });
}
function normalize(row, items) {
  const status = ({ Pending: "Confirmed", Packed: "Packed at Farm Hub", "Out for Delivery": "Out for Delivery", Delivered: "Delivered" })[row.order_status] || "Confirmed";
  return {
    id: `FOV-${row.order_id}`, createdAt: row.placed_at, status,
    items: items.map((item) => ({ id: Number(item.product_id), name: item.product_name, price: Number(item.unit_price), unit: item.unit || "", qty: Number(item.quantity), image: productImageUrl(item.image_url) })),
    total: Number(row.total_amount), address: row.shipping_address, payment: row.payment_method_detail || row.payment_method,
    deliveryWindow: row.delivery_window || "", deliverySchedule: row.delivery_schedule || "same-day", refundRequested: Boolean(row.refund_requested),
  };
}

app.get("/orders", authenticated, async (req, res) => {
  const userId = customerId(req);
  if (!userId) return res.status(401).json({ error: "Invalid customer account" });
  try {
    await ensureSchema();
    const result = await db.execute({ sql: "SELECT * FROM orders WHERE user_id = ? ORDER BY placed_at DESC, order_id DESC", args: [userId] });
    const rows = result.rows;
    if (!rows.length) return res.json([]);
    const itemResult = await db.execute({ sql: `SELECT * FROM order_items WHERE order_id IN (${rows.map(() => "?").join(",")}) ORDER BY rowid`, args: rows.map((row) => row.order_id) });
    const grouped = new Map();
    for (const item of itemResult.rows) {
      const id = Number(item.order_id);
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(item);
    }
    return res.json(rows.map((row) => normalize(row, grouped.get(Number(row.order_id)) || [])));
  } catch (error) {
    console.error("Error loading customer orders:", error);
    return res.status(500).json({ error: "Failed to load orders" });
  }
});

app.post("/orders", authenticated, async (req, res) => {
  const userId = customerId(req);
  const requested = req.body?.items;
  const address = String(req.body?.address || "").trim();
  const requestedPayment = String(req.body?.payment || "").trim();
  const paymentMap = {
    "Cash on Delivery": { stored: "Cash on Delivery", detail: "Cash on Delivery" },
    Cash: { stored: "Cash", detail: "Cash" },
    "Cashless Wallet": { stored: "Credit Card", detail: "Cashless Wallet" },
    "Credit Card": { stored: "Credit Card", detail: "Credit Card" },
  };
  const payment = paymentMap[requestedPayment];
  const deliveryWindow = String(req.body?.deliveryWindow || "").trim();
  const deliveryFee = Number(req.body?.deliveryFee);
  if (!userId) return res.status(401).json({ error: "Invalid customer account" });
  if (!Array.isArray(requested) || !requested.length || requested.length > 100 || !address || !payment || !deliveryWindow || !Number.isFinite(deliveryFee) || deliveryFee < 0) return res.status(400).json({ error: "A valid order, address, payment method and delivery time are required" });
  const quantities = new Map();
  for (const item of requested) {
    const id = Number(item?.id), qty = Number(item?.qty);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(qty) || qty < 1 || qty > 999) return res.status(400).json({ error: "Order items must have valid product IDs and quantities" });
    quantities.set(id, (quantities.get(id) || 0) + qty);
  }
  try {
    await ensureSchema();
    const ids = [...quantities.keys()];
    const result = await db.execute({ sql: `SELECT product_id, product_name, price, stock_quantity, unit, image_url FROM products WHERE is_active = 1 AND product_id IN (${ids.map(() => "?").join(",")})`, args: ids });
    if (result.rows.length !== ids.length) return res.status(409).json({ error: "One or more products are no longer available" });
    for (const product of result.rows) if (quantities.get(Number(product.product_id)) > Number(product.stock_quantity)) return res.status(409).json({ error: `${product.product_name} no longer has enough stock` });
    const items = result.rows.map((product) => ({ ...product, quantity: quantities.get(Number(product.product_id)) }));
    const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const tax = Math.round(subtotal * 0.04);
    const total = subtotal + tax + deliveryFee;
    const placedAt = new Date().toISOString();
    const schedule = req.body?.deliverySchedule === "standard" ? "standard" : "same-day";
    const orderItemSchema = (await db.execute("PRAGMA table_info(order_items)")).rows;
    const tx = await db.transaction("write");
    try {
      const inserted = await tx.execute({ sql: "INSERT INTO orders (user_id, order_status, payment_method, subtotal, delivery_fee, total_amount, shipping_address, placed_at, tax_amount, delivery_window, delivery_schedule, payment_method_detail) VALUES (?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [userId, payment.stored, subtotal, deliveryFee, total, address, placedAt, tax, deliveryWindow, schedule, payment.detail] });
      const orderId = Number(inserted.lastInsertRowid);
      for (const item of items) await insertOrderItem(tx, orderItemSchema, orderId, item);
      await tx.execute({ sql: "DELETE FROM cart WHERE user_id = ?", args: [userId] });
      await tx.commit();
      return res.status(201).json(normalize({ order_id: orderId, placed_at: placedAt, order_status: "Pending", total_amount: total, shipping_address: address, payment_method: payment.stored, payment_method_detail: payment.detail, delivery_window: deliveryWindow, delivery_schedule: schedule, refund_requested: 0 }, items.map((item) => ({ ...item, unit_price: item.price }))));
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error creating customer order:", error);
    return res.status(500).json({
      error: "Failed to save order",
      ...(process.env.NODE_ENV === "production" ? {} : { details: error.message }),
    });
  }
});

app.post("/orders/:orderId/refund", authenticated, async (req, res) => {
  const userId = customerId(req);
  const match = /^FOV-(\d+)$/.exec(String(req.params.orderId));
  if (!userId) return res.status(401).json({ error: "Invalid customer account" });
  if (!match) return res.status(400).json({ error: "Invalid order ID" });
  try {
    await ensureSchema();
    const result = await db.execute({ sql: "UPDATE orders SET refund_requested = 1 WHERE order_id = ? AND user_id = ?", args: [Number(match[1]), userId] });
    if (!Number(result.rowsAffected)) return res.status(404).json({ error: "Order not found" });
    return res.sendStatus(204);
  } catch (error) {
    console.error("Error requesting order refund:", error);
    return res.status(500).json({ error: "Failed to request refund" });
  }
});
module.exports = app;


