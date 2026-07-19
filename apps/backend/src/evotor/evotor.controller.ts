import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { UUID_FORM } from './parse';
import { EvotorService } from './evotor.service';

/**
 * Приёмники уведомлений Эвотора (этап 2, ТЗ р.10).
 *
 * В кабинете разработчика Эвотора указывается БАЗОВЫЙ URL товароучётной
 * системы; к нему Эвотор дописывает канонические пути. Наша база:
 *   https://<домен>/api/v1/evotor
 * — тогда все пути попадают под глобальный префикс api/v1 и уже настроенный
 * маршрут nginx /api/ -> backend. Итоговые адреса:
 *   POST {base}/api/v1/user/token                     — доставка токена
 *   POST {base}/installation/event                    — установка/удаление
 *   PUT  {base}/                                      — чеки (документы)
 *   POST {base}/inventories/stores/{uuid}/products    — номенклатура
 * Алиасы без канонических хвостов оставлены на случай, если в кабинете
 * окажутся отдельные поля URL на каждый тип уведомления.
 *
 * Тела принимаем нетипизированными (unknown): формат пушей местами не
 * задокументирован однозначно, разбор — толерантный (см. parse.ts);
 * глобальный ValidationPipe классы без декораторов не трогает.
 */
@Controller('evotor')
export class EvotorController {
  constructor(private readonly evotor: EvotorService) {}

  /** Установка приложения: Эвотор доставляет per-installation токен. */
  @Post(['api/v1/user/token', 'user/token'])
  @HttpCode(200)
  async userToken(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { userId?: string; token?: string },
  ): Promise<Record<string, never>> {
    this.evotor.verifyPush(auth);
    if (!body?.userId || !body?.token) {
      throw new BadRequestException('ожидаются userId и token');
    }
    await this.evotor.saveUserToken(body.userId, body.token);
    return {};
  }

  /** Жизненный цикл: ApplicationInstalled / ApplicationUninstalled. */
  @Post('installation/event')
  @HttpCode(200)
  async installationEvent(
    @Headers('authorization') auth: string | undefined,
    @Body() body: unknown,
  ): Promise<Record<string, never>> {
    this.evotor.verifyPush(auth);
    await this.evotor.handleInstallationEvent(body);
    return {};
  }

  /**
   * Чеки (ТЗ-2). «Чеки (ver.2)» кабинет шлёт POST-ом (канонический путь
   * partner.ru/api/v2/receipts); старый метод документов — PUT в корень.
   * Держим оба метода на одном обработчике.
   */
  @Put(['', 'docs'])
  @HttpCode(200)
  async receipt(
    @Headers('authorization') auth: string | undefined,
    @Body() body: unknown,
  ): Promise<Record<string, never>> {
    this.evotor.verifyPush(auth);
    await this.evotor.handleReceipt(body);
    return {};
  }

  /** Чеки (ver.2): POST-вариант того же приёмника. */
  @Post(['docs', 'receipts', 'api/v2/receipts'])
  @HttpCode(200)
  receiptPost(
    @Headers('authorization') auth: string | undefined,
    @Body() body: unknown,
  ): Promise<Record<string, never>> {
    return this.receipt(auth, body);
  }

  /** Номенклатура: массив товаров магазина storeUuid (ТЗ-3). */
  @Post('inventories/stores/:storeUuid/products')
  @HttpCode(200)
  async productsPush(
    @Headers('authorization') auth: string | undefined,
    @Param('storeUuid') storeUuid: string,
    @Body() body: unknown,
  ): Promise<Record<string, never>> {
    // Пуши номенклатуры Эвотор авторизует ТОКЕНОМ ПОЛЬЗОВАТЕЛЯ (текст в
    // кабинете), а не токеном из настройки — принимаем оба.
    await this.evotor.verifyPushAllowUserToken(auth);
    // UUID_FORM, а не ParseUUIDPipe: у идентификаторов Эвотора нестандартные
    // version/variant-биты (напр. 20180820-7052-...), строгая проверка версии
    // отвергла бы живые ID. Мусор режем до записи в БД (uuid-колонки).
    if (!UUID_FORM.test(storeUuid)) {
      throw new BadRequestException('storeUuid должен быть UUID');
    }
    await this.evotor.handleProductsPush(storeUuid, body);
    return {};
  }
}
