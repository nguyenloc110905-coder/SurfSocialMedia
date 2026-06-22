import { createLogger, format, transports } from 'winston';

const { combine, timestamp, errors, printf, colorize } = format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return stack ? `${ts} [${level}]: ${message}\n${stack}` : `${ts} [${level}]: ${message}`;
});

export const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
  transports: [
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
      ),
    }),
  ],
});
