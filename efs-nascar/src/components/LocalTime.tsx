'use client';

interface LocalTimeProps {
  dateStr: string;
  format?: 'date' | 'time' | 'datetime' | 'dateTime' | 'long' | 'dateOnly' | 'longDate' | 'full';
}

export function LocalTime({ dateStr, format = 'datetime' }: LocalTimeProps) {
  const date = new Date(dateStr);

  if (format === 'date') {
    return (
      <span suppressHydrationWarning>
        {date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
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
        })}
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
        })}
      </span>
    );
  }

  if (format === 'dateOnly') {
    return (
      <span suppressHydrationWarning>
        {date.toLocaleDateString()}
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
        })}
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
      })}{' '}
      {date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })}
    </span>
  );
}
