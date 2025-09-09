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
        invoiceList: {
          description: 'The list of invoices',
          nullable: false,
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              date: {
                description:
                  'The date of the invoice in timestamp with 10 digits',
                nullable: false,
                type: SchemaType.INTEGER,
              },
              no: {
                description: 'The invoice number',
                nullable: false,
                type: SchemaType.STRING,
              },
              currencyAlias: {
                description: 'The currency of the invoice',
                enum: Object.values(CurrencyType),
                nullable: false,
                type: SchemaType.STRING,
              },
              priceBeforeTax: {
                description: 'The price before tax',
                nullable: false,
                type: SchemaType.NUMBER,
              },
              taxType: {
                description: 'The type of tax',
                enum: Object.values(InvoiceTaxType),
                nullable: false,
                type: SchemaType.STRING,
              },
              taxRatio: {
                description: 'The ratio of tax',
                nullable: false,
                type: SchemaType.NUMBER,
              },
              taxPrice: {
                description: 'The price of tax',
                nullable: false,
                type: SchemaType.NUMBER,
              },
              totalPrice: {
                description: 'The total price after tax',
                nullable: false,
                type: SchemaType.NUMBER,
              },
              type: {
                description: 'The type of the invoice',
                enum: Object.values(InvoiceType),
                nullable: false,
                type: SchemaType.STRING,
              },
              transactionDirection: {
                description: 'The direction of the transaction',
                enum: Object.values(InvoiceTransactionDirection),
                nullable: false,
                type: SchemaType.STRING,
              },
            },
          },
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
          description:
            'The date of the voucher, , transfer to timestamp in seconds with 10 digits',
          nullable: false,
          type: SchemaType.INTEGER,
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
