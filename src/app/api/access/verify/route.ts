// src/app/api/access/verify/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    const validCode = process.env.ACCESS_CODE;
    if (!validCode) {
      return NextResponse.json({ error: 'ACCESS_CODE not configured' }, { status: 500 });
    }
    if (code === validCode) {
      const response = NextResponse.json({ success: true });
      // Set a cookie to indicate access granted (expires in 1 day)
      response.cookies.set('access_granted', 'true', { maxAge: 24 * 60 * 60, path: '/' });
      return response;
    }
    return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
