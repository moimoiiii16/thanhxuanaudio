const express = require("express");
const router = express.Router();

const Playlist = require("../models/Playlist");
const { verifyUnlockToken } = require("../utils/token");
const { getSignedAudioUrl } = require("../utils/b2");
const UnlockedPart = require("../models/UnlockedPart");
const { optionalAuth } = require("../middleware/auth");

// ============================================================
// GET /api/video/:videoId?token=xxx
// Trả về video source THẬT (link tạm thời từ Backblaze) nếu:
//  - Part đó không bị khóa (Part 1), HOẶC
//  - User đã đăng nhập VÀ đã từng mở khóa tập này trước đây, HOẶC
//  - Có unlockToken hợp lệ, đúng videoId, chưa hết hạn
// ============================================================
router.get("/:videoId", optionalAuth, async (req, res) => {
  const { videoId } = req.params;
  const { token } = req.query;

  const found = await Playlist.findPartById(videoId);
  if (!found) return res.status(404).json({ error: "Không tìm thấy tập phim" });

  const { part } = found;

  try {
    // Part miễn phí -> trả luôn, không cần token
    if (!part.locked) {
      const videoUrl = await getSignedAudioUrl(part.audioFile);
      return res.json({ videoUrl, locked: false });
    }

    // Nếu user đã đăng nhập và đã mở khóa tập này ở lần trước -> cho xem luôn
    if (req.user) {
      const existing = await UnlockedPart.findOne({ userId: req.user.userId, partId: videoId });
      if (existing) {
        const videoUrl = await getSignedAudioUrl(part.audioFile);
        return res.json({ videoUrl, locked: false });
      }
    }

    // Chưa đăng nhập hoặc chưa từng mở khóa -> bắt buộc phải có token vượt link
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