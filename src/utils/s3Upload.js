import path from "path";
import { Agent } from "https";

import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { env } from "../config/env.config.js";
import { allowedFileData } from "./common.js";
import { uploadFileFilter, chatFileFilter } from "./uploadFileTypes.js";
import { buildStorageKey, namingContextFromRequest } from "../service/fileNaming.service.js";

// Reuse a single keep-alive TLS connection pool across every S3 request.
// Without this each upload can pay a fresh TCP + TLS handshake (hundreds of ms
// per request), which dominates the latency of small facade/floor-plan images.
const keepAliveAgent = new Agent({
  keepAlive: true,
  maxSockets: 50,
});

export const s3Client = new S3Client({
  region: env.AWS.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS.AWS_SECRET_ACCESS_KEY,
  },
  // Fail fast instead of hanging on a stalled connection, and reuse sockets.
  requestHandler: new NodeHttpHandler({
    httpsAgent: keepAliveAgent,
    connectionTimeout: 3000,
    requestTimeout: 30000,
  }),
  maxAttempts: 3,
});

const fileData = allowedFileData();
const fileFilter = (req, file, cb) => {
  const types = (fileData?.types || "").toLowerCase().split("|");
  const extension = path.extname(file.originalname).toLowerCase().replace(".", "");

  const isMimeAllowed = types.includes(file.mimetype.toLowerCase());
  const isExtAllowed = types.some(t => t.includes(extension) || t === extension);

  if (isMimeAllowed || isExtAllowed) {
    return cb(null, true);
  }
  const allowedList = types
    .map((t) => t.replace("image/", "").toUpperCase())
    .map((t) => (t === "JPG" || t === "JPEG" ? "JPG/JPEG" : t))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(", ");
  const message = `Invalid file type. Only the following are allowed: ${allowedList}.`;
  cb(new Error(message));

};

const pdfFileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["application/pdf"];
  const allowedExtensions = [".pdf"];

  const extname = allowedExtensions.includes(
    path.extname(file.originalname).toLowerCase(),
  );
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  // Rejecting has to call back too. Returning silently left busboy waiting on a
  // decision that never came, so the request hung until the client timed out
  // instead of answering "Invalid file type" — the shape every other filter in
  // this file uses. Browsers do send a .pdf as application/octet-stream when the
  // OS has no association for it, so this branch is reachable in normal use.
  cb(new Error("Invalid file type. Only PDF files are allowed."));
};

const imageFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

  const extname = allowedExtensions.includes(
    path.extname(file.originalname).toLowerCase(),
  );
  const mimetype = allowedMimeTypes.includes(file.mimetype.toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }
  const message = "Invalid file type. Only image files are allowed.";
  cb(new Error(message));
};

// Some call sites pass a byte limit as the second argument (a leftover from an
// older signature). Only treat an actual options object as options.
const toOptions = (options) =>
  options && typeof options === "object" && !Array.isArray(options) ? options : {};

// Legacy key shape, kept as the fallback path so a naming lookup that fails
// (unreachable DB, malformed format) degrades to an upload with an ugly name
// rather than a failed upload.
const legacyKey = (folderName, file) =>
  `${folderName}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/\s+/g, "_")}`;

/**
 * multer-s3 `key` function driven by the administrator-configured naming format
 * (Admin → Integration → File Naming). The generated name is the basename of the
 * S3 key, so `key.split("/").pop()` still yields the file's display name.
 *
 * @param {string} folderName  S3 prefix for this uploader
 * @param {object} [options]   { fileType } to override the `[FileType]` token
 */
const namedKey = (folderName, options = {}) => (req, file, cb) => {
  buildStorageKey({
    folderName,
    originalName: file.originalname,
    mimeType: file.mimetype,
    fileType: options.fileType,
    ...namingContextFromRequest(req),
  })
    .then((key) => cb(null, key))
    .catch((error) => {
      console.error("[FileNaming] Key generation failed, using fallback:", error.message);
      cb(null, legacyKey(folderName, file));
    });
};

// Storage config shared by every uploader below — one naming implementation,
// not five copies of it.
const namedS3Storage = (folderName, options) =>
  multerS3({
    s3: s3Client,
    bucket: env.AWS.S3_BUCKET_NAME,
    key: namedKey(folderName, toOptions(options)),
    metadata(req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        originalName: encodeURIComponent(file.originalname),
        uploadedBy: req.user?.users_id || "unknown",
      });
    },
    contentType: function (req, file, cb) {
      cb(null, file.mimetype);
    },
  });

// Helper to attach file field metadata to Multer middleware for Swagger gen
const wrapMulter = (upload) => {
  const methodsToWrap = ["single", "array", "fields", "any"];

  methodsToWrap.forEach((method) => {
    const original = upload[method];
    if (original) {
      upload[method] = function (...args) {
        const mw = original.apply(this, args);

        if (method === "single") {
          mw.fileFields = [{ name: args[0], maxCount: 1 }];
        } else if (method === "array") {
          mw.fileFields = [{ name: args[0], maxCount: args[1] || undefined }];
        } else if (method === "fields") {
          mw.fileFields = args[0] || [];
        } else if (method === "any") {
          mw.fileFields = "any";
        }

        return mw;
      };
    }
  });

  return upload;
};

