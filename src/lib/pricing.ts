// src/lib/pricing.ts
import "server-only";

import { Prisma, PromoType } from "@prisma/client";
import { z } from "zod";

const MAX_PAISE = 2_147_483_647;
const inputSchema = z.object({
  courseId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  promoCode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .transform((code) => code.toUpperCase())
    .optional(),
});

export type PricingErrorCode =
  | "INVALID_INPUT"
  | "COURSE_UNAVAILABLE"
  | "INVALID_PROMO"
  | "PROMO_NOT_STARTED"
  | "PROMO_EXPIRED"
  | "PROMO_NOT_APPLICABLE"
  | "MINIMUM_NOT_MET"
  | "USAGE_LIMIT_REACHED"
  | "INVALID_CONFIGURATION";

export class PricingError extends Error {
  constructor(
    public readonly code: PricingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

export interface PriceQuote {
  courseId: string;
  currency: "INR";
  subtotalPaise: number;
  discountPaise: number;
  finalPricePaise: number;
  promoCodeId: string | null;
  promoCode: string | null;
}

function requireInteger(
  value: number,
  minimum = 0,
  maximum = MAX_PAISE,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new PricingError(
      "INVALID_CONFIGURATION",
      "Pricing configuration is invalid.",
    );
  }
}

/**
 * userId must come from the authenticated server session.
 *
 * Checkout must call this inside a SERIALIZABLE transaction, then create the
 * order and RESERVED redemption in that same transaction. Retry Prisma P2034.
 * A quote alone does not reserve usage. Do not call Razorpay inside the transaction.
 *
 * Capture processing must atomically apply a live reservation. Late captures
 * must recheck capacity or be refunded; never blindly apply expired reservations.
 */
export async function calculatePricing(
  tx: Prisma.TransactionClient,
  input: {
    courseId: string;
    userId: string;
    promoCode?: string;
  },
): Promise<PriceQuote> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PricingError("INVALID_INPUT", "Invalid pricing request.");
  }

  const { courseId, userId, promoCode } = parsed.data;
  const course = await tx.course.findUnique({
    where: { id: courseId },
    select: { status: true, currency: true, pricePaise: true },
  });

  if (!course || course.status !== "PUBLISHED") {
    throw new PricingError("COURSE_UNAVAILABLE", "Course is unavailable.");
  }
  if (course.currency !== "INR") {
    throw new PricingError(
      "INVALID_CONFIGURATION",
      "Only INR pricing is supported.",
    );
  }
  requireInteger(course.pricePaise);

  const quote: PriceQuote = {
    courseId,
    currency: "INR",
    subtotalPaise: course.pricePaise,
    discountPaise: 0,
    finalPricePaise: course.pricePaise,
    promoCodeId: null,
    promoCode: null,
  };

  if (!promoCode) return quote;

  const promo = await tx.promoCode.findUnique({
    where: { code: promoCode },
  });
  if (!promo?.active) {
    throw new PricingError("INVALID_PROMO", "Promo code is invalid.");
  }

  const now = new Date();
  if (promo.startsAt && promo.startsAt > now) {
    throw new PricingError("PROMO_NOT_STARTED", "Promo code is not active yet.");
  }
  if (promo.expiresAt && promo.expiresAt <= now) {
    throw new PricingError("PROMO_EXPIRED", "Promo code has expired.");
  }
  if (promo.courseId !== null && promo.courseId !== courseId) {
    throw new PricingError(
      "PROMO_NOT_APPLICABLE",
      "Promo code does not apply to this course.",
    );
  }

  requireInteger(promo.minSubtotalPaise);
  requireInteger(
    promo.value,
    1,
    promo.type === PromoType.PERCENTAGE ? 10_000 : MAX_PAISE,
  );
  if (promo.maxDiscountPaise !== null) {
    requireInteger(promo.maxDiscountPaise);
  }
  if (promo.usageLimit !== null) requireInteger(promo.usageLimit);
  if (promo.perUserLimit !== null) requireInteger(promo.perUserLimit);

  if (course.pricePaise < promo.minSubtotalPaise) {
    throw new PricingError(
      "MINIMUM_NOT_MET",
      "Course price does not meet the promo minimum.",
    );
  }

  const activeUsage: Prisma.PromoRedemptionWhereInput = {
    promoCodeId: promo.id,
    OR: [
      { status: "APPLIED" },
      {
        status: "RESERVED",
        reservationExpiresAt: { gt: now },
      },
    ],
  };

  if (promo.usageLimit !== null) {
    const used = await tx.promoRedemption.count({ where: activeUsage });
    if (used >= promo.usageLimit) {
      throw new PricingError(
        "USAGE_LIMIT_REACHED",
        "Promo code usage limit has been reached.",
      );
    }
  }

  if (promo.perUserLimit !== null) {
    const used = await tx.promoRedemption.count({
      where: { ...activeUsage, userId },
    });
    if (used >= promo.perUserLimit) {
      throw new PricingError(
        "USAGE_LIMIT_REACHED",
        "Your promo code usage limit has been reached.",
      );
    }
  }

  // Integer arithmetic; fractional paise are rounded down.
  const rawDiscount =
    promo.type === PromoType.PERCENTAGE
      ? Number(
          (BigInt(course.pricePaise) * BigInt(promo.value)) / BigInt(10_000),
        )
      : promo.value;

  const discountPaise = Math.min(
    course.pricePaise,
    rawDiscount,
    promo.maxDiscountPaise ?? MAX_PAISE,
  );

  return {
    ...quote,
    discountPaise,
    finalPricePaise: course.pricePaise - discountPaise,
    promoCodeId: promo.id,
    promoCode: promo.code,
  };
}
