import type { ProductCode } from "@/types/api";

export const FULL_REPORT_PRODUCT_CODE: ProductCode = "single_report";

export const LEGACY_FULL_REPORT_PRODUCT_CODES: ProductCode[] = ["single_optimize"];

export const FULL_REPORT_PRODUCT_CODES: ProductCode[] = [
  FULL_REPORT_PRODUCT_CODE,
  ...LEGACY_FULL_REPORT_PRODUCT_CODES,
];

export function isFullReportProductCode(code: unknown): code is ProductCode {
  return typeof code === "string" && FULL_REPORT_PRODUCT_CODES.includes(code as ProductCode);
}
