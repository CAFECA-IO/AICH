import { Type } from 'class-transformer';

import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

import {
  EventType,
  PaymentStatusType,
  PaymentPeriodType,
} from '../types/account';

import { AccountInvoiceWithPaymentMethod } from '../interfaces/account';

export class PaymentDetailsDTO {
  @IsNumber()
  price: number;

  @IsBoolean()
  hasTax: boolean;

  @IsNumber()
  @IsOptional()
  taxPercentage?: number;

  @IsBoolean()
  hasFee: boolean;

  @IsNumber()
  @IsOptional()
  fee?: number;

  @IsString()
  paymentMethod: string;

  @IsEnum(PaymentPeriodType)
  paymentPeriod: PaymentPeriodType;

  @IsNumber()
  installmentPeriod: number;

  @IsEnum(PaymentStatusType)
  paymentStatus: PaymentStatusType;

  @IsNumber()
  alreadyPaidAmount: number;
}

export class AccountInvoiceDataWithPaymentMethodDTO {
  @IsPositive()
  date: number;

  @IsString()
  invoiceId: string;

  @IsString()
  projectId: string;

  @IsString()
  contractId: string;

  @IsEnum(EventType)
  eventType: EventType;

  @IsString()
  paymentReason: string;

  @IsString()
  description: string;

  @IsString()
  venderOrSupplyer: string;

  @ValidateNested()
  @Type(() => PaymentDetailsDTO)
  payment: PaymentDetailsDTO;
}

export function transformDTOToInvoiceWithPaymentMethod(
  dto: AccountInvoiceDataWithPaymentMethodDTO,
): AccountInvoiceWithPaymentMethod {
  return {
    date: dto.date,
    invoiceId: dto.invoiceId,
    projectId: dto.projectId,
    contractId: dto.contractId,
    eventType: dto.eventType,
    paymentReason: dto.paymentReason,
    description: dto.description,
    venderOrSupplyer: dto.venderOrSupplyer,
    payment: {
      price: dto.payment.price,
      hasTax: dto.payment.hasTax,
      taxPercentage: dto.payment.taxPercentage || 0, // Default to 0 if optional and not provided
      hasFee: dto.payment.hasFee,
      fee: dto.payment.fee || 0, // Default to 0 if optional and not provided
      paymentMethod: dto.payment.paymentMethod,
      paymentPeriod: dto.payment.paymentPeriod,
      installmentPeriod: dto.payment.installmentPeriod,
      paymentStatus: dto.payment.paymentStatus,
      alreadyPaidAmount: dto.payment.alreadyPaidAmount,
    },
  };
}
