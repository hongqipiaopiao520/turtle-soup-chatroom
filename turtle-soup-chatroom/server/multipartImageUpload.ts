import type { ImageImportInput } from "./imagePuzzleImporter";

const MAX_IMAGE_COUNT = 6;
const VALID_ROLES = new Set(["auto", "surface", "truth", "full"]);

interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  content: Buffer;
}

export function parseMultipartImageUpload(body: Buffer, contentType: string | undefined): ImageImportInput {
  const boundary = readMultipartBoundary(contentType);
  const parts = parseMultipartParts(body, boundary);
  const roles = parts
    .filter((part) => part.name === "roles")
    .map((part) => normalizeRole(part.content.toString("utf8")));
  const imageParts = parts.filter((part) => part.name === "images" && part.filename);
  if (imageParts.length === 0) throw new Error("请先选择图片");
  if (imageParts.length > MAX_IMAGE_COUNT) throw new Error(`最多只能上传 ${MAX_IMAGE_COUNT} 张图片`);

  return {
    images: imageParts.map((part, index) => {
      const mimeType = part.contentType || guessImageMimeType(part.filename || "");
      if (!mimeType.startsWith("image/")) throw new Error("只支持图片文件");
      return {
        dataUrl: `data:${mimeType};base64,${part.content.toString("base64")}`,
        role: roles[index] ?? "auto"
      };
    })
  };
}

function readMultipartBoundary(contentType: string | undefined) {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = match?.[1] ?? match?.[2]?.trim();
  if (!boundary) throw new Error("图片上传格式不正确");
  return boundary;
}

function parseMultipartParts(body: Buffer, boundary: string): MultipartPart[] {
  const boundaryText = `--${boundary}`;
  const sections = body.toString("binary").split(boundaryText).slice(1, -1);
  return sections.map(parseMultipartPart).filter((part): part is MultipartPart => Boolean(part));
}

function parseMultipartPart(rawSection: string): MultipartPart | null {
  const normalized = rawSection.replace(/^\r\n/, "").replace(/\r\n$/, "");
  const splitIndex = normalized.indexOf("\r\n\r\n");
  if (splitIndex < 0) return null;
  const rawHeaders = normalized.slice(0, splitIndex).split("\r\n");
  const rawContent = normalized.slice(splitIndex + 4);
  const disposition = rawHeaders.find((header) => header.toLowerCase().startsWith("content-disposition:"));
  if (!disposition) return null;
  const name = readHeaderParam(disposition, "name");
  if (!name) return null;
  const contentType = rawHeaders
    .find((header) => header.toLowerCase().startsWith("content-type:"))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();

  return {
    name,
    filename: readHeaderParam(disposition, "filename"),
    contentType,
    content: Buffer.from(rawContent, "binary")
  };
}

function readHeaderParam(header: string, key: string) {
  return header.match(new RegExp(`${key}="([^"]*)"`, "i"))?.[1];
}

function normalizeRole(value: string) {
  const role = value.trim();
  return VALID_ROLES.has(role) ? role as NonNullable<ImageImportInput["images"][number]["role"]> : "auto";
}

function guessImageMimeType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}
