import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practiceSettings } from "@/db/schema";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { pageNumber } from "@/lib/practice/queries";
import {
  receiptCsv,
  receiptCurrency,
  receiptPeriod,
} from "@/lib/practice/receipt-export";
import { readPracticeReceiptPage } from "@/lib/practice/receipt-queries";

export async function GET(request: Request) {
  const pro = await requirePracticeProfessional();
  const params = new URL(request.url).searchParams;
  const settings = await db.query.practiceSettings.findFirst({
    where: eq(practiceSettings.professionalId, pro.id),
  });
  const period = receiptPeriod(
      params.get("mes"),
      settings?.timeZone || "America/Caracas",
    ),
    currency = receiptCurrency(params.get("moneda"));
  const receipts = await readPracticeReceiptPage(
    pro.id,
    undefined,
    pageNumber(params.get("pagina") ?? undefined),
    25,
    { ...period, currency },
  );
  return new Response(receiptCsv(receipts.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nido-cobros-${period.month}-${currency || "monedas"}-pagina-${receipts.page}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
