import { NextResponse } from "next/server";
import { requireApiEmployee } from "@/lib/api-auth";
import { newId } from "@/lib/store";
import {
  listUploads,
  saveUpload,
  uploadLimits,
  isAllowedMime,
} from "@/lib/uploads";
import {
  checkRateLimit,
  clientIp,
  envInt,
  rateLimitHeaders,
} from "@/lib/rate-limit";

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const items = await listUploads(80);
  return NextResponse.json({ ok: true, items, limits: uploadLimits() });
}

export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  const ip = clientIp(request);
  const rl = checkRateLimit({
    key: `upload:${employee.id}:${ip}`,
    limit: envInt("UPLOAD_RATE_PER_HOUR", 40),
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => typeof File !== "undefined" && f instanceof File);
  const limits = uploadLimits();
  if (!files.length) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }
  if (files.length > limits.maxFilesPerRequest) {
    return NextResponse.json(
      { error: `Max ${limits.maxFilesPerRequest} files per request.` },
      { status: 400 },
    );
  }

  const saved = [];
  for (const file of files) {
    if (!isAllowedMime(file.type || "application/octet-stream")) {
      return NextResponse.json({ error: `Type not allowed: ${file.type}` }, { status: 400 });
    }
    if (file.size > limits.maxBytes) {
      return NextResponse.json({ error: `File too large: ${file.name}` }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const record = await saveUpload({
      id: newId(),
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
      uploadedBy: employee.id,
    });
    saved.push(record);
  }

  return NextResponse.json(
    { ok: true, files: saved },
    { headers: rateLimitHeaders(rl) },
  );
}
