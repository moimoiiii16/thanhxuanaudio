const jwt = require("jsonwebtoken");

const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;

function issueAuthToken(userId, username, displayName, role) {
  return jwt.sign(
    { userId, username, displayName, role },
    AUTH_JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function verifyAuthToken(token) {
  try {
    return jwt.verify(token, AUTH_JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { issueAuthToken, verifyAuthToken };