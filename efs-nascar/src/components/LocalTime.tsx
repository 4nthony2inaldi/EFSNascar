'use client';

interface LocalTimeProps {
  dateStr: string;
  format?: 'date' | 'time' | 'datetime' | 'dateTime' | 'long' | 'dateOnly' | 'longDate' | 'full';
}

// Always use Eastern Time
const EST_TIMEZONE = 'America/New_York';

export function LocalTime({ dateStr, format = 'datetime' }: LocalTimeProps) {
  const date = new Date(dateStr);

  if (format === 'date') {
    return (
      <span suppressHydrationWarning>
        {date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          timeZone: EST_TIMEZONE,
        })}
      </span>
    );
  }

  if (format === 'time') {
    return (
      <span suppressHydrationWarning>
        {date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: EST_TIMEZONE,
        })} EST
      </span>
    );
  }

  if (format === 'long') {
    return (
      <span suppressHydrationWarning>
        {date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: EST_TIMEZONE,
        })} EST
      </span>
    );
  }

  if (format === 'dateOnly') {
    return (
      <span suppressHydrationWarning>
        {date.toLocaleDateString('en-US', {
          timeZone: EST_TIMEZONE,
        })}
      </span>
    );
  }

  if (format === 'longDate') {
    return (
      <span suppressHydrationWarning>
        {date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: EST_TIMEZONE,
        })}
      </span>
    );
  }

  if (format === 'full') {
    return (
      <span suppressHydrationWarning>
        {date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: EST_TIMEZONE,
        })} EST
      </span>
    );
  }

  // datetime or dateTime
  return (
    <span suppressHydrationWarning>
      {date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: EST_TIMEZONE,
      })}{' '}
      {date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: EST_TIMEZONE,
      })} EST
    </span>
  );
}
