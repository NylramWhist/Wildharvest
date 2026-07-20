export const GM_CONTROL_PANEL_DEFAULT_SIZE = Object.freeze({
  width: 1480,
  height: 940
});

const GM_CONTROL_PANEL_VIEWPORT_MARGIN = Object.freeze({
  horizontal: 48,
  vertical: 80
});

function normalizeViewportDimension(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
}

function normalizeMargin(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? numericValue
    : fallback;
}

export function getViewportSafeGmPanelSize({
  viewportWidth,
  viewportHeight,
  horizontalMargin = GM_CONTROL_PANEL_VIEWPORT_MARGIN.horizontal,
  verticalMargin = GM_CONTROL_PANEL_VIEWPORT_MARGIN.vertical
} = {}) {
  const safeViewportWidth = normalizeViewportDimension(
    viewportWidth,
    GM_CONTROL_PANEL_DEFAULT_SIZE.width + GM_CONTROL_PANEL_VIEWPORT_MARGIN.horizontal
  );
  const safeViewportHeight = normalizeViewportDimension(
    viewportHeight,
    GM_CONTROL_PANEL_DEFAULT_SIZE.height + GM_CONTROL_PANEL_VIEWPORT_MARGIN.vertical
  );
  const safeHorizontalMargin = normalizeMargin(
    horizontalMargin,
    GM_CONTROL_PANEL_VIEWPORT_MARGIN.horizontal
  );
  const safeVerticalMargin = normalizeMargin(
    verticalMargin,
    GM_CONTROL_PANEL_VIEWPORT_MARGIN.vertical
  );

  return {
    width: Math.min(
      GM_CONTROL_PANEL_DEFAULT_SIZE.width,
      Math.max(1, Math.floor(safeViewportWidth - safeHorizontalMargin))
    ),
    height: Math.min(
      GM_CONTROL_PANEL_DEFAULT_SIZE.height,
      Math.max(1, Math.floor(safeViewportHeight - safeVerticalMargin))
    )
  };
}
