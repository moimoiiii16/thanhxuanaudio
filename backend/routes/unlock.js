const axios = require("axios"); // nhớ: npm install axios
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

const Playlist = require("../models/Playlist");
const {
  signCheckpoint,
  verifyCheckpointSig,
  issueUnlockToken
} = require("../utils/token");

const UnlockedPart = require("../models/UnlockedPart");
const { optionalAuth } = require("../middleware/auth");

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
// sessions.set(sessionId, {
//   sessionId, videoId, step, createdAt, expiresAt,
//   consumed, finalUrl,
//   stepResults: Map<stepNum, Promise<result>>   // cache/idempotency theo từng bước
// })

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
router.post("/start", optionalAuth, async (req, res) => {
  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: "Thiếu videoId" });

  const found = await Playlist.findPartById(videoId);
  if (!found) return res.status(404).json({ error: "Không tìm thấy tập phim" });
  if (!found.part.locked) {
    return res.status(400).json({ error: "Tập này không bị khóa, không cần vượt link" });
  }

  const sessionId = uuidv4();
  const now = Date.now();
  sessions.set(sessionId, {
    sessionId,
    videoId,
    step: 0,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    consumed: false,
    finalUrl: null,
    stepResults: new Map(),
    userId: req.user ? req.user.userId : null
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
// Xử lý thật sự cho 1 bước (chỉ được gọi ĐÚNG 1 LẦN cho mỗi bước
// của mỗi session — nhờ được "claim" atomically trong handler bên dưới).
// Trả về 1 object mô tả kết quả để render/redirect, và được cache lại
// dưới dạng Promise trong session.stepResults để mọi request trùng
// (đến trước, trong, hay sau khi xử lý xong) đều nhận được cùng 1 kết quả.
// ============================================================
async function processStep(session, stepNum) {
  console.log(`[checkpoint] BẮT ĐẦU xử lý sessionId=${session.sessionId} step=${stepNum} t=${Date.now()}`);

  if (stepNum < TOTAL_STEPS) {
    const nextStep = stepNum + 1;
    const callbackUrl = buildCheckpointUrl(session.sessionId, nextStep);
    try {
      const redirectUrl = await buildShortlinkRedirect(nextStep, callbackUrl);
      console.log(`[checkpoint] XONG step=${stepNum} -> tạo redirect cho step=${nextStep} t=${Date.now()}`);
      return { type: "next", completedStep: stepNum, nextStep, redirectUrl };
    } catch (err) {
      console.error(`[checkpoint] LỖI khi tạo bước tiếp theo cho sessionId=${session.sessionId}:`, err.message);
      return { type: "error", message: "Không thể tạo bước tiếp theo, vui lòng tải lại trang." };
    }
  }

  // Bước cuối cùng -> cấp unlock token
  const unlockToken = issueUnlockToken(session.videoId, session.sessionId);
  const watchUrl = `${FRONTEND_URL}/index.html?video=${session.videoId}&token=${unlockToken}`;
  session.finalUrl = watchUrl;
  session.consumed = true;

  // Nếu user đã đăng nhập lúc bắt đầu vượt link -> lưu vĩnh viễn vào DB,
  // để lần sau họ không cần vượt link lại tập này nữa.
  if (session.userId) {
    try {
      await UnlockedPart.updateOne(
        { userId: session.userId, partId: session.videoId },
        { $setOnInsert: { userId: session.userId, partId: session.videoId } },
        { upsert: true }
      );
      console.log(`[checkpoint] Đã lưu unlock vĩnh viễn userId=${session.userId} partId=${session.videoId}`);
    } catch (err) {
      console.error("Lỗi lưu UnlockedPart:", err.message);
      // Không chặn user xem video dù việc lưu DB bị lỗi, chỉ log lại để theo dõi
    }
  }

  console.log(`[checkpoint] HOÀN TẤT sessionId=${session.sessionId}, cấp token, watchUrl=${watchUrl} t=${Date.now()}`);
  return { type: "final", url: watchUrl };
}

function sendStepResult(res, result) {
  if (result.type === "next") {
    return res.send(renderNextStepPage(result.completedStep, result.nextStep, result.redirectUrl));
  }
  if (result.type === "final") {
    return res.redirect(result.url);
  }
  // type === "error"
  return res.status(500).send(renderErrorPage(result.message || "Có lỗi xảy ra, vui lòng thử lại."));
}

// ============================================================
// GET /api/unlock/checkpoint?sessionId=&step=&sig=
// Shortlink service redirect user về đây sau khi qua nhiệm vụ.
// ============================================================
router.get("/checkpoint", async (req, res) => {
  const { sessionId, step, sig } = req.query;
  const stepNum = Number(step);

  console.log(`[checkpoint] NHẬN request sessionId=${sessionId} step=${stepNum} t=${Date.now()}`);

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(400).send(renderErrorPage("Phiên vượt link không tồn tại hoặc đã hết hạn."));
  }
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return res.status(400).send(renderErrorPage("Phiên vượt link đã hết hạn, vui lòng bắt đầu lại."));
  }
  if (!verifyCheckpointSig(sessionId, stepNum, sig)) {
    return res.status(400).send(renderErrorPage("Chữ ký không hợp lệ. Có dấu hiệu can thiệp URL."));
  }

  // ----------------------------------------------------------
  // Bước này ĐÃ được claim trước đó (đang xử lý hoặc đã xử lý xong)
  // -> đây là request trùng (Link4m gọi callback 2 lần, user bấm back, v.v).
  // KHÔNG báo lỗi, KHÔNG chạy lại logic — chỉ "phát lại" đúng kết quả
  // của lần xử lý gốc (chờ nó xử lý xong nếu vẫn đang await).
  // ----------------------------------------------------------
  if (stepNum <= session.step) {
    const cached = session.stepResults.get(stepNum);
    if (cached) {
      console.log(`[checkpoint] TRÙNG LẶP phát hiện sessionId=${sessionId} step=${stepNum} -> trả lại kết quả cache t=${Date.now()}`);
      const result = await cached;
      return sendStepResult(res, result);
    }
    // Trường hợp hiếm gặp: step đã qua nhưng không còn cache (server restart mất RAM, v.v.)
    return res.status(400).send(renderErrorPage("Phiên này đã được sử dụng."));
  }

  // Chống nhảy cóc: step gửi lên phải đúng bằng step tiếp theo cần hoàn thành
  if (stepNum !== session.step + 1) {
    return res.status(400).send(renderErrorPage("Bạn cần hoàn thành các bước theo đúng thứ tự."));
  }

  // ----------------------------------------------------------
  // CLAIM bước này NGAY LẬP TỨC (đồng bộ, trước bất kỳ await nào)
  // rồi mới bắt đầu xử lý bất đồng bộ. Nhờ vậy, bất kỳ request trùng
  // nào đến sau dòng này (kể cả đến giữa lúc đang await bên trong
  // processStep) đều sẽ rơi vào nhánh "stepNum <= session.step" ở trên
  // và được cấp cùng 1 kết quả, thay vì bị coi là sai thứ tự hoặc lỗi.
  // ----------------------------------------------------------
  session.step = stepNum;
  const resultPromise = processStep(session, stepNum);
  session.stepResults.set(stepNum, resultPromise);

  const result = await resultPromise;
  return sendStepResult(res, result);
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