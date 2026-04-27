import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/password";
import { sendEmail } from "@/lib/email";
import type { JWT } from "next-auth/jwt";

const MAX_LOGIN_ATTEMPTS = 5;
const APP_NAME = "Officehours";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub,
    {
      id: "magic-link",
      name: "Email",
      type: "email",
      maxAge: 60 * 60 * 24, // 24h link lifetime
      async sendVerificationRequest({ identifier, url }) {
        const result = await sendEmail({
          to: identifier,
          template: "magic-link-signin",
          props: { signInUrl: url, appName: APP_NAME },
        });
        if (!result.ok) {
          throw new Error(
            `Magic link send failed: ${
              result.reason === "no-key"
                ? "Resend not configured"
                : "send-failed"
            }`,
          );
        }
      },
    },
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const { email: rawEmail, password } = credentials as {
          email: string;
          password: string;
        };
        const email = rawEmail.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            passwordHash: true,
            name: true,
            email: true,
            image: true,
            invalidLoginAttempts: true,
            emailVerified: true,
          },
        });

        if (!user || !user.passwordHash) {
          throw new Error("Invalid credentials");
        }

        if (user.invalidLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
          throw new Error("Too many failed attempts. Try again later.");
        }

        const passwordMatch = await validatePassword({
          password,
          passwordHash: user.passwordHash,
        });

        if (!passwordMatch) {
          await prisma.user.update({
            where: { id: user.id },
            data: { invalidLoginAttempts: { increment: 1 } },
          });
          throw new Error("Invalid credentials");
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { invalidLoginAttempts: 0 },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    jwt: async ({ token, user, trigger }) => {
      if (user) {
        token.name = user.name;
        token.email = user.email;
        token.image = user.image;
      }
      if (trigger === "update") {
        const refreshedUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: { name: true, email: true, image: true },
        });
        if (!refreshedUser) return {} as JWT;
        token.name = refreshedUser.name;
        token.email = refreshedUser.email;
        token.image = refreshedUser.image;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.sub!;
      session.user.name = token.name ?? "";
      session.user.email = token.email ?? "";
      session.user.image = token.image as string | undefined;
      return session;
    },
  },
});
