import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // No specific role required
    }

    const { user } = context.switchToHttp().getRequest();
    
    if (!user) {
      return false;
    }

    return requiredRoles.some((role) => user.role === role);
  }
}

// Division access guard - ensures user can only access their division's data
@Injectable()
export class DivisionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const requestedDivision = request.params.division || request.body?.division;

    // Owners and Managers can access all divisions
    if (user.role === 'OWNER' || user.role === 'MANAGER') {
      return true;
    }

    // Others can only access their own division
    if (!user.division || !requestedDivision) {
      return true; // Let the business logic handle validation
    }

    return user.division === requestedDivision;
  }
}
