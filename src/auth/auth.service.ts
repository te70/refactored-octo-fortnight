import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  // Track failed login attempts to prevent brute force
  private failedAttempts: Map<string, { count: number; lockedUntil?: Date }> = new Map();
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto, ipAddress: string): Promise<LoginResponseDto> {
    // Check if IP is locked
    const lockStatus = this.failedAttempts.get(ipAddress);
    if (lockStatus?.lockedUntil && lockStatus.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (lockStatus.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Too many failed attempts. Account locked for ${remainingMinutes} more minutes.`,
      );
    }

    // Find user by PIN (we'll need to check all users since PIN is the only identifier)
    // In production, consider adding a username field to avoid full table scan
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        pin: true,
        role: true,
        division: true,
      },
    });

    // Check PIN against all active users
    let matchedUser: typeof users[0] | null = null;
    for (const user of users) {
      const isValid = await bcrypt.compare(loginDto.pin, user.pin);
      if (isValid) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      await this.handleFailedLogin(ipAddress);
      throw new UnauthorizedException('Invalid PIN');
    }

    // Clear failed attempts on successful login
    this.failedAttempts.delete(ipAddress);

    // Log the login
    await this.prisma.auditLog.create({
      data: {
        userId: matchedUser.id,
        action: 'LOGIN',
        tableName: 'users',
        recordId: matchedUser.id,
        afterJson: { success: true, deviceFingerprint: loginDto.deviceFingerprint },
        ipAddress,
      },
    });

    // Generate JWT token
    const payload = {
      sub: matchedUser.id,
      role: matchedUser.role,
      division: matchedUser.division,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        role: matchedUser.role,
        division: matchedUser.division,
      },
    };
  }

  private async handleFailedLogin(ipAddress: string): Promise<void> {
    const current = this.failedAttempts.get(ipAddress) || { count: 0 };
    current.count += 1;

    if (current.count >= this.MAX_ATTEMPTS) {
      current.lockedUntil = new Date(Date.now() + this.LOCK_DURATION_MS);
    }

    this.failedAttempts.set(ipAddress, current);

    // Clean up old entries every 100 failed attempts
    if (this.failedAttempts.size > 100) {
      this.cleanupExpiredLocks();
    }
  }

  private cleanupExpiredLocks(): void {
    const now = new Date();
    for (const [ip, data] of this.failedAttempts.entries()) {
      if (data.lockedUntil && data.lockedUntil < now) {
        this.failedAttempts.delete(ip);
      }
    }
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        division: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }

  async hashPin(pin: string): Promise<string> {
    // Cost factor 12 as specified in PRD
    return bcrypt.hash(pin, 12);
  }
}
