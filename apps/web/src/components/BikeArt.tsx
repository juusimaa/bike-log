import type { BikeResponse } from '@bikelog/api-client';
type Kind = NonNullable<BikeResponse['kind']>;
type Point = [number, number];
/**
 * Default bike pictures, one per kind, computed from real size M frame geometry (millimetres
 * and degrees) of a reference bike, so the type shows through its proportions. All kinds share
 * one scale. See docs/ui-design/drafts/bike-art-geometry.html for the sources.
 */
type Geometry = {
    /** Rim bead seat diameter and tyre width. */
    bsd: number;
    tyre: number;
    chainstay: number;
    bbDrop: number;
    wheelbase: number;
    stack: number;
    reach: number;
    headAngle: number;
    headTube: number;
    seatAngle: number;
    seatTube: number;
    bar: 'drop' | 'flare' | 'riser' | 'swept' | 'flat';
    /** Stem length and angle from horizontal. */
    stem: [number, number];
    spacers: number;
    tube: number;
    knobs?: [number, number];
    suspension?: boolean;
    city?: boolean;
    color: string;
};
const GEOMETRY: Record<Kind, Geometry> = {
    // Canyon Endurace CF (2026)
    road: {
        bsd: 622,
        tyre: 32,
        chainstay: 420,
        bbDrop: 74,
        wheelbase: 1014,
        stack: 584,
        reach: 392,
        headAngle: 72.5,
        headTube: 158,
        seatAngle: 73.5,
        seatTube: 500,
        bar: 'drop',
        stem: [110, -6],
        spacers: 25,
        tube: 10,
        color: '#a3564c',
    },
    // Canyon Grizl (2025)
    gravel: {
        bsd: 622,
        tyre: 45,
        chainstay: 435,
        bbDrop: 75,
        wheelbase: 1045,
        stack: 579,
        reach: 402,
        headAngle: 71.5,
        headTube: 141,
        seatAngle: 73.5,
        seatTube: 522,
        bar: 'flare',
        stem: [90, -6],
        spacers: 30,
        tube: 11,
        knobs: [4, 9],
        color: '#6f8f6c',
    },
    // Canyon Spectral 29 (2023)
    mountain: {
        bsd: 622,
        tyre: 61,
        chainstay: 438,
        bbDrop: 32,
        wheelbase: 1222,
        stack: 621,
        reach: 456,
        headAngle: 64,
        headTube: 105,
        seatAngle: 76.5,
        seatTube: 430,
        bar: 'riser',
        stem: [40, 0],
        spacers: 15,
        tube: 14,
        knobs: [7, 9],
        suspension: true,
        color: '#b27a2f',
    },
    // Canyon Citylite (2025): 650b × 47 tyres on Canyon Commuter 5 (2024) frame numbers,
    // since the Citylite's own geometry is not published.
    hybrid: {
        bsd: 584,
        tyre: 47,
        chainstay: 450,
        bbDrop: 60,
        wheelbase: 1054,
        stack: 557,
        reach: 423,
        headAngle: 71.5,
        headTube: 150,
        seatAngle: 73.5,
        seatTube: 470,
        bar: 'swept',
        stem: [70, 20],
        spacers: 40,
        tube: 11,
        city: true,
        color: '#4c7e86',
    },
    // Canyon Roadlite CF (2025)
    other: {
        bsd: 622,
        tyre: 30,
        chainstay: 415,
        bbDrop: 73,
        wheelbase: 1029,
        stack: 573,
        reach: 417,
        headAngle: 72.5,
        headTube: 155,
        seatAngle: 73.5,
        seatTube: 510,
        bar: 'flat',
        stem: [90, -6],
        spacers: 25,
        tube: 10,
        color: '#789b8c',
    },
};
const TYRE = '#2f3a36',
    RIM = '#a9b7b2',
    METAL = '#7d8a84',
    SOFT = '#f1ead8';
