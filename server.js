const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const cookieParser = require("cookie-parser");
const app = express();
const PORT = process.env.PORT || 3000;

<<<<<<< HEAD
app.use(express.json());
app.use(cookieParser());
const allowedOrigins = new Set([
  "http://localhost",
  "http://localhost:8100",
  "http://localhost:4200",
  "capacitor://localhost",
  "ionic://localhost",
  ...(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
=======
const allowedOrigins = new Set([
  "http://localhost",
  "http://localhost:8100",
  "http://127.0.0.1:8100",
  "http://localhost:4200",
  "capacitor://localhost",
  "ionic://localhost",
  ...(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
  ...(process.env.FRONTEND_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(origin && !allowedOrigins.has(origin) ? 403 : 204);
  }
  next();
});

app.use(express.json());
app.use(cookieParser());
>>>>>>> e017a9ac29e35ac5bfab063586bbae364d55134c
const routersPath = path.join(__dirname, "routes");

// Recursively load routes
function loadRoutes(directory) {
  fs.readdirSync(directory).forEach((file) => {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    // If it's a folder, search inside it
    // but DON'T add the folder name to the route
    if (stat.isDirectory()) {
      loadRoutes(filePath);
    }

    // If it's a JS file, load it
    else if (file.endsWith(".js")) {
      const router = require(filePath);

      const defaultName = path.basename(file, ".js");
      const routePrefix = router.customPath || `/${defaultName}`;

      app.use(routePrefix, router);

      console.log(`Mounted ${filePath} -> ${routePrefix}`);
    }
  });
}

loadRoutes(routersPath);

const filesPath = path.join(__dirname, "/files");

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(filesPath));

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});
module.exports = app;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
