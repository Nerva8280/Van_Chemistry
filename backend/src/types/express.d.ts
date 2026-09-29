import { User as PrismaUser } from "@prisma/client";

declare global {
  namespace Express {
    // Augment Passport's Express.User with our Prisma User shape so that
    // req.user is fully typed across controllers/middleware.
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends PrismaUser {}

    interface Request {
      /** Owner of the data being accessed; set by requireAuth. */
      ownerId?: string;
    }
  }
}

export {};
