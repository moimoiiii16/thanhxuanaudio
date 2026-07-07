const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const CHECKPOINT_SECRET = process.env.CHECKPOINT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const UNLOCK_TOKEN_TTL_HOURS = Number(process.env.UNLOCK_TOKEN_TTL_HOURS || 4);

// ------------------------------------------------------------
// 1) HMAC signature cho từng checkpoint (bước 1/2/3)
// Mục đích: chống user tự sửa query string (?step=3) để nhảy cóc
// mà không hoàn thành các bước trước đó.
// ------------------------------------------------------------
function signCheckpoint(sessionId, step) {
  const payload = `${sessionId}:${step}`;
  return crypto.createHmac("sha256", CHECKPOINT_SECRET).update(payload).digest("hex");
}

function verifyCheckpointSig(sessionId, step, sig) {
  const expected = signCheckpoint(sessionId, step);
  // dùng timingSafeEqual để tránh timing attack khi so sánh chuỗi
  const a = Buffer.from(expected);
  const b = Buffer.from(sig || "");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ------------------------------------------------------------
// 2) JWT unlock token - cấp SAU KHI hoàn thành cả 3 checkpoint
// Token này gắn chặt với 1 videoId cụ thể + thời hạn ngắn
// ------------------------------------------------------------
function issueUnlockToken(videoId, sessionId) {
  return jwt.sign(
    { videoId, sessionId, purpose: "unlock" },
    JWT_SECRET,
    { expiresIn: `${UNLOCK_TOKEN_TTL_HOURS}h` }
  );
}

function verifyUnlockToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== "unlock") return null;
    return decoded; // { videoId, sessionId, iat, exp }
  } catch (err) {
    return null; // hết hạn hoặc sai chữ ký
  }
}

module.exports = {
  signCheckpoint,
  verifyCheckpointSig,
  issueUnlockToken,
  verifyUnlockToken
};
