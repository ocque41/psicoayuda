"use client";

import { useState } from "react";
import {
  CURRENCY_SYMBOLS,
  formatMembershipPrice,
  MEMBERSHIP_CURRENCIES,
  MEMBERSHIP_POLICY_VERSION,
  MEMBERSHIP_PRICES,
  type MembershipCurrency,
  type MembershipInterval,
  yearlySavingsPercent,
} from "@/lib/practice/membership-plan";
import styles from "./plan-picker.module.css";

function monthlyEquivalent(currency: MembershipCurrency) {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
  }).format(Math.floor(MEMBERSHIP_PRICES.year[currency] / 12) / 100);
}

/** Elección de plan y moneda con el precio exacto que se cobrará. */
export function PlanPicker({
  defaultCurrency,
  canPay,
}: {
  defaultCurrency: MembershipCurrency;
  canPay: boolean;
}) {
  const [interval, setPlanInterval] = useState<MembershipInterval>("year");
  const [currency, setCurrency] = useState<MembershipCurrency>(defaultCurrency);
  const price = formatMembershipPrice(interval, currency);
  return (
    <div className={styles.picker}>
      <input
        type="hidden"
        name="pricePolicy"
        value={MEMBERSHIP_POLICY_VERSION}
      />
      <fieldset className={styles.currencies}>
        <legend>Moneda</legend>
        {MEMBERSHIP_CURRENCIES.map((code) => (
          <label key={code} className={styles.currency}>
            <input
              type="radio"
              name="currency"
              value={code}
              checked={currency === code}
              onChange={() => setCurrency(code)}
            />
            <span>
              {CURRENCY_SYMBOLS[code]} {code.toUpperCase()}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.plans}>
        <legend className="visually-hidden">Frecuencia de pago</legend>
        {(["month", "year"] as const).map((option) => (
          <label key={option} className={styles.plan}>
            <input
              type="radio"
              name="plan"
              value={option}
              checked={interval === option}
              onChange={() => setPlanInterval(option)}
            />
            <span className={styles.planName}>
              {option === "month" ? "Mensual" : "Anual"}
              {option === "year" ? (
                <em className={styles.badge}>
                  Ahorras {yearlySavingsPercent(currency)}%
                </em>
              ) : null}
            </span>
            <strong className={styles.price}>
              {formatMembershipPrice(option, currency)}
              <small>{option === "month" ? " / mes" : " / año"}</small>
            </strong>
            <span className={styles.note}>
              {option === "month"
                ? "Flexible. Cancela cuando quieras."
                : `Equivale a ${monthlyEquivalent(currency)} al mes.`}
            </span>
          </label>
        ))}
      </fieldset>
      {canPay ? (
        <label className="practice-check">
          <input type="checkbox" name="accept" required />
          Acepto {price} {interval === "month" ? "cada mes" : "cada año"}, con
          renovación automática hasta que cancele desde el portal de
          facturación.
        </label>
      ) : null}
    </div>
  );
}
