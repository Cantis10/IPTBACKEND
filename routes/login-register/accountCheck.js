const express = require("express");
const app = express.Router();
const { checkAuth } = require("../../imports/token");

app.customPath = "/api";

app.get("/isLoggedIn", checkAuth("user"), (req, res) => {
  return res.status(200).json({
    loggedIn: true,
    user: req.user,
  });
});

module.exports = app;
