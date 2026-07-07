const express = require("express");
const router = express.Router();
const { getAllPlaylists, getPlaylistById } = require("../data/playlists");

// GET /api/playlists -> danh sách tất cả playlist cho trang chủ
router.get("/", (req, res) => {
  res.json(getAllPlaylists());
});

// GET /api/playlists/:id -> chi tiết 1 playlist + danh sách part
router.get("/:id", (req, res) => {
  const playlist = getPlaylistById(req.params.id);
  if (!playlist) return res.status(404).json({ error: "Không tìm thấy bộ truyện" });
  res.json(playlist);
});

module.exports = router;
