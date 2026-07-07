const express = require("express");
const router = express.Router();
const Playlist = require("../models/Playlist");
const { getSignedAudioUrl } = require("../utils/b2");

// GET /api/playlists -> danh sách tất cả playlist cho trang chủ
router.get("/", async (req, res) => {
  try {
    const playlists = await Playlist.find({});
    const result = playlists.map((p) => ({
      id: p.id,
      title: p.title,
      cover: p.cover,
      description: p.description,
      category: p.category,
      totalParts: p.parts.length
    }));
    res.json(result);
  } catch (err) {
    console.error("Lỗi lấy danh sách playlist:", err.message);
    res.status(500).json({ error: "Không thể tải danh sách truyện lúc này." });
  }
});

// GET /api/playlists/:id -> chi tiết 1 playlist + danh sách part
router.get("/:id", async (req, res) => {
  try {
    const playlist = await Playlist.findOne({ id: req.params.id });
    if (!playlist) return res.status(404).json({ error: "Không tìm thấy bộ truyện" });

    const parts = await Promise.all(
      playlist.parts.map(async (part) => {
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

    res.json({
      id: playlist.id,
      title: playlist.title,
      cover: playlist.cover,
      description: playlist.description,
      category: playlist.category,
      parts
    });
  } catch (err) {
    console.error("Lỗi tạo signed URL cho playlist:", req.params.id, err.message);
    res.status(500).json({ error: "Không thể tải audio lúc này, vui lòng thử lại." });
  }
});

module.exports = router;