import { NextResponse } from "next/server";
import mock from "@/data/military_mock.json";

export async function GET() {
  return NextResponse.json(mock, { headers: { "Cache-Control": "public, max-age=30" } });
}
