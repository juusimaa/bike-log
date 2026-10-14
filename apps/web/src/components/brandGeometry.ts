/**
 * The Bike Log mark on a 32×32 grid: a b whose bowl is a wheel, rim in white
 * and hub in lime. Brand renders it in the page; scripts/generate-icons.mjs
 * draws the favicon, touch icon and manifest icons from the same numbers.
 */
export const brandMark = {
    size: 32,
    tileRadius: 7,
    tile: '#345b43',
    figure: '#fff',
    hub: '#e4efb0',
    stem: { x: 8.75, y: 5, width: 4.5, height: 22, radius: 2.25 },
    rim: { cx: 16.75, cy: 19, r: 6, strokeWidth: 4 },
    hubRadius: 2.25,
} as const;

/** The figure as SVG markup, without the tile. */
export function brandFigureSvg(): string {
    const { stem, rim, figure, hub, hubRadius } = brandMark;
    return (
        `<rect x="${stem.x}" y="${stem.y}" width="${stem.width}" height="${stem.height}" rx="${stem.radius}" fill="${figure}"/>` +
        `<circle cx="${rim.cx}" cy="${rim.cy}" r="${rim.r}" fill="none" stroke="${figure}" stroke-width="${rim.strokeWidth}"/>` +
        `<circle cx="${rim.cx}" cy="${rim.cy}" r="${hubRadius}" fill="${hub}"/>`
    );
}
