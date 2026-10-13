/** Drawn 20×20 line icons from the V4 design; one stroke weight, coloured by currentColor. */
const paths = {
    search: (
        <>
            <circle cx="8.8" cy="8.8" r="5.3" fill="none" strokeWidth="1.6" />
            <path d="m12.8 12.8 3.7 3.7" strokeWidth="1.6" />
        </>
    ),
    chevron: (
        <path
            d="m6 8 4 4 4-4"
            fill="none"
            strokeWidth="1.6"
            strokeLinejoin="round"
        />
    ),
    check: (
        <path
            d="m5 10.4 3.2 3.1L15 6.7"
            fill="none"
            strokeWidth="1.8"
            strokeLinejoin="round"
        />
    ),
    plus: <path d="M10 4.5v11M4.5 10h11" strokeWidth="1.6" />,
    alert: (
        <>
            <path
                d="M10 3.2 17.4 16H2.6Z"
                fill="none"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <path d="M10 8.2v3.6" strokeWidth="1.6" />
            <circle
                cx="10"
                cy="13.9"
                r=".95"
                fill="currentColor"
                stroke="none"
            />
        </>
    ),
};
export function Icon({
    name,
    className = '',
}: {
    name: keyof typeof paths;
    className?: string;
}) {
    return (
        <svg
            className={`icon ${className}`.trim()}
            viewBox="0 0 20 20"
            stroke="currentColor"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
        >
            {paths[name]}
        </svg>
    );
}
