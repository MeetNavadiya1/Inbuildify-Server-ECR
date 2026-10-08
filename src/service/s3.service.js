import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent as HttpsAgent } from "https";
import { env } from "../config/env.config.js";

// Configure AWS SDK. Keep-alive reuses TCP/TLS connections (no per-request
// handshake), and explicit socket timeouts stop a stalled S3 connection from
// hanging the whole request — both matter because PDF generation downloads
// several images from S3 on the hot path.
const s3Client = new S3Client({
  region: env.AWS.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: env.AWS.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS.AWS_SECRET_ACCESS_KEY,
  },
  // AWS SDK v3 (>=3.729) defaults these to "WHEN_SUPPORTED", which appends
  // `x-amz-checksum-mode=ENABLED` to presigned GET URLs and breaks previewing
  // files directly in the browser. "WHEN_REQUIRED" keeps presigned URLs clean.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  requestHandler: new NodeHttpHandler({
    httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 50 }),
    connectionTimeout: 3000,
    requestTimeout: 15000,
  }),
});

const BUCKET_NAME = env.AWS.S3_BUCKET_NAME;
const UPLOAD_EXPIRATION = 300; // 5 minutes
const DOWNLOAD_EXPIRATION = 3600; // 5 minutes

// Generate presigned URL for upload
export async function generatePresignedUploadUrl(key, contentType = "application/octet-stream", expiresIn = UPLOAD_EXPIRATION) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn,
    });

    return {
      success: true,
      url: presignedUrl,
      key,
      expiresIn,
    };
  } catch (error) {
    console.error("Error generating presigned upload URL:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Build a Content-Disposition header that makes the browser save the file under
// `filename` instead of rendering it inline. The quoted form is ASCII-only (any
// other byte becomes "_") for old clients; filename* carries the real UTF-8 name
// for everything current.
const attachmentDisposition = (filename) => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};

// Generate presigned URL for download. Pass `downloadFilename` to force a
// save-to-disk download under that name; omit it (the default) to keep the URL
// inline-viewable, which is what email links and in-browser previews need.
export async function generatePresignedDownloadUrl(key, expiresIn = DOWNLOAD_EXPIRATION, downloadFilename) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ...(downloadFilename
        ? { ResponseContentDisposition: attachmentDisposition(downloadFilename) }
        : {}),
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn,
    });

    return {
      success: true,
      url: presignedUrl,
      key,
      expiresIn,
    };
  } catch (error) {
    console.error("Error generating presigned download URL:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Upload file directly (server-side upload)
export async function uploadFile(key, fileBuffer, contentType = "application/octet-stream", metadata = {}) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      Metadata: metadata,
    });

    const result = await s3Client.send(command);

    return {
      success: true,
      etag: result.ETag,
      location: `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`,
      key,
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Get object from S3
export async function getObject(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const result = await s3Client.send(command);

    // Convert stream to buffer
    const streamToBuffer = async (stream) => {
      const chunks = [];
      return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks)));
      });
    };

    const bodyContents = await streamToBuffer(result.Body);

    return {
      success: true,
      data: bodyContents,
      contentType: result.ContentType,
      lastModified: result.LastModified,
      etag: result.ETag,
      contentLength: result.ContentLength,
    };
  } catch (error) {
    console.error("Error getting object:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Get object as stream (for large files)
export async function getObjectStream(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const result = await s3Client.send(command);

    return {
      success: true,
      stream: result.Body,
      contentType: result.ContentType,
      lastModified: result.LastModified,
      etag: result.ETag,
      contentLength: result.ContentLength,
    };
  } catch (error) {
    console.error("Error getting object stream:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Delete single object
export async function deleteObject(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const result = await s3Client.send(command);

    return {
      success: true,
      key,
      deleteMarker: result.DeleteMarker,
      versionId: result.VersionId,
    };
  } catch (error) {
    console.error("Error deleting object:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Delete multiple objects
export async function deleteObjects(keys) {
  try {
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: keys.map(key => ({ Key: key })),
      },
    };

    const result = await s3Client.send(new DeleteObjectsCommand(deleteParams));

    return {
      success: true,
      deleted: result.Deleted,
      errors: result.Errors || [],
    };
  } catch (error) {
    console.error("Error deleting objects:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Check if object exists
export async function objectExists(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return { success: true, exists: true };
  } catch (error) {
    if (error.name === "NoSuchKey") {
      return { success: true, exists: false };
    }
    return {
      success: false,
      error: error.message,
    };
  }
}
