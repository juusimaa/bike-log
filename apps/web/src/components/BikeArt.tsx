export function BikeArt({ color }: { color?: string | null }) {
    return (
        <svg viewBox="0 0 600 300" aria-hidden="true">
            <ellipse
                cx="300"
                cy="273"
                rx="244"
                ry="10"
                fill="currentColor"
                opacity=".06"
            />
            <g fill="none" stroke="#343c3b">
                <g strokeWidth="9">
                    <circle cx="130" cy="185" r="80" />
                    <circle cx="470" cy="185" r="80" />
                </g>
                <g stroke="#9badaa" strokeWidth="1.5">
                    <circle cx="130" cy="185" r="70" />
                    <circle cx="470" cy="185" r="70" />
                    <path d="M130 115v140m-70-70h140m-120-50 100 100m-100 0 100-100M470 115v140m-70-70h140m-120-50 100 100m-100 0 100-100" />
                </g>
                <g
                    stroke={color || '#789b8c'}
                    strokeWidth="13"
                    strokeLinejoin="round"
                >
                    <path d="M130 185 230 74 284 204ZM230 74 415 82 284 204M411 61 470 185" />
                </g>
                <path
                    d="m224 67-10-30m-24 0h55m169 40-8-40 38 1q30 2 24 23-3 10-17 11"
                    strokeWidth="7"
                    strokeLinecap="round"
                />
                <circle cx="284" cy="204" r="20" strokeWidth="4" />
                <path d="m131 176 155 9m-155 10 153 26" strokeWidth="2" />
                <path
                    d="M256 188 284 204 312 220M247 188h18m38 32h18"
                    strokeWidth="5"
                    strokeLinecap="round"
                />
                <path d="m418 80 35-12q-43-12-38-27" strokeWidth="2" />
            </g>
        </svg>
    );
}
