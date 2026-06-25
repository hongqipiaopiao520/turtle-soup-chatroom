import { describe, expect, it } from "vitest";
import { parseMultipartImageUpload } from "../server/multipartImageUpload";

describe("multipart image upload parser", () => {
  it("extracts uploaded image files and matching roles as data URLs", () => {
    const boundary = "----turtle-boundary";
    const body = Buffer.concat([
      part(boundary, "roles", undefined, undefined, "surface"),
      part(boundary, "images", "surface.png", "image/png", "surface-bytes"),
      part(boundary, "roles", undefined, undefined, "truth"),
      part(boundary, "images", "truth.jpg", "image/jpeg", "truth-bytes"),
      Buffer.from(`--${boundary}--\r\n`)
    ]);

    const result = parseMultipartImageUpload(body, `multipart/form-data; boundary=${boundary}`);

    expect(result.images).toEqual([
      {
        dataUrl: `data:image/png;base64,${Buffer.from("surface-bytes").toString("base64")}`,
        role: "surface"
      },
      {
        dataUrl: `data:image/jpeg;base64,${Buffer.from("truth-bytes").toString("base64")}`,
        role: "truth"
      }
    ]);
  });

  it("rejects non-image file parts", () => {
    const boundary = "----turtle-boundary";
    const body = Buffer.concat([
      part(boundary, "images", "note.txt", "text/plain", "not image"),
      Buffer.from(`--${boundary}--\r\n`)
    ]);

    expect(() => parseMultipartImageUpload(body, `multipart/form-data; boundary=${boundary}`))
      .toThrow("只支持图片文件");
  });
});

function part(boundary: string, name: string, filename: string | undefined, contentType: string | undefined, content: string) {
  const disposition = [
    `Content-Disposition: form-data; name="${name}"`,
    filename ? `; filename="${filename}"` : ""
  ].join("");
  const headers = [
    `--${boundary}`,
    disposition,
    ...(contentType ? [`Content-Type: ${contentType}`] : []),
    "",
    content
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n`);
}
