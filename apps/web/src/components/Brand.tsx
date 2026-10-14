import { brandMark } from './brandGeometry';

const { size, tileRadius, tile, figure, hub, stem, rim, hubRadius } = brandMark;

/** The Bike Log lockup: the wheel-bowl b tile and the "bike log." wordmark. */
export function Brand() {
    return (
        <>
            <svg className="brand-mark" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
                <rect width={size} height={size} rx={tileRadius} fill={tile} />
                <rect x={stem.x} y={stem.y} width={stem.width} height={stem.height} rx={stem.radius} fill={figure} />
                <circle cx={rim.cx} cy={rim.cy} r={rim.r} fill="none" stroke={figure} strokeWidth={rim.strokeWidth} />
                <circle cx={rim.cx} cy={rim.cy} r={hubRadius} fill={hub} />
            </svg>
            <span className="brand-word" aria-hidden="true">
                bike log<span className="brand-dot" />
            </span>
        </>
    );
}
