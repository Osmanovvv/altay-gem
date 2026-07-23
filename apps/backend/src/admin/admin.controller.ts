import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { eq } from 'drizzle-orm';
import { CatalogService } from '../catalog/catalog.service';
import { DB, type Database } from '../db/database.module';
import { evotorProducts } from '../db/schema';
import { ReconcileService } from '../evotor/reconcile.service';
import {
  ORDER_STATUSES,
  OrderStatus,
  OrdersService,
} from '../orders/orders.service';
import { passwordMatches, signAdminToken } from './admin-token';
import { AdminGuard } from './admin.guard';

/** Срок жизни токена админ-сессии. */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** Способы получения (фильтр списка заказов для кассира точки, шаг 5). */
const DELIVERY_METHODS = [
  'pickup_leningradskaya',
  'pickup_titova',
  'courier_nsk',
  'russia',
];

class LoginDto {
  @IsString()
  @Length(1, 200)
  password!: string;
}

class SetStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

/** Коды Data Matrix позиции, отсканированные при сборке (шаг 4). */
class MarkCodesDto {
  @IsArray()
  @ArrayMaxSize(999)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  codes!: string[];
}

/**
 * Админка владельца (этап 2, Вариант A). Вход по паролю → подписанный токен;
 * раздел «Заказы» защищён AdminGuard. Логин намеренно без guard.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    private readonly reconcile: ReconcileService,
    private readonly catalog: CatalogService,
    @Inject(DB) private readonly db: Database,
  ) {}

  /**
   * Товар реплики Эвотора по evotor_uuid — серверная валидация связи из
   * админки Strapi (ТЗ 7.2: uuid «выбирается из импортированного каталога»;
   * опечатка не должна молча прятать товар с витрины). 404 = не найден.
   */
  @Get('replica/products/:uuid')
  @UseGuards(AdminGuard)
  async replicaProduct(@Param('uuid') uuid: string) {
    // Кривой формат не отправляем в PG (uuid-колонка бросила бы 22P02).
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uuid)) {
      throw new NotFoundException('Товар с таким evotor_uuid не найден в реплике');
    }
    const rows = await this.db
      .select({
        evotorUuid: evotorProducts.evotorUuid,
        name: evotorProducts.name,
        storeId: evotorProducts.storeId,
        isArchived: evotorProducts.isArchived,
        allowToSell: evotorProducts.allowToSell,
      })
      .from(evotorProducts)
      .where(eq(evotorProducts.evotorUuid, uuid))
      .limit(1);
    if (!rows.length) {
      throw new NotFoundException('Товар с таким evotor_uuid не найден в реплике');
    }
    return rows[0];
  }

  /**
   * Сброс кеша каталога по событию публикации в Strapi (ТЗ р.9: «инвалидация
   * при… публикациях Strapi») — дёргает lifecycle-подписка Strapi через мост.
   */
  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async invalidateCache(): Promise<{ ok: true }> {
    await this.catalog.invalidate();
    return { ok: true };
  }

  /** Вход владельца: пароль → токен сессии (12 ч). */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): { token: string; expiresAt: number } {
    const password = this.config.get<string>('ADMIN_PASSWORD', '');
    const secret = this.config.get<string>('ADMIN_SESSION_SECRET', '');
    if (!password || !secret) {
      throw new ServiceUnavailableException('Админка не настроена');
    }
    if (!passwordMatches(dto.password, password)) {
      throw new UnauthorizedException('Неверный пароль');
    }
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    return { token: signAdminToken(secret, expiresAt), expiresAt };
  }

  /** Список заказов (сводка) с фильтром по статусу и пагинацией. */
  @Get('orders')
  @UseGuards(AdminGuard)
  listOrders(
    @Query('status') status?: string,
    @Query('deliveryMethod') deliveryMethod?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const st =
      status && (ORDER_STATUSES as readonly string[]).includes(status)
        ? (status as OrderStatus)
        : undefined;
    // Фильтр точки для кассира (шаг 5): «заказы Ленинградской к выдаче».
    const dm =
      deliveryMethod && DELIVERY_METHODS.includes(deliveryMethod)
        ? deliveryMethod
        : undefined;
    return this.orders.listOrders({
      status: st,
      deliveryMethod: dm,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** Карточка заказа: состав + контакт покупателя. */
  @Get('orders/:id')
  @UseGuards(AdminGuard)
  order(@Param('id', ParseIntPipe) id: number) {
    return this.orders.adminOrder(id);
  }

  /** Смена статуса (в т.ч. снятие резерва — см. OrdersService.setStatus). */
  @Patch('orders/:id/status')
  @UseGuards(AdminGuard)
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetStatusDto,
  ) {
    return this.orders.setStatus(id, dto.status, dto.reason);
  }

  // ---------- маркировка: сборка + отложенный чек (этап 3, шаг 4) ----------

  /** Сохранить отсканированные коды Data Matrix позиции (экран сборки). */
  @Patch('orders/:id/items/:itemId/mark-codes')
  @UseGuards(AdminGuard)
  saveMarkCodes(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: MarkCodesDto,
  ) {
    return this.orders.saveMarkCodes(id, itemId, dto.codes);
  }

  /**
   * Выбить отложенный чек 54-ФЗ по онлайн-оплаченному маркированному заказу:
   * после сборки, когда все коды отсканированы (ТЗ р.11). Идемпотентно.
   */
  @Post('orders/:id/fiscalize')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  fiscalize(@Param('id', ParseIntPipe) id: number) {
    return this.orders.fiscalizeOrder(id);
  }

  // ---------- мониторинг синхронизации с Эвотором (этап 2, п.9) ----------

  /** Состояние синка: последняя сверка, зависшие события, свежесть вебхуков. */
  @Get('evotor/status')
  @UseGuards(AdminGuard)
  evotorStatus() {
    return this.reconcile.status();
  }

  /** Ручной запуск ночной сверки (например, после загрузки свежей выгрузки). */
  @Post('evotor/reconcile')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  runReconcile() {
    return this.reconcile.runReconcile();
  }
}
