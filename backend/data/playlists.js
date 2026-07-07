// ============================================================
// DỮ LIỆU MẪU - Trong thực tế nên thay bằng MongoDB/PostgreSQL
//
// CÁCH THÊM AUDIO CỦA BẠN:
// 1. Copy file audio (.mp3 khuyến nghị) vào backend/public/media/
// 2. Sửa "videoUrl" bên dưới trỏ về:
//      `${BACKEND_URL}/media/ten-file-cua-ban.mp3`
// 3. Với part bị khóa (locked:true), video KHÔNG lộ ở đây,
//    phải khai báo thêm trong backend/routes/video.js
//    (object REAL_VIDEO_SOURCES) - xem hướng dẫn trong file đó.
// ============================================================

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

const playlists = [
  {
    id: "than-dao-de-ton",
    title: "Cô Bạn Yêu Tôi Năm Tháng Ấy",
    cover: "https://placehold.co/400x560/1a1a2e/eee?text=Than+Dao+De+Ton",
    description: "Một thiếu niên phế vật ngộ ra thần đạo, từng bước nghịch thiên...",
    category: "Thanh Xuân",
    parts: [
      // Part 1 = miễn phí -> videoUrl khai báo thẳng ở đây, đổi sang file audio thật của bạn
      { id: "tddt-p1", partNumber: 1, title: "Phần 1: Khởi Đầu Nghịch Cảnh", duration: "275:09", videoUrl: `${BACKEND_URL}/media/full0150.mp4`, locked: false },      // Part 2, 3 bị khóa -> videoUrl để null, source thật khai báo ở routes/video.js
      { id: "tddt-p2", partNumber: 2, title: "Phần 2: Cơ Duyên Bí Ẩn", duration: "20:11", videoUrl: `${BACKEND_URL}/media/full0150.mp4`, locked: true },
      { id: "tddt-p3", partNumber: 3, title: "Phần 3: Đại Chiến Tông Môn", duration: "19:47", videoUrl: null, locked: true },
    ]
  },
  {
    id: "vo-thuong-kiem-de",
    title: "Vô Thượng Kiếm Đế",
    cover: "https://placehold.co/400x560/16213e/eee?text=Vo+Thuong+Kiem+De",
    description: "Kiếm khách cô độc mang theo mối thù diệt môn, xuôi ngược giang hồ...",
    category: "Kiếm Hiệp",
    parts: [
      { id: "vtkd-p1", partNumber: 1, title: "Phần 1: Kiếm Khách Xuất Sơn", duration: "22:05", videoUrl: `${BACKEND_URL}/media/vtkd-p1.mp3`, locked: false },
      { id: "vtkd-p2", partNumber: 2, title: "Phần 2: Huyết Chiến Ma Giáo", duration: "21:30", videoUrl: null, locked: true }
    ]
  }
];

function getAllPlaylists() {
  // Trang chủ chỉ cần metadata, không trả toàn bộ parts + videoUrl
  return playlists.map(p => ({
    id: p.id,
    title: p.title,
    cover: p.cover,
    description: p.description,
    category: p.category,
    totalParts: p.parts.length
  }));
}

function getPlaylistById(id) {
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) return null;

  // Ẩn videoUrl thật của các part bị khóa trước khi trả về frontend
  return {
    ...playlist,
    parts: playlist.parts.map(part => ({
      id: part.id,
      partNumber: part.partNumber,
      title: part.title,
      duration: part.duration,
      locked: part.locked,
      videoUrl: part.locked ? null : part.videoUrl
    }))
  };
}

function findPartById(partId) {
  for (const playlist of playlists) {
    const part = playlist.parts.find(p => p.id === partId);
    if (part) return { playlist, part };
  }
  return null;
}

module.exports = { playlists, getAllPlaylists, getPlaylistById, findPartById };
