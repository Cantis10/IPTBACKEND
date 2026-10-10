const db = require("./database");

async function initializeDatabase() {
  const result = await db.execute("PRAGMA table_info(products)");
  const hasActiveColumn = result.rows.some((column) => column.name === "is_active");

  if (!hasActiveColumn) {
    await db.execute(`
      ALTER TABLE products
      ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1
      CHECK (is_active IN (0, 1))
    `);
    console.log("Added products.is_active column; existing products remain active.");
  }
}

module.exports = initializeDatabase;
