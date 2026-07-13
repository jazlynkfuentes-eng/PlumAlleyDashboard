import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {


  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const company = await prisma.company.update({
    where: { id },
    data: {
    },
  });

  return NextResponse.json({ company });
}
