// const dotenv = require("dotenv");
// const fs = require("fs");
// const {
//   S3Client,
//   PutObjectCommand,
//   DeleteObjectCommand,
// } = require("@aws-sdk/client-s3");
// const { Upload } = require("@aws-sdk/lib-storage");

// dotenv.config({ path: "./config.env" });

// // Initialize S3 Client for Cloudflare R2
// const s3Client = new S3Client({
//   region: "auto",
//   endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
//   credentials: {
//     accessKeyId: process.env.S3_ACCESS_KEY,
//     secretAccessKey: process.env.S3_SECRET_KEY,
//   },
// });

// const BUCKET_NAME = process.env.R2_BUCKET_NAME;
// const MULTIPART_THRESHOLD = 52428800; // 50MB

// const uploadToR2 = async (filePath, fileName) => {
//   try {
//     const fileStats = fs.statSync(filePath);

//     const fileBuffer = fs.readFileSync(filePath);

//     const command = new PutObjectCommand({
//       Bucket: process.env.R2_BUCKET_NAME,
//       Key: fileName,
//       Body: fileBuffer,
//     });

//     await s3Client.send(command);

//     fs.unlinkSync(filePath);

//     return {
//       success: true,
//       location: `${process.env.R2_PUBLIC_URL}/${fileName}`,
//       key: fileName,
//     };
//   } catch (error) {
//     console.error("Error uploading to R2:", error);
//     throw error;
//   }
// };

// // Delete file from R2
// const deleteFromR2 = async (fileName) => {
//   try {
//     const command = new DeleteObjectCommand({
//       Bucket: BUCKET_NAME,
//       Key: fileName,
//     });

//     await s3Client.send(command);
//     console.log(`Deleted from R2: ${fileName}`);

//     return {
//       success: true,
//       key: fileName,
//     };
//   } catch (error) {
//     console.error(`Error deleting ${fileName} from R2:`, error);
//     throw error;
//   }
// };

// module.exports = uploadToR2;
// module.exports.deleteFromR2 = deleteFromR2;

const dotenv = require("dotenv");
const fs = require("fs");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

dotenv.config({ path: "./config.env" });

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

/**
 * Upload to R2 from either a file path (disk) or a buffer (memory).
 * @param {string|Buffer} source   - File path string OR a Buffer
 * @param {string}        fileName - Destination key in the bucket
 * @param {string}        [contentType] - MIME type (e.g. "application/pdf")
 */
const uploadToR2 = async (source, fileName, contentType) => {
  try {
    let fileBuffer;

    if (Buffer.isBuffer(source)) {
      // Came from multer memoryStorage
      fileBuffer = source;
    } else {
      // Came from disk (original behaviour)
      fileBuffer = fs.readFileSync(source);
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ...(contentType && { ContentType: contentType }),
    });

    await s3Client.send(command);

    // Only unlink if we were given a file path, not a buffer
    if (!Buffer.isBuffer(source)) {
      fs.unlinkSync(source);
    }

    return {
      success: true,
      location: `${process.env.R2_PUBLIC_URL}/${fileName}`,
      key: fileName,
    };
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw error;
  }
};

const deleteFromR2 = async (fileName) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    });

    await s3Client.send(command);
    console.log(`Deleted from R2: ${fileName}`);

    return { success: true, key: fileName };
  } catch (error) {
    console.error(`Error deleting ${fileName} from R2:`, error);
    throw error;
  }
};

module.exports = uploadToR2;
module.exports.deleteFromR2 = deleteFromR2;
