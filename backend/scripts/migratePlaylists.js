const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Playlist = require("../models/Playlist");
const { playlists } = require("../data/playlists");

async function migrate() {
  if (!process.env.MONGODB_URI) {
    console.error("Không tìm thấy MONGODB_URI. Kiểm tra lại đường dẫn file .env.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Đã kết nối MongoDB.");

  for (const p of playlists) {
    const result = await Playlist.updateOne(
      { id: p.id },
      { $set: p },
      { upsert: true }
    );
    console.log(`- ${p.id}: ${result.upsertedCount ? "đã thêm mới" : "đã cập nhật"}`);
  }

  console.log("Migration xong.");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Lỗi migration:", err.message);
  process.exit(1);
});