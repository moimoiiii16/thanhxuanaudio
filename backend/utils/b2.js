const axios = require("axios");
const crypto = require("crypto");

const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_ID = process.env.B2_BUCKET_ID;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;

let authCache = null;

async function authorize() {
  if (authCache && Date.now() < authCache.expiresAt) {
    return authCache;
  }

  const credentials = Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString("base64");

  const res = await axios.get(
    "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  authCache = {
    apiUrl: res.data.apiUrl,
    downloadUrl: res.data.downloadUrl,
    authorizationToken: res.data.authorizationToken,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000
  };

  return authCache;
}

async function getSignedAudioUrl(fileName, validDurationInSeconds = 4 * 60 * 60) {
  if (!fileName) {
    throw new Error("Thiếu fileName khi tạo signed URL cho B2");
  }

  const auth = await authorize();

  const res = await axios.post(
    `${auth.apiUrl}/b2api/v2/b2_get_download_authorization`,
    {
      bucketId: B2_BUCKET_ID,
      fileNamePrefix: fileName,
      validDurationInSeconds
    },
    { headers: { Authorization: auth.authorizationToken } }
  );

  const downloadAuthToken = res.data.authorizationToken;
  return `${auth.downloadUrl}/file/${B2_BUCKET_NAME}/${encodeURIComponent(fileName)}?Authorization=${downloadAuthToken}`;
}

/**
 * Upload 1 file audio (buffer trong RAM) lên B2, trả về tên file đã lưu.
 * @param {Buffer} fileBuffer - nội dung file audio, lấy từ multer (req.file.buffer)
 * @param {string} fileName - tên file muốn lưu trên B2 (nên đặt duy nhất để tránh ghi đè)
 */
async function uploadAudioFile(fileBuffer, fileName) {
  const auth = await authorize();

  // B2 yêu cầu xin riêng 1 uploadUrl cho mỗi lần upload (khác với apiUrl thường)
  const uploadUrlRes = await axios.post(
    `${auth.apiUrl}/b2api/v2/b2_get_upload_url`,
    { bucketId: B2_BUCKET_ID },
    { headers: { Authorization: auth.authorizationToken } }
  );

  const { uploadUrl, authorizationToken } = uploadUrlRes.data;
  const sha1 = crypto.createHash("sha1").update(fileBuffer).digest("hex");

  await axios.post(uploadUrl, fileBuffer, {
    headers: {
      Authorization: authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(fileName),
      "Content-Type": "b2/x-auto",
      "Content-Length": fileBuffer.length,
      "X-Bz-Content-Sha1": sha1
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  return fileName;
}

module.exports = { getSignedAudioUrl, uploadAudioFile };