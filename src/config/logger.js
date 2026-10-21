import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import config from './index.js'
import { LOG_LEVELS } from '../constants/index.js'

const LOGS_DIR = 'logs'
const RETENTION = '14d' // se conservan 14 días de historial

winston.addColors({
  fatal: 'magenta',
  error: 'red',
  warning: 'yellow',
  info: 'green',
  http: 'cyan',
  debug: 'gray'
})

// Línea: "2026-10-20 10:12:03 [info] mensaje {datos extra}"
const line = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const extra = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
  return `${timestamp} [${level}] ${message}${extra}`
})
const timestamp = winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })

const fileFormat = winston.format.combine(timestamp, line)
const consoleFormat = winston.format.combine(timestamp, winston.format.colorize(), line)

// Archivo rotado por día: logs/AAAA-MM-DD/<name>.log
const rotatingFile = (name, level) =>
  new DailyRotateFile({
    filename: `${LOGS_DIR}/%DATE%/${name}.log`,
    datePattern: 'YYYY-MM-DD',
    level, // nivel mínimo de ESTE archivo
    maxFiles: RETENTION,
    auditFile: `${LOGS_DIR}/.audit-${name}.json`, // registro interno de la rotación
    format: fileFormat
  })

// Decide QUÉ se registra y DÓNDE, sin crear nada (función pura, testeable)
export const resolveLoggerOptions = ({ nodeEnv, logLevel }) => ({
  level: logLevel,
  silent: nodeEnv === 'test',
  console: nodeEnv === 'development',
  files: nodeEnv === 'test'
    ? []
    : [
        { name: 'error', level: 'error' }, // solo error y fatal
        { name: 'combined', level: 'info' } // info, warning, error y fatal
      ]
})

export const createLogger = (settings) => {
  const options = resolveLoggerOptions(settings)
  const transports = options.files.map(({ name, level }) => rotatingFile(name, level))
  if (options.console) transports.push(new winston.transports.Console({ format: consoleFormat }))

  return winston.createLogger({
    levels: LOG_LEVELS,
    level: options.level,
    silent: options.silent,
    transports
  })
}

// Logger único de la aplicación: se importa desde cualquier archivo
const logger = createLogger(config)

export default logger