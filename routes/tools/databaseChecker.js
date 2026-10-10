/**
 * GO TO
 * /api/databaseChecker
 *
 * IF YOU WANNA SEE THE TABLE!
 *
 */

const express = require("express");
const app = express.Router();
const db = require("../../imports/database");
const path = require("path");
const { requireAuth } = require("../../imports/token");

app.customPath = "/api/databaseChecker";
// helper: run a query and return { rows, columns }
async function query(sql, args = []) {
  const result = await db.execute({ sql, args });
  return { rows: result.rows, columns: result.columns.map((c) => c.name ?? c) };
}
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../files/databaseMan.html"));
});

app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "../../files/databaseMan.html"));
});

// GET /api/databaseChecker/tables
app.get("/tables", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    const tables = rows.map((r) => ({ name: r.name ?? r[0] }));
    res.json({ tables, database: "Turso", engine: "libSQL/SQLite" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/databaseChecker/table-data
app.get("/table-data", async (req, res) => {
  const { table, page = 1, limit = 50, sort, dir = "asc", filter } = req.query;
  if (!table) return res.status(400).json({ error: "table is required" });
  const offset = (page - 1) * limit;
  const safeDir = dir === "desc" ? "DESC" : "ASC";
  const orderClause = sort ? `ORDER BY "${sort}" ${safeDir}` : "";

  try {
    // get column names for filter
    let whereClause = "";
    let countArgs = [];
    let dataArgs = [+limit, +offset];

    if (filter) {
      const { rows: colRows } = await query(`PRAGMA table_info("${table}")`);
      const colNames = colRows.map((c) => c.name ?? c[1]);
      const likeExpr = colNames
        .map((c) => `CAST("${c}" AS TEXT) LIKE ?`)
        .join(" OR ");
      whereClause = `WHERE (${likeExpr})`;
      const likeArgs = colNames.map(() => `%${filter}%`);
      countArgs = likeArgs;
      dataArgs = [...likeArgs, +limit, +offset];
    }

    const { rows: countRows } = await query(
      `SELECT COUNT(*) as total FROM "${table}" ${whereClause}`,
      countArgs,
    );
    const total = countRows[0].total ?? countRows[0][0];

    const { rows, columns } = await query(
      `SELECT * FROM "${table}" ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      dataArgs,
    );
    res.json({ rows, columns, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/databaseChecker/schema
app.get("/schema", async (req, res) => {
  try {
    const { rows: tableRows } = await query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    const schema = [];
    for (const t of tableRows) {
      const tableName = t.name ?? t[0];
      const { rows: cols } = await query(`PRAGMA table_info("${tableName}")`);
      schema.push({
        name: tableName,
        columns: cols.map((c) => ({
          name: c.name ?? c[1],
          type: c.type ?? c[2],
          nullable: (c.notnull ?? c[3]) === 0,
          default: c.dflt_value ?? c[4],
          pk: (c.pk ?? c[5]) > 0,
        })),
      });
    }
    res.json({ schema });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/databaseChecker/query  { sql }
app.post("/query", async (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: "sql is required" });
  try {
    const { rows, columns } = await query(sql);
    res.json({ rows, columns, affectedRows: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
