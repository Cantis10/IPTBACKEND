const express = require("express");
const app = express.Router();
const { checkAuth } = require("../../imports/token");


const JWT_SECRET = process.env.JWT_SECRET;

app.customPath = "/api";

app.get("/isLoggedIn", checkAuth("user"), (req, res) => {
  console.log("account checked");
  return res.status(200).json({
    loggedIn: true,
    user: req.user
  });
});


module.exports = app;