/** SVG units per millimetre, shared by every kind so sizes compare honestly. */
const SCALE = 0.255;
type Stroke = 'frame' | 'tyre' | 'rim' | 'part' | 'metal' | 'solid' | 'soft';
type Shape = {
    d: string;
    stroke: Stroke;
    width?: number;
    dash?: string;
};
const rad = (deg: number) => (deg * Math.PI) / 180;
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const along = (p: Point, deg: number, len: number): Point => [
    p[0] + Math.cos(rad(deg)) * len,
    p[1] + Math.sin(rad(deg)) * len,
];
const lerp = (a: Point, b: Point, t: number): Point => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
];
/** Computes the drawing once per kind; only the frame colour varies per bike. */
function shapes(g: Geometry): Shape[] {
    // Millimetres with the bottom bracket at the origin, x forward, y up.
    const R = g.bsd / 2 + g.tyre;
    const rear: Point = [
        -Math.sqrt(g.chainstay ** 2 - g.bbDrop ** 2),
        g.bbDrop,
    ];
    const front: Point = [rear[0] + g.wheelbase, g.bbDrop];
    const ground = g.bbDrop - R,
        mid = (rear[0] + front[0]) / 2;
    const P = ([x, y]: Point) =>
        `${(300 + (x - mid) * SCALE).toFixed(1)} ${(292 - (y - ground) * SCALE).toFixed(1)}`;
    const line = (...pts: Point[]) => 'M' + pts.map(P).join('L');
    const curve = (a: Point, c1: Point, c2: Point, b: Point) =>
        `M${P(a)}C${P(c1)} ${P(c2)} ${P(b)}`;
    const circle = (c: Point, r: number) => {
        const s = (r * SCALE).toFixed(1);
        const top = P([c[0], c[1] + r]),
            bottom = P([c[0], c[1] - r]);
        return `M${top}A${s} ${s} 0 1 1 ${bottom}A${s} ${s} 0 1 1 ${top}Z`;
    };
    const origin: Point = [0, 0];
    const htTop: Point = [g.reach, g.stack];
    const back = 180 - g.headAngle;
    const htBottom = along(htTop, -g.headAngle, g.headTube);
    const downTubeEnd = along(htBottom, back, 25);
    const stDir = 180 - g.seatAngle;
    const stTop = along(origin, stDir, g.seatTube);
    const ttRear = along(origin, stDir, g.seatTube - 25);
    const saddle = along(origin, stDir, g.suspension ? 700 : 735);
    const steerTop = along(htTop, back, g.spacers);
    const E = along(steerTop, g.stem[1], g.stem[0]);
    const o = (dx: number, dy: number) => add(E, [dx, dy]);
    const out: Shape[] = [];

    // Wheels: the real tyre width, rims at the bead seat.
    for (const c of [rear, front]) {
        out.push({
            d: circle(c, R - g.tyre / 2),
            stroke: 'tyre',
            width: g.tyre * SCALE * 1.15,
        });
        out.push({ d: circle(c, g.bsd / 2 - 18), stroke: 'rim', width: 2 });
        if (g.knobs)
            out.push({
                d: circle(c, R + 2),
                stroke: 'tyre',
                width: g.knobs[0] * 1.3,
                dash: `${g.knobs[0]} ${g.knobs[1]}`,
            });
    }
    if (g.city) {
        // Mudguards follow the tyre; the rack sits flat over the rear wheel.
        for (const [c, a0, a1] of [
            [rear, 200, 30],
            [front, 150, -20],
        ] as const) {
            const r = R + 22,
                s = (r * SCALE).toFixed(1);
            out.push({
                d: `M${P(along(c, a0, r))}A${s} ${s} 0 0 1 ${P(along(c, a1, r))}`,
                stroke: 'metal',
            });
        }
        const deck = rear[1] + R + 60;
        out.push({
            d:
                line([rear[0] - 150, deck], [rear[0] + 120, deck]) +
                line([rear[0] - 90, deck], rear) +
                line(
                    [rear[0] + 110, deck],
                    along(origin, stDir, g.seatTube - 60),
                ),
            stroke: 'metal',
        });
    }

    // Frame
    const frame = [
        line(origin, stTop),
        line(along(htTop, -g.headAngle, g.suspension ? 20 : 15), ttRear),
        line(origin, downTubeEnd),
        line(htTop, htBottom),
    ];
    if (g.suspension) {
        const pivot = along(origin, stDir, 120),
            rocker = along(origin, stDir, g.seatTube - 70);
        frame.push(line(rear, pivot), line(rear, rocker));
        out.push({
            d: line(lerp(origin, downTubeEnd, 0.32), lerp(rocker, ttRear, 0.4)),
            stroke: 'part',
            width: 12,
        });
        out.push({
            d: line(
                lerp(origin, downTubeEnd, 0.35),
                lerp(rocker, ttRear, 0.35),
            ),
            stroke: 'metal',
            width: 6,
            dash: '3 6',
        });
    } else frame.push(line(rear, origin), line(rear, ttRear));
    out.push({ d: frame.join(''), stroke: 'frame', width: g.tube });

    // Fork: a suspension fork has thin stanchions and thick lowers; a rigid one rakes forward.
    if (g.suspension) {
        out.push({
            d: line(htBottom, lerp(htBottom, front, 0.45)),
            stroke: 'metal',
            width: 9,
        });
        out.push({
            d: line(lerp(htBottom, front, 0.4), front),
            stroke: 'part',
            width: 15,
        });
    } else {
        const bend = add(lerp(htBottom, front, 0.55), [-12, 0]);
        out.push({
            d: `M${P(htBottom)}Q${P(bend)} ${P(front)}`,
            stroke: 'frame',
            width: g.tube - 2,
        });
    }

    // Seat post, saddle, steerer and stem
    out.push({
        d: line(stTop, saddle) + line(htTop, steerTop, E),
        stroke: 'metal',
    });
    out.push({
        d: `M${P(add(saddle, [-150, 8]))}Q${P(add(saddle, [-60, 22]))} ${P(add(saddle, [100, 6]))}L${P(add(saddle, [100, -4]))}Q${P(add(saddle, [-40, -6]))} ${P(add(saddle, [-150, -6]))}Z`,
        stroke: 'solid',
    });

    // Handlebar in side view, then grips for the flat-bar kinds.
    out.push({
        d: {
            drop:
                curve(E, o(55, 0), o(90, -25), o(80, -70)) +
                curve(o(80, -70), o(70, -115), o(30, -130), o(-10, -118)),
            flare:
                curve(E, o(50, 0), o(85, -20), o(80, -60)) +
                curve(o(80, -60), o(78, -105), o(45, -128), o(0, -125)),
            riser: line(E, o(-15, 35), o(-35, 40)),
            swept: curve(E, o(-10, 45), o(-60, 70), o(-130, 65)),
            flat: line(E, o(-30, -4)),
        }[g.bar],
        stroke: 'part',
    });
    const grip = {
        drop: null,
        flare: null,
        riser: [o(-35, 40), o(-110, 40)],
        swept: [o(-110, 66), o(-175, 62)],
        flat: [o(-25, -4), o(-110, -10)],
    }[g.bar] as Point[] | null;
    if (grip) out.push({ d: line(...grip), stroke: 'part', width: 9 });

    // Drivetrain and hubs
    const pedal = along(origin, -62, 170);
    out.push({ d: circle(origin, g.suspension ? 70 : 95), stroke: 'soft' });
    out.push({
        d:
            line(origin, pedal) +
            line(add(pedal, [-45, 0]), add(pedal, [45, 0])),
        stroke: 'part',
    });
    for (const c of [rear, front])
        out.push({ d: circle(c, 14), stroke: 'solid', width: 0 });
    return out;
}
const DRAWINGS = Object.fromEntries(
    Object.entries(GEOMETRY).map(([kind, g]) => [kind, shapes(g)]),
) as Record<Kind, Shape[]>;
const paint = (stroke: Stroke, frame: string) =>
    ({
        frame: { stroke: frame, fill: 'none', width: 10 },
        tyre: { stroke: TYRE, fill: 'none', width: 5 },
        rim: { stroke: RIM, fill: 'none', width: 2 },
        part: { stroke: TYRE, fill: 'none', width: 5 },
        metal: { stroke: METAL, fill: 'none', width: 5 },
        solid: { stroke: TYRE, fill: TYRE, width: 2 },
        soft: { stroke: TYRE, fill: SOFT, width: 2.5 },
    })[stroke];
/** A side view of the bike's kind, in its own colour or the kind's default. */
export function BikeArt({
    color,
    kind,
}: {
    color?: string | null;
    kind?: BikeResponse['kind'];
}) {
    const k: Kind = kind ?? 'other';
    const frame = color || GEOMETRY[k].color;
    return (
        <svg
            viewBox="0 0 600 300"
            aria-hidden="true"
            focusable="false"
            className="bike-art"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {DRAWINGS[k].map((s, i) => {
                const p = paint(s.stroke, frame);
                return (
                    <path
                        key={i}
                        d={s.d}
                        fill={p.fill}
                        stroke={p.stroke}
                        strokeWidth={s.width ?? p.width}
                        strokeDasharray={s.dash}
                    />
                );
            })}
        </svg>
    );
}
