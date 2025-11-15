const dotenv = require("dotenv");
const fs = require("fs");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

dotenv.config({ path: "./config.env" });

// Initialize S3 Client for Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const MULTIPART_THRESHOLD = 52428800; // 50MB

// const uploadToR2 = async (filePath, fileName) => {
//   try {
//     const fileStats = fs.statSync(filePath);
//     const fileStream = fs.createReadStream(filePath);

//     let result;

//     // Use multipart upload for files larger than 50MB
//     if (fileStats.size > MULTIPART_THRESHOLD) {
//       console.log(
//         `Using multipart upload for ${fileName} (${fileStats.size} bytes)`
//       );

//       const upload = new Upload({
//         client: s3Client,
//         params: {
//           Bucket: BUCKET_NAME,
//           Key: fileName,
//           Body: fileStream,
//         },
//       });

//       result = await upload.done();
//       console.log("Multipart upload completed:", result);
//     } else {
//       // Use standard PutObject for smaller files
//       console.log(
//         `Using standard upload for ${fileName} (${fileStats.size} bytes)`
//       );

//       const fileBuffer = fs.readFileSync(filePath);

//       const command = new PutObjectCommand({
//         Bucket: BUCKET_NAME,
//         Key: fileName,
//         Body: fileBuffer,
//       });

//       await s3Client.send(command);
//       console.log("Standard upload completed");
//     }

//     // Construct the public URL
//     const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

//     // Clean up local file after successful upload
//     fs.unlinkSync(filePath);
//     console.log("Local file deleted:", filePath);

//     return {
//       success: true,
//       location: publicUrl,
//       key: fileName,
//     };
//   } catch (error) {
//     console.error("Error uploading to R2:", error);
//     throw error;
//   }
// };

const uploadToR2 = async (filePath, fileName) => {
  try {
    const fileStats = fs.statSync(filePath);

    const fileBuffer = fs.readFileSync(filePath);

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
    });

    await s3Client.send(command);

    fs.unlinkSync(filePath);

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

// Delete file from R2
const deleteFromR2 = async (fileName) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    });

    await s3Client.send(command);
    console.log(`Deleted from R2: ${fileName}`);

    return {
      success: true,
      key: fileName,
    };
  } catch (error) {
    console.error(`Error deleting ${fileName} from R2:`, error);
    throw error;
  }
};

module.exports = uploadToR2;
module.exports.deleteFromR2 = deleteFromR2;
