import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../lib/http.js";
import { ROLES } from "../../authorization/permissions.js";

const BCRYPT_ROUNDS = 10;

/** A user shape safe to return over the API (never includes passwordHash). */
export type PublicUser = {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
};

/** A user enriched with its role name + the permission names it is granted. */
export type UserWithPermissions = PublicUser & {
  permissions: string[];
};

export type CreateUserInput = {
  email: string;
  password: string;
  roleName?: string;
};

/**
 * UsersService owns all persistence and business logic for users. It is the
 * module's public surface (exposed via index.ts) and the only way other
 * modules (e.g. auth) interact with user data.
 */
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Create a user with a hashed password, assigned to the given role. */
  async create(input: CreateUserInput): Promise<PublicUser> {
    const roleName = input.roleName ?? ROLES.USER;

    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictError("A user with this email already exists");
    }

    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });
    if (!role) {
      throw new NotFoundError(`Role '${roleName}' does not exist`);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        roleId: role.id,
      },
      include: { role: true },
    });

    return this.toPublicUser(user.id, user.email, user.role.name, user.createdAt);
  }

  /** Verify a plaintext password against a user's stored hash. */
  async verifyPassword(
    plaintext: string,
    passwordHash: string,
  ): Promise<boolean> {
    return bcrypt.compare(plaintext, passwordHash);
  }

  /**
   * Internal lookup used by the auth module during login. Returns the full
   * record (including passwordHash) so credentials can be verified. Not
   * exposed over the API.
   */
  async findByEmailWithSecret(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  /** Load a user with its role + flattened permission names. */
  async findByIdWithPermissions(
    id: string,
  ): Promise<UserWithPermissions | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role.name,
      createdAt: user.createdAt,
      permissions: user.role.permissions.map((rp) => rp.permission.name),
    };
  }

  private toPublicUser(
    id: string,
    email: string,
    role: string,
    createdAt: Date,
  ): PublicUser {
    return { id, email, role, createdAt };
  }
}
