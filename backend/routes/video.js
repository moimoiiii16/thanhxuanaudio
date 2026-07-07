const express = require("express");
const router = express.Router();

const { findPartById } = require("../data/playlists");
const { verifyUnlockToken } = require("../utils/token");

// ============================================================
// GET /api/video/:videoId?token=xxx
// Trả về video source THẬT nếu:
//  - Part đó không bị khóa (Part 1), HOẶC
//  - Có unlockToken hợp lệ, đúng videoId, chưa hết hạn
// ============================================================
router.get("/:videoId", (req, res) => {
  const { videoId } = req.params;
  const { token } = req.query;

  const found = findPartById(videoId);
  if (!found) return res.status(404).json({ error: "Không tìm thấy tập phim" });

  const { part } = found;

  // Part miễn phí -> trả luôn
  if (!part.locked) {
    return res.json({ videoUrl: part.videoUrl, locked: false });
  }

  // Part bị khóa -> bắt buộc phải có token hợp lệ
  if (!token) {
    return res.status(403).json({ error: "Cần vượt link để mở khóa tập này", locked: true });
  }

  const decoded = verifyUnlockToken(token);
  if (!decoded) {
    return res.status(403).json({ error: "Token không hợp lệ hoặc đã hết hạn", locked: true });
  }
  if (decoded.videoId !== videoId) {
    return res.status(403).json({ error: "Token không khớp với tập phim này", locked: true });
  }

  // Token hợp lệ -> trả video source thật
  //
  // CÁCH THÊM AUDIO CỦA BẠN CHO CÁC PHẦN BỊ KHÓA:
  // 1. Copy file audio vào backend/public/media/
  // 2. Thêm 1 dòng vào object bên dưới: "id-cua-part": "URL-file-audio"
  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
  const REAL_VIDEO_SOURCES = {
    "tddt-p2": `${BACKEND_URL}/media/tddt-p2.mp3`,
    "tddt-p3": `${BACKEND_URL}/media/tddt-p3.mp3`,
    "vtkd-p2": `${BACKEND_URL}/media/vtkd-p2.mp3`
  };

  const videoUrl = REAL_VIDEO_SOURCES[videoId];
  if (!videoUrl) return res.status(404).json({ error: "Video source chưa được cấu hình" });

  return res.json({ videoUrl, locked: false });
});

module.exports = router;
