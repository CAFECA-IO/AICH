import { SchemaType } from '@google/generative-ai';
import {
  EVENT_TYPE,
  PAYMENT_PERIOD_TYPE,
  PAYMENT_STATUS_TYPE,
} from '@/constants/account';

export const GEMINI_MODE = {
  // Deprecate: (2024814 - Murky)  flash is cheaper.
  // INVOICE: 'gemini-1.5-pro',
  INVOICE: 'gemini-1.5-flash',
};

export const GEMINI_PROMPT = {
  INVOICE: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        date: {
          description:
            'The payment date (not expense happen day) of the invoice in the format YYYY-MM-DD, 民國100年是從2011開始',
          nullable: false,
          type: SchemaType.STRING,
        },
        eventType: {
          description:
            'What business activity is this invoice invoice , it might be receive, expense or transfer between accounts',
          enum: Object.values(EVENT_TYPE),
          nullable: false,
          type: SchemaType.STRING,
        },
        paymentReason: {
          description:
            'The reason for the payment or the receive, what business activity is this invoice for, use Traditional Chinese if possible',
          nullable: false,
          type: SchemaType.STRING,
        },
        description: {
          description:
            'The description of the invoice, in more detail, like each item invoice buy, use Traditional Chinese if possible',
          nullable: false,
          type: SchemaType.STRING,
        },
        validatorOrSupplier: {
          description:
            'The vendor or supplier of the invoice, who is the invoice from or sales to, use Traditional Chinese if possible',
          nullable: false,
          type: SchemaType.STRING,
        },
        payment: {
          description: 'The payment (or receive) detail of the invoice',
          nullable: false,
          type: SchemaType.OBJECT,
          properties: {
            isRevenue: {
              description: 'Is this invoice causing revenue or not',
              nullable: false,
              type: SchemaType.BOOLEAN,
            },
            price: {
              description: 'The sum of price or amount of money this invoice',
              nullable: false,
              type: SchemaType.NUMBER,
            },
            hasTax: {
              description: 'Does this invoice include tax or not',
              nullable: false,
              type: SchemaType.BOOLEAN,
            },
            taxPercentage: {
              description: 'The tax rate of this invoice',
              nullable: false,
              type: SchemaType.NUMBER,
            },
            hasFee: {
              description: 'Does this invoice include fee or not (例如手續費)',
              nullable: false,
              type: SchemaType.BOOLEAN,
            },
            fee: {
              description: 'The fee of this invoice',
              nullable: false,
              type: SchemaType.NUMBER,
            },
            method: {
              description:
                'The method of payment or receive, like cash, credit card, bank transfer, etc.',
              nullable: false,
              type: SchemaType.STRING,
            },
            period: {
              description: 'The period of payment, at once or installment',
              enum: Object.values(PAYMENT_PERIOD_TYPE),
              nullable: false,
              type: SchemaType.STRING,
            },
            installmentPeriod: {
              description:
                'The period of installment payment, how many installment, 0 if at once',
              nullable: false,
              type: SchemaType.NUMBER,
            },
            alreadyPaid: {
              description:
                'The amount of money already paid or received, 0 if none',
              nullable: false,
              type: SchemaType.NUMBER,
            },
            status: {
              description: 'The status of payment, paid, unpaid or partial',
              enum: Object.values(PAYMENT_STATUS_TYPE),
              nullable: false,
              type: SchemaType.STRING,
            },
            process: {
              description:
                'The progress of the payment, 0-100, 0 if none, 100 if completed',
              nullable: false,
              type: SchemaType.NUMBER,
            },
          },
        },
      },
    },
  },
};
