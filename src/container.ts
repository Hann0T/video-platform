import { createHmac } from "node:crypto";
import { getConfig, type AppConfig } from "./config/index.js";
import { createPrismaClient, type PrismaClient } from "./db/prisma.js";
import { UsersService } from "./modules/users/index.js";
import { AuthService, TokenService } from "./modules/auth/index.js";
import {
  createAuthenticate,
  type Authenticate,
} from "./middleware/authenticate.js";
import { Gate } from "./authorization/gate.js";
import { VideoPolicy } from "./authorization/policies/video.policy.js";
import {
  PlaybackTokenService,
  StorageService,
  VideosService,
} from "./modules/videos/index.js";
import {
  createAuthenticatePlayback,
  type AuthenticatePlayback,
} from "./middleware/authenticate-playback.js";
import {
  createUploadMiddleware,
  type UploadMiddleware,
} from "./middleware/upload.js";

/**
 * Composition root.
 *
 * This is the ONLY place where concrete service instances are constructed and
 * their dependencies are wired together. Modules never import each other's
 * singletons directly; instead, the container instantiates each service class
 * and injects the dependencies it needs. Route/controller factories receive
 * their service instances from here (via app.ts).
 */
export type Container = {
  config: AppConfig;
  prisma: PrismaClient;
  usersService: UsersService;
  tokenService: TokenService;
  authService: AuthService;
  authenticate: Authenticate;
  authenticatePlayback: AuthenticatePlayback;
  gate: Gate;
  storageService: StorageService;
  playbackTokens: PlaybackTokenService;
  videosService: VideosService;
  upload: UploadMiddleware;
};

export type ContainerOverrides = Partial<{
  config: AppConfig;
  prisma: PrismaClient;
}>;

/**
 * Build the application container. Accepts overrides so tests can inject a
 * custom config/prisma (e.g., pointing at the SQLite test database).
 */
export function createContainer(overrides: ContainerOverrides = {}): Container {
  const config = overrides.config ?? getConfig();
  const prisma = overrides.prisma ?? createPrismaClient(config.databaseUrl);

  // --- service graph (dependencies injected explicitly) ---
  const usersService = new UsersService(prisma);
  const tokenService = new TokenService(prisma, {
    accessSecret: config.jwt.accessSecret,
    refreshSecret: config.jwt.refreshSecret,
    accessExpiresIn: config.jwt.accessExpiresIn,
    refreshExpiresIn: config.jwt.refreshExpiresIn,
  });
  const authService = new AuthService(usersService, tokenService);

  // --- shared middleware (also DI-wired) ---
  const authenticate = createAuthenticate(tokenService, usersService);

  // --- authorization (policies -> gate) ---
  const gate = new Gate(new VideoPolicy());

  // --- storage (local disk) ---
  const storageService = new StorageService({
    uploadDir: config.uploadDir,
    maxFileSize: config.maxFileSize,
  });
  const upload = createUploadMiddleware(storageService);

  // --- videos module ---
  // Playback tokens get their own key so they can never pass as access tokens.
  // If no secret is configured, derive one from the access secret with HMAC.
  const playbackTokens = new PlaybackTokenService({
    secret:
      config.stream?.secret ??
      createHmac("sha256", config.jwt.accessSecret)
        .update("playback-token-v1")
        .digest("hex"),
    expiresIn: config.stream?.expiresIn ?? "2h",
  });
  const authenticatePlayback = createAuthenticatePlayback(
    playbackTokens,
    usersService,
  );
  const videosService = new VideosService(
    prisma,
    storageService,
    gate,
    playbackTokens,
  );

  return {
    config,
    prisma,
    usersService,
    tokenService,
    authService,
    authenticate,
    authenticatePlayback,
    gate,
    storageService,
    playbackTokens,
    videosService,
    upload,
  };
}
