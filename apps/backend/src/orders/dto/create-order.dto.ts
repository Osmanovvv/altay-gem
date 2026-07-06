import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @IsString()
  @Length(1, 200)
  id!: string; // slug товара

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  /** Цена, которую видел покупатель, — для детекта «изменилась цена». */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceRub?: number;
}

export class CreateOrderDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsString()
  @Matches(/^[+]?[\d\s()-]{10,20}$/, {
    message: 'телефон в формате +7 (XXX) XXX-XX-XX',
  })
  phone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'некорректный e-mail' })
  email?: string;

  @IsIn(['pickup_leningradskaya', 'pickup_titova', 'courier_nsk', 'russia'])
  deliveryMethod!:
    | 'pickup_leningradskaya'
    | 'pickup_titova'
    | 'courier_nsk'
    | 'russia';

  @IsOptional()
  @IsString()
  @Length(0, 500)
  deliveryAddress?: string;

  @IsIn(['online', 'cash_on_pickup', 'card_on_pickup'])
  paymentMethod!: 'online' | 'cash_on_pickup' | 'card_on_pickup';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @IsString()
  @Length(1, 64)
  promoCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  comment?: string;
}
