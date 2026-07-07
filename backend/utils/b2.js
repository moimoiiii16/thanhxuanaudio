const axios = require("axios");

const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_ID = process.env.B2_BUCKET_ID;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;

// Cache thông tin đăng nhập B2 trong RAM, vì token sống được ~24h,
// không cần xin lại mỗi lần có request.
let authCache = null; // { apiUrl, downloadUrl, authorizationToken, expiresAt }

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
    // Token B2 sống 24h, mình cache 23h cho an toàn (chừa dư 1h)
    expiresAt: Date.now() + 23 * 60 * 60 * 1000
  };

  return authCache;
}

/**
 * Tạo link phát audio tạm thời (signed URL) cho 1 file trong bucket Private.
 * @param {string} fileName - tên file CHÍNH XÁC như đã upload lên B2 (vd: "full0150.mp3")
 * @param {number} validDurationInSeconds - link sống được bao lâu (mặc định 4 tiếng)
 */
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

module.exports = { getSignedAudioUrl };