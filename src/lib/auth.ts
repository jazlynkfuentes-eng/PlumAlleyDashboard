import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { authConfig } from "@/lib/auth.config";

const ownerEmail = process.env.OWNER_EMAIL ?? "owner@plumaalley.com";
const ownerPassword = process.env.OWNER_PASSWORD ?? "portfolio123";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (email !== ownerEmail.toLowerCase()) return null;

        const looksHashed = ownerPassword.startsWith("$2");
        const ok = looksHashed
          ? await compare(password, ownerPassword)
          : password === ownerPassword;

        if (!ok) return null;
        return { id: "owner", email: ownerEmail, name: "Portfolio Owner" };
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
});
