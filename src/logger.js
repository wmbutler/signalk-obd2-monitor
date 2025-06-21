const fs = require('fs')
const path = require('path')
const { promisify } = require('util')

const appendFile = promisify(fs.appendFile)
const stat = promisify(fs.stat)
const rename = promisify(fs.rename)
const mkdir = promisify(fs.mkdir)

class Logger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false
    this.logDir = options.logDir || path.join(process.cwd(), 'logs')
    this.logFile = options.logFile || 'obd2-monitor.log'
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024 // 10MB default
    this.logLevel = options.logLevel || 'info'
    this.includeRawData = options.includeRawData !== false
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    }
    
    // Ensure log directory exists
    this.ensureLogDirectory()
  }

  async ensureLogDirectory() {
    try {
      await mkdir(this.logDir, { recursive: true })
    } catch (error) {
      console.error(`Failed to create log directory: ${error.message}`)
    }
  }

  async log(level, message, data = {}) {
    if (!this.enabled || this.levels[level] > this.levels[this.logLevel]) {
      return
    }

    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...data
    }

    const logLine = JSON.stringify(logEntry) + '\n'
    const logPath = path.join(this.logDir, this.logFile)

    try {
      // Check if rotation is needed
      await this.rotateIfNeeded(logPath)
      
      // Write log entry
      await appendFile(logPath, logLine, 'utf8')
    } catch (error) {
      console.error(`Logging error: ${error.message}`)
    }
  }

  async rotateIfNeeded(logPath) {
    try {
      const stats = await stat(logPath)
      if (stats.size >= this.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const rotatedPath = logPath.replace('.log', `-${timestamp}.log`)
        await rename(logPath, rotatedPath)
      }
    } catch (error) {
      // File doesn't exist yet, which is fine
      if (error.code !== 'ENOENT') {
        console.error(`Log rotation error: ${error.message}`)
      }
    }
  }

  async logRpmQuery(pid, command, response, value, error = null) {
    const logData = {
      pid,
      command,
      response: this.includeRawData ? response : '[raw data hidden]',
      value,
      unit: 'rpm'
    }

    if (error) {
      logData.error = {
        message: error.message,
        stack: error.stack
      }
      await this.log('error', `RPM query failed for PID ${pid}`, logData)
    } else {
      await this.log('info', `RPM query successful for PID ${pid}: ${value} rpm`, logData)
    }
  }

  async logObd2Command(command, response, error = null) {
    const logData = {
      command,
      response: this.includeRawData ? response : '[raw data hidden]'
    }

    if (error) {
      logData.error = {
        message: error.message,
        stack: error.stack
      }
      await this.log('error', `OBD2 command failed: ${command}`, logData)
    } else {
      await this.log('debug', `OBD2 command executed: ${command}`, logData)
    }
  }

  // Convenience methods
  async error(message, data) {
    await this.log('error', message, data)
  }

  async warn(message, data) {
    await this.log('warn', message, data)
  }

  async info(message, data) {
    await this.log('info', message, data)
  }

  async debug(message, data) {
    await this.log('debug', message, data)
  }
}

module.exports = Logger
