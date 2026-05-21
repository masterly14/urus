/**
 * Flags de UI para pricing / estudio de mercado.
 *
 * El backend (APIs, jobs, comparabilidad) puede desplegarse completo;
 * la UI del estudio de mercado (pestaña Mercado, baremos, zone study)
 * queda detrás de `NEXT_PUBLIC_PRICING_MARKET_STUDY_UI=true`.
 *
 * El loader de análisis en curso (`AnalysisProcessingCard`) no depende de
 * este flag y siempre se muestra cuando `analysisStatus === "processing"`.
 */
export function isPricingMarketStudyUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRICING_MARKET_STUDY_UI === "true";
}
