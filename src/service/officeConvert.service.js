/**
 * Convert pre-2007 Office documents to their OOXML equivalents.
 *
 * `.doc` and `.xls` are OLE2 compound files. Nothing in a browser can rewrite
 * them without destroying their formatting, so the only faithful way to make one
 * editable is to convert it — and the only converter that keeps fonts, styles,
 * tables, formulas and layout intact is LibreOffice itself.
 *
 * LibreOffice is therefore an optional dependency: present, legacy documents can
 * be converted and edited; absent, they stay view-and-download only and the API
 * says exactly that rather than failing obscurely. `isConversionAvailable()` is
 * what the UI asks before offering the action.
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";
import logger from "../utils/logger.js";

/** Legacy extension → what it converts to. */
const CONVERSIONS = {
  doc: {
    target: "docx",
    filter: "docx:MS Word 2007 XML",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xls: {
    target: "xlsx",
    filter: "xlsx:Calc MS Excel 2007 XML",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  // Rich Text and the Excel 5.0 variant land here too — LibreOffice reads both,
  // and both are otherwise dead ends in the editor.
  rtf: {
    target: "docx",
    filter: "docx:MS Word 2007 XML",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
};

export const CONVERTIBLE_EXTENSIONS = Object.keys(CONVERSIONS);

/**
 * Where LibreOffice might be.
 *
 * `soffice` on PATH covers Docker and most Linux installs; the absolute paths
 * cover a stock Windows or macOS install, where it is never on PATH.
 */
const CANDIDATE_BINARIES = [
  process.env.LIBREOFFICE_PATH,
  "soffice",
  "/usr/bin/soffice",
  "/usr/lib/libreoffice/program/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
].filter(Boolean);

/** Conversion is slow but bounded; a hung soffice must not pin a worker. */
const CONVERT_TIMEOUT_MS = 120_000;

const run = (binary, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: CONVERT_TIMEOUT_MS, ...options }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });

let cachedBinary;

/**
 * The LibreOffice executable, or null when it is not installed.
 *
 * Cached after the first look: the answer cannot change while the process is
 * running, and probing on every request would add a spawn to each conversion.
 */
export async function findLibreOffice() {
  if (cachedBinary !== undefined) return cachedBinary;

  for (const candidate of CANDIDATE_BINARIES) {
    try {
      // `--version` is the cheapest call that proves the binary runs at all;
      // a path that merely exists may still be the wrong architecture.
      await run(candidate, ["--version"], { timeout: 20_000 });
      cachedBinary = candidate;
      logger.info(`[office-convert] using LibreOffice at ${candidate}`);
      return cachedBinary;
    } catch {
      // Try the next candidate — not found, or not runnable.
    }
  }

  cachedBinary = null;
  logger.warn(
    "[office-convert] LibreOffice was not found. Legacy .doc/.xls documents cannot be converted; set LIBREOFFICE_PATH if it is installed somewhere unusual.",
  );
  return cachedBinary;
}

export async function isConversionAvailable() {
  return (await findLibreOffice()) !== null;
}

/** True for the extensions this service can convert. */
export function isConvertibleLegacy(extension) {
  return Object.prototype.hasOwnProperty.call(
    CONVERSIONS,
    String(extension || "").replace(/^\.+/, "").toLowerCase(),
  );
}

/**
 * Convert one legacy document to OOXML.
 *
 * @param {Buffer} buffer - the original file's bytes
 * @param {string} extension - "doc" / "xls", with or without the dot
 * @returns {Promise<{ buffer: Buffer, extension: string, mimeType: string }>}
 */
export async function convertLegacyDocument(buffer, extension) {
  const key = String(extension || "").replace(/^\.+/, "").toLowerCase();
  const conversion = CONVERSIONS[key];

  if (!conversion) {
    const error = new Error(`${key || "This format"} cannot be converted.`);
    error.statusCode = 400;
    throw error;
  }

  const binary = await findLibreOffice();
  if (!binary) {
    const error = new Error(
      "This document is in the pre-2007 Office format and has to be converted before it can be edited, but LibreOffice is not installed on the server. Install it (or set LIBREOFFICE_PATH), or open the file in Word/Excel and re-upload it as .docx/.xlsx.",
    );
    error.statusCode = 503;
    error.code = "CONVERTER_UNAVAILABLE";
    // Deliberate, and the message is written for whoever has to fix it — so it
    // is forwarded rather than flattened to "Internal server error".
    error.expose = true;
    throw error;
  }

  // Each conversion gets its own directory *and* its own LibreOffice profile.
  // Two soffice processes sharing a profile will refuse to start concurrently,
  // which under any real load turns into intermittent failures.
  const workDir = path.join(os.tmpdir(), `inbuildify-convert-${randomUUID()}`);
  const profileDir = path.join(workDir, "profile");
  const inputPath = path.join(workDir, `source.${key}`);

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(inputPath, buffer);

    // `pathToFileURL` rather than a hand-built "file://" + path: on Windows the
    // latter yields file://C:/… , where "C:" is read as the host name and the
    // profile silently lands somewhere else — or LibreOffice refuses to start.
    // Only the three-slash form (file:///C:/…) is a local path.
    await run(binary, [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--nodefault",
      "--nofirststartwizard",
      "--convert-to",
      conversion.filter,
      "--outdir",
      workDir,
      inputPath,
    ]);

    const outputPath = path.join(workDir, `source.${conversion.target}`);
    const converted = await fs.readFile(outputPath).catch(() => null);

    if (!converted || converted.length === 0) {
      // LibreOffice exits 0 even when it converted nothing, so the output file
      // is the only reliable signal that it worked.
      const error = new Error(
        "The document could not be converted. It may be password-protected or damaged.",
      );
      error.statusCode = 422;
      throw error;
    }

    return { buffer: converted, extension: conversion.target, mimeType: conversion.mime };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export default {
  findLibreOffice,
  isConversionAvailable,
  isConvertibleLegacy,
  convertLegacyDocument,
  CONVERTIBLE_EXTENSIONS,
};
