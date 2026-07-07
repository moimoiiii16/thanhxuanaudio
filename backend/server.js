require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");

const playlistsRouter = require("./routes/playlists");
const authRouter = require("./routes/auth");
const unlockRouter = require("./routes/unlock");
const videoRouter = require("./routes/video");

const app = express();
app.use(cors());
app.use(express.json());

// Phục vụ file audio/video thật của bạn đặt trong backend/public/media
// (Không còn dùng cho audio nữa vì đã chuyển sang Backblaze B2, giữ lại phòng khi cần)
app.use("/media", express.static(path.join(__dirname, "public/media")));

app.use("/api/playlists", playlistsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", require("./routes/admin"));
app.use("/api/unlock", unlockRouter);
app.use("/api/video", videoRouter);

app.get("/", (req, res) => {
  res.send("Truyện Có Não API đang chạy 🚀");
});

// ============================================================
// KẾT NỐI MONGODB
// ============================================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Đã kết nối MongoDB thành công"))
  .catch((err) => console.error("❌ Lỗi kết nối MongoDB:", err.message));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
});