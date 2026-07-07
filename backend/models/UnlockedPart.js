const mongoose = require("mongoose");

const unlockedPartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  partId: {
    type: String, // VD "tddt-p2"
    required: true
  },
  unlockedAt: {
    type: Date,
    default: Date.now
  }
});

// Đảm bảo 1 user không bị lưu trùng lặp nhiều dòng cho cùng 1 part
unlockedPartSchema.index({ userId: 1, partId: 1 }, { unique: true });

module.exports = mongoose.model("UnlockedPart", unlockedPartSchema);