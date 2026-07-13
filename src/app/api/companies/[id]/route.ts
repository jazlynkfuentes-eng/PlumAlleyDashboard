import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const company = await prisma.company.update({
    where: { id },
    data: {
      websiteUrl: body.websiteUrl === undefined ? undefined : body.websiteUrl,
      linkedinUrl: body.linkedinUrl === undefined ? undefined : body.linkedinUrl,
      newsFeedUrl: body.newsFeedUrl === undefined ? undefined : body.newsFeedUrl,
    },
  });

  return NextResponse.json({ company });
}
