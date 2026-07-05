import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  /** Корень API — имя сервиса и версия контракта (не health-check). */
  @Get()
  root() {
    return { service: 'altai-backend', api: 'v1' };
  }
}
