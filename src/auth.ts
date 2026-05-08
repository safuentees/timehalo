import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/password";
import { sendEmail } from "@/lib/email";
import { bootstrapUserWorkspace, resolveAuthRedirect } from "@/lib/auth-events";
import { createLogger } from "@/lib/logger";
import type { JWT } from "next-auth/jwt";

const log = createLogger("auth");

const MAX_LOGIN_ATTEMPTS = 5;
const APP_NAME = "Officehours";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // `allowDangerousEmailAccountLinking` lets Auth.js merge a GitHub
    // OAuth sign-in into an existing User row when the verified emails
    // match — so a host who registered with credentials and later
    // taps "Continue with GitHub" lands on the same account instead of
    // a fresh stub. Auth.js v5 default is to NOT link (per the
    // `OAuthAccountNotLinked` error class) because some OAuth
    // providers don't verify the address they hand back; GitHub does
    // (verified primary email is the only one returned by the API),
    // so the "dangerous" naming is overcautious for this specific
    // provider. Same call cal.com + dub make. Reference: Auth.js
    // docs `Define Email Account Linking` (Context7-verified
    // 2026-04-30).
    GitHub({ allowDangerousEmailAccountLinking: true }),
    // Magic-link sign-in (C4). Uses next-auth's `http-email` provider
    // type — same VerificationToken table dance as the canonical
    // Nodemailer provider, but the actual send is delegated to our
    // existing email layer (A1's Resend wrapper). One transport,
    // one log surface, one place to extend templates.
    //
    // Pattern reference (Context7): next-auth's "Configuring HTTP
    // Email" doc — http-email provider type + custom
    // sendVerificationRequest, no nodemailer dep.
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
  // Bounce back to /login (with `?error=<code>`) instead of next-auth's
  // unbranded default page or a 404. Reference: cal.com surfaces error
  // codes on /auth/error the same way.
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/login",
  },
  events: {
    // Mints a Personal Workspace + OWNER Membership for any user that
    // next-auth auto-creates — magic-link first click for an
    // unregistered email, GitHub OAuth first sign-in. The credentials
    // /register path already does this in its own $transaction; this
    // closes the loop for non-credentials sign-ups so bookings.create
    // never hits a non-null violation on workspaceId.
    createUser: async ({ user }) => {
      try {
        await bootstrapUserWorkspace({
          id: user.id!,
          email: user.email ?? null,
        });
      } catch (error) {
        // Don't block sign-in — the user can repair this via the
        // workspaces UI. Log so it shows up in operator dashboards.
        log.error("auth.createUser workspace bootstrap failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  },
  callbacks: {
    redirect: async ({ url, baseUrl }) => resolveAuthRedirect({ url, baseUrl }),
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
