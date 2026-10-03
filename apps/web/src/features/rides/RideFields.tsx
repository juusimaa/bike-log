import { Field } from '../../components/Field';
import type { RideResponse, Validated } from '@bikelog/api-client';
import { formatDuration } from '../../lib/format';
import { LOCAL_TIME_ZONE } from '../../lib/dates';
export type RideValues = {
    name: string;
    start: string;
    distance: string;
    duration: string;
    offset: string;
};
export function RideFields({
    prefix,
    errors = {},
    values,
    ride,
    offsets,
    onChange,
    onDurationEdited,
}: {
    errors?: Record<string, string>;
    prefix: string;
    values: RideValues;
    ride?: Validated<RideResponse>;
    offsets: string[];
    onChange: (values: RideValues) => void;
    onDurationEdited: () => void;
}) {
    return (
        <>
            {(['name', 'start', 'distance', 'duration'] as const).map((key) => (
                <Field
                    key={key}
                    error={errors[key]}
                    id={`${prefix}-${key}`}
                    label={
                        {
                            name: 'Ride name',
                            start: 'Start time',
                            distance: 'Distance (km)',
                            duration: 'Duration (minutes)',
                        }[key]
                    }
                    hint={
                        key === 'start'
                            ? `Local time in ${LOCAL_TIME_ZONE} · UTC offset ${values.offset || (offsets.length === 1 ? offsets[0] : 'choose a valid offset')}.`
                            : key === 'duration' && ride
                              ? `Saved duration: ${formatDuration(ride.durationSeconds)}. Leave untouched to retain exact seconds; changing to blank records unknown duration.`
                              : key === 'name'
                                ? 'Optional. Unnamed rides use their local date.'
                                : undefined
                    }
                >
                    <input
                        id={`${prefix}-${key}`}
                        maxLength={key === 'name' ? 100 : undefined}
                        type={key === 'start' ? 'datetime-local' : 'text'}
                        value={values[key]}
                        inputMode={
                            key === 'distance' || key === 'duration'
                                ? 'decimal'
                                : undefined
                        }
                        onChange={(event) => {
                            if (key === 'duration') onDurationEdited();
                            onChange({
                                ...values,
                                [key]: event.target.value,
                                ...(key === 'start' ? { offset: '' } : {}),
                            });
                        }}
                    />
                </Field>
            ))}
            {offsets.length > 1 && (
                <Field
                    id={`${prefix}-offset`}
                    label="UTC offset"
                    hint="This time occurs twice. Choose an offset when changing the instant."
                >
                    <select
                        id={`${prefix}-offset`}
                        value={values.offset}
                        onChange={(event) =>
                            onChange({
                                ...values,
                                offset: event.target.value,
                            })
                        }
                    >
                        <option value="">Choose offset</option>
                        {offsets.map((offset) => (
                            <option key={offset} value={offset}>
                                {offset}
                            </option>
                        ))}
                    </select>
                </Field>
            )}
            <button
                type="button"
                onClick={() => {
                    onDurationEdited();
                    onChange({ ...values, duration: '' });
                }}
            >
                Clear duration
            </button>
        </>
    );
}
