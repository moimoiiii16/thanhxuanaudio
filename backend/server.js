require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const playlistsRouter = require("./routes/playlists");
const unlockRouter = require("./routes/unlock");
const videoRouter = require("./routes/video");

const app = express();
app.use(cors());
app.use(express.json());

// Phục vụ file audio/video thật của bạn đặt trong backend/public/media
// Ví dụ file backend/public/media/tddt-p1.mp3
// sẽ truy cập được tại http://localhost:4000/media/tddt-p1.mp3
app.use("/media", express.static(path.join(__dirname, "public/media")));

app.use("/api/playlists", playlistsRouter);
app.use("/api/unlock", unlockRouter);
app.use("/api/video", videoRouter);

app.get("/", (req, res) => {
  res.send("Truyện Có Não API đang chạy 🚀");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
});
