const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

const User = require("../models/User");
const { issueAuthToken } = require("../utils/authToken");

// ============================================================
// POST /api/auth/register
// Body: { username, password }
// ============================================================
router.post("/register", async (req, res) => {
  const { username, displayName, password } = req.body;

  if (!username || !displayName || !password) {
    return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password phải có ít nhất 6 ký tự" });
  }

  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: "Username đã tồn tại" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, displayName, passwordHash });

    const token = issueAuthToken(user._id, user.username, user.displayName, user.role);
    res.json({ token, username: user.username, displayName: user.displayName, role: user.role });
  } catch (err) {
    console.error("Lỗi đăng ký:", err.message);
    res.status(500).json({ error: "Lỗi máy chủ, thử lại sau" });
  }
});

// ============================================================
// POST /api/auth/login
// Body: { username, password }
// ============================================================
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Thiếu username hoặc password" });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Sai username hoặc password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Sai username hoặc password" });
    }

    const token = issueAuthToken(user._id, user.username, user.displayName, user.role);
    res.json({ token, username: user.username, displayName: user.displayName, role: user.role });
  } catch (err) {
    console.error("Lỗi đăng nhập:", err.message);
    res.status(500).json({ error: "Lỗi máy chủ, thử lại sau" });
  }
});

module.exports = router;