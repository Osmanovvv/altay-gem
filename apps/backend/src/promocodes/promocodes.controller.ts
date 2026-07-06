import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PromocodesService } from './promocodes.service';

class PromoCartItemDto {
  @IsString()
  @Length(1, 200)
  id!: string; // slug товара

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

class PromoValidateDto {
  @IsString()
  @Length(1, 64)
  code!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PromoCartItemDto)
  items!: PromoCartItemDto[];
}

@Controller('promo')
export class PromocodesController {
  constructor(private readonly promocodes: PromocodesService) {}

  /** ТЗ р.9: применимость, размер скидки в рублях, причина отказа. */
  @Post('validate')
  @HttpCode(200)
  validate(@Body() dto: PromoValidateDto) {
    return this.promocodes.validate(dto.code, dto.items);
  }
}
