const { verifyAuthToken } = require("../utils/authToken");

// Không bắt buộc đăng nhập — nếu có token hợp lệ trong header thì gắn
// req.user, không có/sai thì vẫn cho đi tiếp (req.user sẽ là undefined).
// Dùng cho các route mà cả khách vãng lai lẫn user đăng nhập đều dùng được,
// nhưng có thể cư xử khác nhau tùy có đăng nhập hay không.
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const decoded = verifyAuthToken(token);
    if (decoded) {
      req.user = decoded; // { userId, username, role }
    }
  }
  next();
}

// Bắt buộc đăng nhập — chặn nếu không có token hợp lệ.
// Dùng cho các route riêng tư (VD trang quản trị sau này).
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Cần đăng nhập" });
  }
  const token = authHeader.slice(7);
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Token đăng nhập không hợp lệ hoặc đã hết hạn" });
  }
  req.user = decoded;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Bạn không có quyền admin" });
  }
  next();
}

module.exports = { optionalAuth, requireAuth, requireAdmin };