import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const dbUrl = process.env.DATABASE_URL || "";
const connectionUrl = dbUrl.includes('connect_timeout')
  ? dbUrl
  : dbUrl.includes('?')
    ? `${dbUrl}&connect_timeout=5`
    : `${dbUrl}?connect_timeout=5`;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: connectionUrl } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}