export const createUpload = (folderName = "uploads", options) =>
  wrapMulter(multer({
    storage: namedS3Storage(folderName, options),
    fileFilter,
    limits: {
      fileSize: fileData.size * 1024 * 1024,
    },
  }));

/**
 * Server-side copy of an existing object to a new key in the same bucket.
 *
 * Used when a row that owns a file is duplicated (sample-data import) so each
 * copy owns its own S3 object — deleting one tenant's image must never remove
 * the file another tenant is still pointing at.
 *
 * Returns the destination key on success, or null if the copy failed (callers
 * treat a failed copy as "no image" rather than sharing the source object).
 */
export const copyS3Object = async (sourceKey, destinationKey) => {
  if (!sourceKey || !destinationKey) {
    return null;
  }

  try {
    const bucketName = env.AWS.S3_BUCKET_NAME;
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: `${bucketName}/${sourceKey}`,
        Key: destinationKey,
      }),
    );
    return destinationKey;
  } catch (err) {
    console.error("Error copying S3 object:", sourceKey, "->", destinationKey, "-", err.message);
    return null;
  }
};

export const deleteFromS3 = async (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== "string") {
    return;
  }

  try {
    const bucketName = env.AWS.S3_BUCKET_NAME;
    let key;

    // If it's a full URL, extract the key
    if (fileUrl.startsWith("http")) {
      try {
        const url = new URL(fileUrl);
        key = decodeURIComponent(url.pathname.substring(1));

        // If the bucket name is part of the path (e.g. s3.amazonaws.com/bucket/key)
        if (key.startsWith(`${bucketName}/`)) {
          key = key.substring(bucketName.length + 1);
        }
      } catch (e) {
        key = fileUrl;
      }
    } else {
      // Assume it's already a key
      key = fileUrl;
    }

    if (!key) {
      return;
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    console.log(`Successfully deleted from S3: ${key}`);
  } catch (err) {
    console.error("Error deleting from S3:", fileUrl, "-", err.message);
  }
};

export const createPdfUpload = (folderName = "pdfs", options) =>
  wrapMulter(multer({
    storage: namedS3Storage(folderName, options),
    fileFilter: pdfFileFilter,
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit for PDFs
    },
  }));

export const createImageUpload = (folderName = "uploads", options) =>
  wrapMulter(multer({
    storage: namedS3Storage(folderName, options),
    fileFilter: imageFileFilter,
    limits: {
      fileSize: fileData.size * 1024 * 1024,
    },
  }));

export const createImageOrPdfUpload = (folderName = "uploads", options) =>
  wrapMulter(multer({
    storage: namedS3Storage(folderName, options),
    fileFilter: (req, file, cb) => {
      // Allowed image types
      const allowedImageMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      const allowedImageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

      // Allowed PDF types
      const allowedPdfMimeTypes = ["application/pdf"];
      const allowedPdfExtensions = [".pdf"];

      // Combine all allowed types
      const allowedMimeTypes = [
        ...allowedImageMimeTypes,
        ...allowedPdfMimeTypes,
      ];
      const allowedExtensions = [
        ...allowedImageExtensions,
        ...allowedPdfExtensions,
      ];

      const extname = allowedExtensions.includes(
        path.extname(file.originalname).toLowerCase(),
      );
      const mimetype = allowedMimeTypes.includes(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      }
      const imageList = allowedImageExtensions
        .map((t) => t.replace(".", "").toUpperCase())
        .map((t) => (t === "JPG" || t === "JPEG" ? "JPG/JPEG" : t))
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(", ");
      const message = `Invalid file type. Only following are allowed: ${imageList}, PDF.`;
      cb(new Error(message));

    },
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit for both images and PDFs
    },
  }));

export const createDocumentUpload = (folderName = "documents", options) =>
  wrapMulter(multer({
    storage: namedS3Storage(folderName, options),
    // Same allow-list as the Drive and Documents uploaders.
    fileFilter: uploadFileFilter,
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  }));

/** Lead / job chat attachments: PNG and JPEG only, 10MB per file. */
export const createChatAttachmentUpload = (folderName = "chat-attachments", options) =>
  wrapMulter(multer({
    storage: namedS3Storage(folderName, options),
    fileFilter: chatFileFilter,
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  }));

export const handleMulterError =(error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      // Report the limit the rejecting uploader actually carries. Uploaders no
      // longer all share one of two sizes, so deriving it from error.limit is
      // the only way the message stays true as new ones are added.
      const maxSize = error.limit
        ? `${Math.round(error.limit / (1024 * 1024))}MB`
        : `${fileData.size}MB`;

      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: `File size too large. Maximum size is ${maxSize}.`,
        data: null,
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Unexpected field name for file upload.",
        data: null,
      });
    }
  }
  if (error.message?.startsWith("Invalid file type")) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: error.message,
      data: null,
    });
  }

  next(error);
};

export default {
  createUpload,
  createPdfUpload,
  createImageUpload,
  createImageOrPdfUpload,
  createDocumentUpload,
  createChatAttachmentUpload,
  deleteFromS3,
  handleMulterError,
  s3Client,
};