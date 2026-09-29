declare module "passport-microsoft" {
  import { Request } from "express";
  import { Strategy as PassportStrategy } from "passport";

  export interface Profile {
    id: string;
    displayName: string;
    name?: { familyName?: string; givenName?: string };
    emails?: Array<{ value: string; type?: string }>;
    _json?: any;
    provider: string;
  }

  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
    tenant?: string;
    authorizationURL?: string;
    tokenURL?: string;
    passReqToCallback?: false;
  }

  export interface StrategyOptionsWithRequest extends Omit<StrategyOptions, "passReqToCallback"> {
    passReqToCallback: true;
  }

  export type VerifyCallback = (
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: any, user?: any) => void
  ) => void;

  export type VerifyCallbackWithRequest = (
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: any, user?: any) => void
  ) => void;

  export class Strategy extends PassportStrategy {
    constructor(options: StrategyOptions, verify: VerifyCallback);
    constructor(options: StrategyOptionsWithRequest, verify: VerifyCallbackWithRequest);
    name: string;
  }
}
