import prisma from "./db";
import env from "./env";

/*
 * ALLOWED_EMAILS (comma separated) turns the app into one shared workspace: only those
 * accounts may sign in, and all of them read and write the data owned by the first email.
 * When it is empty, anyone who can sign in gets their own separate data.
 */
export const allowedEmails: string[] = env.ALLOWED_EMAILS.split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (allowedEmails.length === 0) return true;
  return !!email && allowedEmails.includes(email.trim().toLowerCase());
}

let cachedOwnerId: string | null = null;

export async function resolveDataOwnerId(user: { id: string }): Promise<string> {
  if (allowedEmails.length === 0) return user.id;
  if (cachedOwnerId) return cachedOwnerId;
  const email = allowedEmails[0];
  // The owner may not have signed in yet; this row is completed by the OAuth upsert later.
  const owner = await prisma.user.upsert({
    where: { email },
    create: { email, name: email, provider: "google", providerId: "" },
    update: {},
  });
  cachedOwnerId = owner.id;
  return owner.id;
}
