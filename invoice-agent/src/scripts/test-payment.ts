/**
 * Isolated Stripe payment test.
 *
 *   npm run test:payment
 *   npm run test:payment -- --amount=99.5 --currency=USD --id=INV-TEST-1
 */
import { processMockPayment } from "../services/payment.service.js";

function argValue(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main() {
  const invoiceId = argValue("--id") ?? `INV-PAY-${Date.now().toString().slice(-6)}`;
  const amount = Number(argValue("--amount") ?? "42.00");
  const currency = argValue("--currency") ?? "USD";
  const vendor = argValue("--vendor") ?? "Demo Vendor";

  const result = await processMockPayment({
    invoiceId,
    vendor,
    amount,
    currency,
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(
    result.success
      ? "Stripe payment succeeded ."
      : "Stripe payment failed."
  );
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
