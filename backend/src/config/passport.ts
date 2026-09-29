import passport from "passport";
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy, Profile as MicrosoftProfile } from "passport-microsoft";
import prisma from "./db";
import env from "./env";

/**
 * Finds an existing User by (provider, providerId) or by email, otherwise
 * creates a new one. First login auto-registers the user, per the contract:
 * "there is no multi-tenant complexity... first login auto-registers."
 */
async function upsertUserFromProfile(params: {
  provider: "google" | "microsoft";
  providerId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}) {
  const { provider, providerId, email, name, avatarUrl } = params;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        provider,
        providerId,
        name,
        avatarUrl: avatarUrl ?? existing.avatarUrl,
      },
    });
  }

  return prisma.user.create({
    data: {
      email,
      name,
      avatarUrl: avatarUrl ?? null,
      provider,
      providerId,
    },
  });
}

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${env.BACKEND_URL}/api/auth/google/callback`,
        scope: ["profile", "email"],
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: GoogleProfile,
        done: (error: any, user?: Express.User | false) => void
      ) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("Tài khoản Google không có địa chỉ email."));
          }
          const user = await upsertUserFromProfile({
            provider: "google",
            providerId: profile.id,
            email,
            name: profile.displayName || email,
            avatarUrl: profile.photos?.[0]?.value ?? null,
          });
          return done(null, user as unknown as Express.User);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
} else {
  // eslint-disable-next-line no-console
  console.warn(
    "[passport] Thiếu GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — đăng nhập Google sẽ không khả dụng."
  );
}

if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
  passport.use(
    new MicrosoftStrategy(
      {
        clientID: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        callbackURL: `${env.BACKEND_URL}/api/auth/microsoft/callback`,
        scope: ["user.read"],
        tenant: "common",
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: MicrosoftProfile,
        done: (error: any, user?: Express.User | false) => void
      ) => {
        try {
          const email =
            profile.emails?.[0]?.value ||
            (profile._json && (profile._json.mail || profile._json.userPrincipalName));
          if (!email) {
            return done(new Error("Tài khoản Microsoft không có địa chỉ email."));
          }
          const user = await upsertUserFromProfile({
            provider: "microsoft",
            providerId: profile.id,
            email,
            name: profile.displayName || email,
            avatarUrl: null,
          });
          return done(null, user as unknown as Express.User);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
} else {
  // eslint-disable-next-line no-console
  console.warn(
    "[passport] Thiếu MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET — đăng nhập Microsoft sẽ không khả dụng."
  );
}

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as any).id as string);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user ?? false);
  } catch (err) {
    done(err as Error);
  }
});

export default passport;
