// Draws every app icon from the brand geometry in src/components/brandGeometry.ts.
// Run after changing the mark: npm run icons --workspace @bikelog/web
// Outputs are committed; the build does not run this.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { brandMark, brandFigureSvg } from '../src/components/brandGeometry.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = `${root}src/app/`;
const pub = `${root}public/`;
const { size, tileRadius, tile } = brandMark;

/** The tile and figure; `scale` shrinks the figure about the centre, `rounded` keeps the tile corners. */
function svg({ scale = 1, rounded = true, darkTile = false } = {}) {
    const c = size / 2;
    const style = darkTile
        ? '<style>@media (prefers-color-scheme: dark){.tile{fill:#41704f}}</style>'
        : '';
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${style}` +
        `<rect class="tile" width="${size}" height="${size}"${rounded ? ` rx="${tileRadius}"` : ''} fill="${tile}"/>` +
        `<g transform="translate(${c} ${c}) scale(${scale}) translate(${-c} ${-c})">${brandFigureSvg()}</g>` +
        '</svg>\n'
    );
}

function png(source, px) {
    return sharp(Buffer.from(source), { density: (72 * px) / size })
        .resize(px, px)
        .png({ compressionLevel: 9 })
        .toBuffer();
}

/** An ICO that stores each size as PNG, which every current browser and Windows reads. */
function ico(images) {
    const header = Buffer.alloc(6 + 16 * images.length);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach(({ px, data }, i) => {
        const e = 6 + 16 * i;
        header.writeUInt8(px % 256, e);
        header.writeUInt8(px % 256, e + 1);
        header.writeUInt16LE(1, e + 4);
        header.writeUInt16LE(32, e + 6);
        header.writeUInt32LE(data.length, e + 8);
        header.writeUInt32LE(offset, e + 12);
        offset += data.length;
    });
    return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const favicon = svg();
const favicons = await Promise.all([16, 32, 48].map(async (px) => ({ px, data: await png(favicon, px) })));

await mkdir(pub, { recursive: true });
await Promise.all([
    // Browser tabs; the dark tab strip gets a slightly lighter tile so its edge stays visible.
    writeFile(`${app}icon.svg`, svg({ darkTile: true })),
    writeFile(`${app}favicon.ico`, ico(favicons)),
    // iOS masks its own corners, so the touch icon is full bleed.
    png(svg({ rounded: false, scale: 0.9 }), 180).then((b) => writeFile(`${app}apple-icon.png`, b)),
    png(favicon, 192).then((b) => writeFile(`${pub}icon-192.png`, b)),
    png(favicon, 512).then((b) => writeFile(`${pub}icon-512.png`, b)),
    // Android masks to any shape; the figure stays inside the central safe circle.
    png(svg({ rounded: false, scale: 0.8 }), 512).then((b) => writeFile(`${pub}icon-maskable-512.png`, b)),
]);
console.log('Wrote icon.svg, favicon.ico, apple-icon.png and public/icon-*.png');
