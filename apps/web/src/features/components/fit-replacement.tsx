'use client';
import { useId } from 'react';
import { Field } from '../../components/Field';
import { validOffsets, LOCAL_TIME_ZONE } from '../../lib/dates';
/** Local date and time with an explicit offset choice when the wall time is ambiguous. */
export function WhenField({
    label = 'Date and time',
    wall,
    setWall,
    offset,
    setOffset,
    error,
}: {
    label?: string;
    wall: string;
    setWall: (v: string) => void;
    offset: string;
    setOffset: (v: string) => void;
    error?: string;
}) {
    const id = useId();
    let offsets: string[] = [];
    let dateError: string | undefined;
    try {
        offsets = validOffsets(wall);
    } catch (error) {
        dateError =
            error instanceof Error
                ? error.message
                : 'Enter a valid date and time.';
    }
    if (!dateError && offsets.length === 0)
        dateError =
            'This local time does not exist because the clocks move forward.';
    return (
        <>
            <Field
                id={id + 'date'}
                label={label}
                error={dateError || error}
                hint={`Local time in ${LOCAL_TIME_ZONE} · UTC offset ${offset || (offsets.length === 1 ? offsets[0] : 'choose a valid offset')}.`}
            >
                <input
                    id={id + 'date'}
                    type="datetime-local"
                    value={wall}
                    onChange={(e) => {
                        setWall(e.target.value);
                        setOffset('');
                    }}
                />
            </Field>
            {offsets.length > 1 && (
                <Field id={id + 'offset'} label="UTC offset">
                    <select
                        id={id + 'offset'}
                        value={offset}
                        onChange={(e) => setOffset(e.target.value)}
                    >
                        <option value="">Choose offset</option>
                        {offsets.map((o) => (
                            <option key={o}>{o}</option>
                        ))}
                    </select>
                </Field>
            )}
        </>
    );
}
/** Optional whole grams, validated again by the API. */
export function WeightField({
    label = 'Weight (g)',
    value,
    setValue,
    error,
    readOnly = false,
}: {
    label?: string;
    value: string;
    setValue: (v: string) => void;
    error?: string;
    readOnly?: boolean;
}) {
    const id = useId();
    return (
        <Field
            id={id}
            label={label}
            error={error}
            hint="Optional. Whole grams, 1–20,000. Leave empty if unknown; add it later."
        >
            <input
                id={id}
                value={value}
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 245"
                readOnly={readOnly}
                onChange={(e) => setValue(e.target.value)}
            />
        </Field>
    );
}
export function PartFields({
    make,
    setMake,
    model,
    setModel,
    weight,
    setWeight,
    wall,
    setWall,
    offset,
    setOffset,
    cost,
    setCost,
    modelReadOnly = false,
    errors = {},
}: {
    modelReadOnly?: boolean;
    errors?: Record<string, string>;
    make: string;
    setMake: (v: string) => void;
    model: string;
    setModel: (v: string) => void;
    weight?: string;
    setWeight?: (v: string) => void;
    wall: string;
    setWall: (v: string) => void;
    offset: string;
    setOffset: (v: string) => void;
    cost?: string;
    setCost?: (v: string) => void;
}) {
    const id = useId();
    return (
        <>
            <Field id={id + 'make'} label="Make" error={errors.make}>
                <input
                    id={id + 'make'}
                    value={make}
                    readOnly={modelReadOnly}
                    maxLength={100}
                    onChange={(e) => setMake(e.target.value)}
                />
            </Field>
            <Field id={id + 'model'} label="Model" error={errors.model}>
                <input
                    id={id + 'model'}
                    value={model}
                    maxLength={100}
                    readOnly={modelReadOnly}
                    onChange={(e) => setModel(e.target.value)}
                />
            </Field>
            {setWeight && (
                <WeightField
                    value={weight ?? ''}
                    setValue={setWeight}
                    error={errors.weight}
                    readOnly={modelReadOnly}
                />
            )}
            <WhenField
                wall={wall}
                setWall={setWall}
                offset={offset}
                setOffset={setOffset}
                error={errors.date}
            />
            {setCost && (
                <Field id={id + 'cost'} label="Cost (EUR)" error={errors.cost}>
                    <input
                        id={id + 'cost'}
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                    />
                </Field>
            )}
        </>
    );
}
export async function allPages<T>(
    read: (
        cursor?: string,
    ) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | undefined;
    do {
        const page = await read(cursor);
        rows.push(...page.items);
        cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return rows;
}
