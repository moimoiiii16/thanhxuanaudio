const express = require("express");
const router = express.Router();

const { findPartById } = require("../data/playlists");
const { verifyUnlockToken } = require("../utils/token");
const { getSignedAudioUrl } = require("../utils/b2");

// ============================================================
// GET /api/video/:videoId?token=xxx
// Trả về video source THẬT (link tạm thời từ Backblaze) nếu:
//  - Part đó không bị khóa (Part 1), HOẶC
//  - Có unlockToken hợp lệ, đúng videoId, chưa hết hạn
// ============================================================
router.get("/:videoId", async (req, res) => {
  const { videoId } = req.params;
  const { token } = req.query;

  const found = findPartById(videoId);
  if (!found) return res.status(404).json({ error: "Không tìm thấy tập phim" });

  const { part } = found;

  try {
    // Part miễn phí -> trả luôn, không cần token
    if (!part.locked) {
      const videoUrl = await getSignedAudioUrl(part.audioFile);
      return res.json({ videoUrl, locked: false });
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

    // Token hợp lệ -> tạo signed URL thật từ Backblaze
    if (!part.audioFile) {
      return res.status(404).json({ error: "Audio của tập này chưa được cấu hình" });
    }

    const videoUrl = await getSignedAudioUrl(part.audioFile);
    return res.json({ videoUrl, locked: false });
  } catch (err) {
    console.error("Lỗi tạo signed URL cho video:", videoId, err.message);
    return res.status(500).json({ error: "Không thể tải audio lúc này, vui lòng thử lại." });
  }
});

module.exports = router;