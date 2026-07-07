const express = require("express");
const router = express.Router();
const multer = require("multer");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const Playlist = require("../models/Playlist");
const { uploadAudioFile } = require("../utils/b2");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 } // tối đa 200MB mỗi file audio
});

// Toàn bộ route trong file này đều bắt buộc đăng nhập + phải là admin
router.use(requireAuth, requireAdmin);

// POST /api/admin/playlists -> tạo truyện mới (chưa có tập nào)
router.post("/playlists", async (req, res) => {
  try {
    const { id, title, cover, description, category } = req.body;
    if (!id || !title || !cover || !description || !category) {
      return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
    }

    const existing = await Playlist.findOne({ id });
    if (existing) return res.status(400).json({ error: "id truyện này đã tồn tại" });

    const playlist = await Playlist.create({ id, title, cover, description, category, parts: [] });
    res.json(playlist);
  } catch (err) {
    console.error("Lỗi tạo playlist:", err.message);
    res.status(500).json({ error: "Không thể tạo truyện lúc này" });
  }
});

// PUT /api/admin/playlists/:id -> sửa thông tin truyện (không đụng parts)
router.put("/playlists/:id", async (req, res) => {
  try {
    const { title, cover, description, category } = req.body;
    const playlist = await Playlist.findOneAndUpdate(
      { id: req.params.id },
      { $set: { title, cover, description, category } },
      { new: true }
    );
    if (!playlist) return res.status(404).json({ error: "Không tìm thấy truyện" });
    res.json(playlist);
  } catch (err) {
    console.error("Lỗi sửa playlist:", err.message);
    res.status(500).json({ error: "Không thể sửa truyện lúc này" });
  }
});

// DELETE /api/admin/playlists/:id -> xóa cả truyện (kể cả các tập bên trong)
router.delete("/playlists/:id", async (req, res) => {
  try {
    const result = await Playlist.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Không tìm thấy truyện" });
    res.json({ success: true });
  } catch (err) {
    console.error("Lỗi xóa playlist:", err.message);
    res.status(500).json({ error: "Không thể xóa truyện lúc này" });
  }
});

// POST /api/admin/playlists/:id/parts -> thêm 1 tập mới, kèm upload file audio
// Gửi dạng multipart/form-data, field file audio tên là "audio"
router.post("/playlists/:id/parts", upload.single("audio"), async (req, res) => {
  try {
    const { partId, partNumber, title, duration, locked } = req.body;
    if (!partId || !partNumber || !title || !duration) {
      return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Thiếu file audio" });
    }

    const playlist = await Playlist.findOne({ id: req.params.id });
    if (!playlist) return res.status(404).json({ error: "Không tìm thấy truyện" });

    const audioFileName = `${req.params.id}-${partId}-${Date.now()}.mp3`;
    await uploadAudioFile(req.file.buffer, audioFileName);

    playlist.parts.push({
      id: partId,
      partNumber: Number(partNumber),
      title,
      duration,
      audioFile: audioFileName,
      locked: locked === "true" || locked === true
    });

    await playlist.save();
    res.json(playlist);
  } catch (err) {
    console.error("Lỗi thêm tập mới:", err.message);
    res.status(500).json({ error: "Không thể thêm tập mới lúc này" });
  }
});

// PUT /api/admin/playlists/:id/parts/:partId -> sửa 1 tập (đổi audio thì gửi kèm file mới)
router.put("/playlists/:id/parts/:partId", upload.single("audio"), async (req, res) => {
  try {
    const playlist = await Playlist.findOne({ id: req.params.id });
    if (!playlist) return res.status(404).json({ error: "Không tìm thấy truyện" });

    const part = playlist.parts.find((p) => p.id === req.params.partId);
    if (!part) return res.status(404).json({ error: "Không tìm thấy tập" });

    const { partNumber, title, duration, locked } = req.body;
    if (partNumber !== undefined) part.partNumber = Number(partNumber);
    if (title !== undefined) part.title = title;
    if (duration !== undefined) part.duration = duration;
    if (locked !== undefined) part.locked = locked === "true" || locked === true;

    if (req.file) {
      const audioFileName = `${req.params.id}-${req.params.partId}-${Date.now()}.mp3`;
      await uploadAudioFile(req.file.buffer, audioFileName);
      part.audioFile = audioFileName;
    }

    await playlist.save();
    res.json(playlist);
  } catch (err) {
    console.error("Lỗi sửa tập:", err.message);
    res.status(500).json({ error: "Không thể sửa tập lúc này" });
  }
});

// DELETE /api/admin/playlists/:id/parts/:partId -> xóa 1 tập
router.delete("/playlists/:id/parts/:partId", async (req, res) => {
  try {
    const playlist = await Playlist.findOne({ id: req.params.id });
    if (!playlist) return res.status(404).json({ error: "Không tìm thấy truyện" });

    const beforeCount = playlist.parts.length;
    playlist.parts = playlist.parts.filter((p) => p.id !== req.params.partId);
    if (playlist.parts.length === beforeCount) {
      return res.status(404).json({ error: "Không tìm thấy tập" });
    }

    await playlist.save();
    res.json(playlist);
  } catch (err) {
    console.error("Lỗi xóa tập:", err.message);
    res.status(500).json({ error: "Không thể xóa tập lúc này" });
  }
});

module.exports = router;