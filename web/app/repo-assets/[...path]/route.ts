import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const REPO_ROOT = path.join(process.cwd(), "..");
const ASSETS_DIR = path.join(REPO_ROOT, "assets");

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filePath = path.join(ASSETS_DIR, ...segments);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(path.resolve(ASSETS_DIR) + path.sep)) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const body = fs.readFileSync(resolved);

  return new NextResponse(body, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=60",
    },
  });
}
