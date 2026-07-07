const axios = require("axios"); // nhớ: npm install axios
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

const { findPartById } = require("../data/playlists");
const {
  signCheckpoint,
  verifyCheckpointSig,
  issueUnlockToken
} = require("../utils/token");

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MINUTES || 20) * 60 * 1000;
const BACKEND_URL = process.env.BACKEND_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Số link cần vượt qua để mở khóa 1 tập. Đã chỉnh thành 2 (vì dùng Link4m rate cao).
const TOTAL_STEPS = 2;

// Lấy thông tin API từ file .env
const SHORTLINK_API_TOKEN = process.env.SHORTLINK_API_TOKEN;
const SHORTLINK_API_BASE = process.env.SHORTLINK_API_BASE; // Vd: https://link4m.co/api-shorten/v2

// ------------------------------------------------------------
// LƯU SESSION TRONG MEMORY (demo). Production nên dùng Redis
// để chạy được nhiều instance server và tự động hết hạn (TTL).
// ------------------------------------------------------------
const sessions = new Map();
// sessions.set(sessionId, { videoId, step, createdAt, expiresAt, consumed })

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now > s.expiresAt) sessions.delete(id);
  }
}
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

// Tạo URL callback mà shortlink service sẽ redirect user về sau khi họ
// hoàn thành lấy mã ở link rút gọn đó.
function buildCheckpointUrl(sessionId, step) {
  const sig = signCheckpoint(sessionId, step);
  return `${BACKEND_URL}/api/unlock/checkpoint?sessionId=${sessionId}&step=${step}&sig=${sig}`;
}

// Gọi API thật của Link4m để tạo 1 link rút gọn trỏ tới callbackUrl
async function buildShortlinkRedirect(step, callbackUrl) {
  const apiUrl = `${SHORTLINK_API_BASE}?api=${SHORTLINK_API_TOKEN}&url=${encodeURIComponent(callbackUrl)}`;

  try {
    const res = await axios.get(apiUrl);
    
    if (res.data && res.data.status === "success") {
      return res.data.shortenedUrl;
    } else {
      throw new Error(res.data ? res.data.message : "Link4m trả về lỗi không xác định");
    }
  } catch (err) {
    console.error(`Lỗi tạo shortlink Link4m ở bước ${step}:`, err.message);
    throw new Error("Không thể tạo link rút gọn");
  }
}

// ============================================================
// POST /api/unlock/start
// Body: { videoId }
// Bắt đầu 1 phiên vượt link cho videoId, trả về link rút gọn bước 1
// ============================================================
router.post("/start", async (req, res) => {
  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: "Thiếu videoId" });

  const found = findPartById(videoId);
  if (!found) return res.status(404).json({ error: "Không tìm thấy tập phim" });
  if (!found.part.locked) {
    return res.status(400).json({ error: "Tập này không bị khóa, không cần vượt link" });
  }

  const sessionId = uuidv4();
  const now = Date.now();
  sessions.set(sessionId, {
    videoId,
    step: 0,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    consumed: false
  });

  const callbackUrl = buildCheckpointUrl(sessionId, 1);
  
  try {
    const redirectUrl = await buildShortlinkRedirect(1, callbackUrl);
    res.json({ sessionId, step: 1, totalSteps: TOTAL_STEPS, redirectUrl });
  } catch (err) {
    res.status(500).json({ error: "Hệ thống rút gọn link đang bận, vui lòng thử lại sau." });
  }
});

// ============================================================
// GET /api/unlock/checkpoint?sessionId=&step=&sig=
// Shortlink service redirect user về đây sau khi qua nhiệm vụ.
// ============================================================
router.get("/checkpoint", async (req, res) => {
  const { sessionId, step, sig } = req.query;
  const stepNum = Number(step);

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(400).send(renderErrorPage("Phiên vượt link không tồn tại hoặc đã hết hạn."));
  }
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return res.status(400).send(renderErrorPage("Phiên vượt link đã hết hạn, vui lòng bắt đầu lại."));
  }
  if (session.consumed) {
    return res.status(400).send(renderErrorPage("Phiên này đã được sử dụng."));
  }
  if (!verifyCheckpointSig(sessionId, stepNum, sig)) {
    return res.status(400).send(renderErrorPage("Chữ ký không hợp lệ. Có dấu hiệu can thiệp URL."));
  }
  // Chống nhảy cóc: step gửi lên phải đúng bằng step tiếp theo cần hoàn thành
  if (stepNum !== session.step + 1) {
    return res.status(400).send(renderErrorPage("Bạn cần hoàn thành các bước theo đúng thứ tự."));
  }

  // Hợp lệ -> cập nhật tiến độ
  session.step = stepNum;

  if (stepNum < TOTAL_STEPS) {
    const nextStep = stepNum + 1;
    const callbackUrl = buildCheckpointUrl(sessionId, nextStep);
    
    try {
      const redirectUrl = await buildShortlinkRedirect(nextStep, callbackUrl);
      return res.send(renderNextStepPage(stepNum, nextStep, redirectUrl));
    } catch (err) {
      return res.status(500).send(renderErrorPage("Không thể tạo bước tiếp theo, vui lòng tải lại trang."));
    }
  }

  // Hoàn thành đủ TOTAL_STEPS bước -> cấp unlock token và redirect về trang xem video
  session.consumed = true;
  const unlockToken = issueUnlockToken(session.videoId, sessionId);
  const watchUrl = `${FRONTEND_URL}/index.html?video=${session.videoId}&token=${unlockToken}`;
  return res.redirect(watchUrl);
});

// ------------------------------------------------------------
// Các trang HTML tối giản để hiển thị tiến độ cho user
// ------------------------------------------------------------
function renderNextStepPage(completedStep, nextStep, redirectUrl) {
  return `
    <html><head><meta charset="utf-8"><title>Đang xác thực...</title>
    <style>
      body{background:#12121c;color:#eee;font-family:sans-serif;display:flex;
        flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}
      .card{background:#1e1e2e;padding:32px 40px;border-radius:12px;text-align:center;max-width:400px}
      .btn{display:inline-block;margin-top:20px;padding:12px 24px;background:#7c3aed;
        color:#fff;border-radius:8px;text-decoration:none;font-weight:600}
      .progress{color:#8b8ba7;margin-top:8px}
    </style></head>
    <body>
      <div class="card">
        <h2>✅ Hoàn thành bước ${completedStep}/${TOTAL_STEPS}</h2>
        <p class="progress">Còn ${TOTAL_STEPS - completedStep} bước nữa để mở khóa tập phim</p>
        <a class="btn" href="${redirectUrl}">Tiếp tục bước ${nextStep}/${TOTAL_STEPS} →</a>
      </div>
    </body></html>
  `;
}

function renderErrorPage(message) {
  return `
    <html><head><meta charset="utf-8"><title>Lỗi</title>
    <style>
      body{background:#12121c;color:#eee;font-family:sans-serif;display:flex;
        align-items:center;justify-content:center;height:100vh;margin:0}
      .card{background:#2a1520;padding:32px 40px;border-radius:12px;text-align:center;max-width:400px}
    </style></head>
    <body><div class="card"><h2>⚠️ ${message}</h2></div></body></html>
  `;
}

module.exports = router;