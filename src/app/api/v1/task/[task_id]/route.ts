// nextjs route app for get { result: true };

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ result: true });
}
