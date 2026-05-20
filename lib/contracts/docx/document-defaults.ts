export const LETTER_PAGE_WIDTH_DXA = 12240;
export const LETTER_PAGE_HEIGHT_DXA = 15840;

export const DEFAULT_PAGE_MARGIN_DXA = 1440;

export function buildLetterSectionProperties() {
  return {
    page: {
      size: {
        width: LETTER_PAGE_WIDTH_DXA,
        height: LETTER_PAGE_HEIGHT_DXA,
      },
      margin: {
        top: DEFAULT_PAGE_MARGIN_DXA,
        right: DEFAULT_PAGE_MARGIN_DXA,
        bottom: DEFAULT_PAGE_MARGIN_DXA,
        left: DEFAULT_PAGE_MARGIN_DXA,
      },
    },
  };
}
