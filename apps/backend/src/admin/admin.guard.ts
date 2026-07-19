import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { tokenFromHeader, verifyAdminToken } from './admin-token';

/** Защита админ-эндпоинтов: валидный подписанный токен в Authorization. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('ADMIN_SESSION_SECRET', '');
    if (!secret) {
      // Ключ не задан — админка не сконфигурирована, а не «доступ открыт».
      throw new ServiceUnavailableException('Админка не настроена');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const token = tokenFromHeader(req.headers.authorization);
    if (!verifyAdminToken(secret, token, Date.now())) {
      throw new UnauthorizedException('Требуется вход');
    }
    return true;
  }
}
