import { SchemaType } from '@google/generative-ai';
import { EventType } from '@/constants/voucher';
import {
  InvoiceTransactionDirection,
  CurrencyType,
  InvoiceTaxType,
  InvoiceType,
} from '@/constants/invoice';

export const GEMINI_MODE = {
  // Deprecate: (2024814 - Murky)  flash is cheaper but pro is better.
  INVOICE: 'gemini-1.5-flash',
  VOUCHER: 'gemini-1.5-pro',
  // INVOICE: 'gemini-1.5-flash',
};

export const GEMINI_PROMPT = {
  INVOICE: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        id: {
          description: 'ID in database, 0 if not yet saved in database',
          nullable: false,
          type: SchemaType.NUMBER,
        },
        inputOrOutput: {
          description: 'Is invoice caused by input or output of money',
          enum: Object.values(InvoiceTransactionDirection),
          nullable: false,
          type: SchemaType.STRING,
        },
        date: {
          description:
            'Date of invoice, selected by user timestamp in seconds 10 digits',
          nullable: false,
          type: SchemaType.NUMBER,
        },
        no: {
          description: 'Invoice number',
          nullable: false,
          type: SchemaType.STRING,
        },
        currencyAlias: {
          description: 'Currency type',
          enum: Object.values(CurrencyType),
          nullable: false,
          type: SchemaType.STRING,
        },
        priceBeforeTax: {
          description: 'Price before tax',
          nullable: false,
          type: SchemaType.NUMBER,
        },
        taxType: {
          description:
            'Tax type, taxable or tax-exempt, zero tax rate included in taxable',
          enum: Object.values(InvoiceTaxType),
          nullable: false,
          type: SchemaType.STRING,
        },
        taxRatio: {
          description: 'Tax ratio, 5% will be written as 5',
          nullable: false,
          type: SchemaType.NUMBER,
        },
        taxPrice: {
          description: 'Amount of consumption tax',
          nullable: false,
          type: SchemaType.NUMBER,
        },
        totalPrice: {
          description: 'Total price after tax',
          nullable: false,
          type: SchemaType.NUMBER,
        },
        type: {
          description: 'Invoice type from the tax bureau',
          enum: Object.values(InvoiceType),
          nullable: false,
          type: SchemaType.STRING,
        },
        deductible: {
          description: 'Is this invoice deductible',
          nullable: false,
          type: SchemaType.BOOLEAN,
        },
        counterPartyName: {
          description: 'Name of the counterparty',
          nullable: false,
          type: SchemaType.STRING,
        },
      },
    },
  },
  VOUCHER: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        voucherDate: {
          description: 'The date of the voucher in the format YYYY-MM-DD',
          nullable: false,
          type: SchemaType.STRING,
        },
        type: {
          description: 'The type of the voucher',
          enum: Object.values(EventType),
          nullable: false,
          type: SchemaType.STRING,
        },
        note: {
          description: 'Additional notes for the voucher',
          nullable: false,
          type: SchemaType.STRING,
        },
        counterpartyName: {
          description: 'The name of the counterparty involved in the voucher',
          nullable: false,
          type: SchemaType.STRING,
        },
        lineItems: {
          description: 'The line items included in the voucher',
          nullable: false,
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id: {
                description: 'The unique identifier for the line item',
                nullable: false,
                type: SchemaType.NUMBER,
              },
              amount: {
                description: 'The amount of money for the line item',
                nullable: false,
                type: SchemaType.NUMBER,
              },
              description: {
                description: 'The description of the line item',
                nullable: false,
                type: SchemaType.STRING,
              },
              debit: {
                description: 'Indicates if the line item is a debit',
                nullable: true,
                type: SchemaType.BOOLEAN,
              },
              account: {
                description: 'The account name associated with the line item',
                nullable: false,
                type: SchemaType.STRING,
              },
            },
          },
        },
      },
    },
  },
};
