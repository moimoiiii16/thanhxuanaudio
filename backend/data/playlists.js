// ============================================================
// DỮ LIỆU MẪU - Trong thực tế nên thay bằng MongoDB/PostgreSQL
//
// CÁCH THÊM AUDIO CỦA BẠN:
// 1. Upload file audio (.mp3) lên bucket Backblaze B2 "truyenconaoaudio"
//    (qua nút Upload/Download trong B2 Console, hoặc công cụ khác).
// 2. Điền ĐÚNG tên file (kể cả hoa/thường) vào "audioFile" bên dưới,
//    vd nếu file upload lên tên "vtkd-p2.mp3" thì audioFile: "vtkd-p2.mp3".
// 3. KHÔNG cần khai báo gì thêm ở routes/video.js nữa - cả part khóa
//    và không khóa đều tự động lấy link phát qua Backblaze.
// ============================================================

const playlists = [
  {
    id: "than-dao-de-ton",
    title: "Cô Bạn Yêu Tôi Năm Tháng Ấy",
    cover: "https://placehold.co/400x560/1a1a2e/eee?text=Than+Dao+De+Ton",
    description: "Một thiếu niên phế vật ngộ ra thần đạo, từng bước nghịch thiên...",
    category: "Thanh Xuân",
    parts: [
      { id: "tddt-p1", partNumber: 1, title: "Phần 1: Khởi Đầu Nghịch Cảnh", duration: "275:09", audioFile: "full0150.mp3", locked: false },
      { id: "tddt-p2", partNumber: 2, title: "Phần 2: Cơ Duyên Bí Ẩn", duration: "20:11", audioFile: "tddt-p2.mp3", locked: true },
      { id: "tddt-p3", partNumber: 3, title: "Phần 3: Đại Chiến Tông Môn", duration: "19:47", audioFile: "tddt-p3.mp3", locked: true },
    ]
  },
  {
    id: "vo-thuong-kiem-de",
    title: "Vô Thượng Kiếm Đế",
    cover: "https://placehold.co/400x560/16213e/eee?text=Vo+Thuong+Kiem+De",
    description: "Kiếm khách cô độc mang theo mối thù diệt môn, xuôi ngược giang hồ...",
    category: "Kiếm Hiệp",
    parts: [
      { id: "vtkd-p1", partNumber: 1, title: "Phần 1: Kiếm Khách Xuất Sơn", duration: "22:05", audioFile: "vtkd-p1.mp3", locked: false },
      { id: "vtkd-p2", partNumber: 2, title: "Phần 2: Huyết Chiến Ma Giáo", duration: "21:30", audioFile: "vtkd-p2.mp3", locked: true }
    ]
  }
];

function getAllPlaylists() {
  // Trang chủ chỉ cần metadata, không trả toàn bộ parts + audioFile
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

  // Ẩn audioFile thật của các part bị khóa trước khi trả về frontend.
  // Với part KHÔNG khóa, vẫn giữ lại audioFile ở đây để route phía trên
  // (routes/playlists.js) dùng nó tạo signed URL - route sẽ tự xóa field
  // này trước khi trả JSON cuối cùng cho client.
  return {
    ...playlist,
    parts: playlist.parts.map(part => ({
      id: part.id,
      partNumber: part.partNumber,
      title: part.title,
      duration: part.duration,
      locked: part.locked,
      audioFile: part.locked ? null : part.audioFile
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