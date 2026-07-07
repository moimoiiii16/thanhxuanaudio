const express = require("express");
const router = express.Router();
const { getAllPlaylists, getPlaylistById } = require("../data/playlists");
const { getSignedAudioUrl } = require("../utils/b2");

// GET /api/playlists -> danh sách tất cả playlist cho trang chủ
router.get("/", (req, res) => {
  res.json(getAllPlaylists());
});

// GET /api/playlists/:id -> chi tiết 1 playlist + danh sách part
router.get("/:id", async (req, res) => {
  const playlist = getPlaylistById(req.params.id);
  if (!playlist) return res.status(404).json({ error: "Không tìm thấy bộ truyện" });

  try {
    const parts = await Promise.all(
      playlist.parts.map(async (part) => {
        // Part bị khóa: không tạo link audio ở đây, user phải vượt link
        // để lấy qua /api/video/:videoId
        if (part.locked || !part.audioFile) {
          return {
            id: part.id,
            partNumber: part.partNumber,
            title: part.title,
            duration: part.duration,
            locked: part.locked,
            videoUrl: null
          };
        }

        // Part miễn phí: tạo signed URL thật từ Backblaze ngay lúc trả response
        const videoUrl = await getSignedAudioUrl(part.audioFile);
        return {
          id: part.id,
          partNumber: part.partNumber,
          title: part.title,
          duration: part.duration,
          locked: part.locked,
          videoUrl
        };
      })
    );

    res.json({ ...playlist, parts });
  } catch (err) {
    console.error("Lỗi tạo signed URL cho playlist:", req.params.id, err.message);
    res.status(500).json({ error: "Không thể tải audio lúc này, vui lòng thử lại." });
  }
});

module.exports = router;