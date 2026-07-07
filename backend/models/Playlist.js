const mongoose = require("mongoose");

const partSchema = new mongoose.Schema({
  id: { type: String, required: true },
  partNumber: { type: Number, required: true },
  title: { type: String, required: true },
  duration: { type: String, required: true },
  audioFile: { type: String, required: true },
  locked: { type: Boolean, default: true }
}, { _id: false });

const playlistSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  cover: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  parts: [partSchema]
});

// Tìm 1 part theo partId, trả về cả playlist chứa nó (giữ nguyên hành vi
// của findPartById cũ trong data/playlists.js)
playlistSchema.statics.findPartById = async function (partId) {
  const playlist = await this.findOne({ "parts.id": partId });
  if (!playlist) return null;
  const part = playlist.parts.find((p) => p.id === partId);
  if (!part) return null;
  return { playlist, part };
};

module.exports = mongoose.model("Playlist", playlistSchema);