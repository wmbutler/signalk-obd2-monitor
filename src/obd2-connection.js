const { SerialPort } = require('serialport')
const EventEmitter = require('events')
const PidDefinitions = require('./pid-definitions')
const Logger = require('./logger')

class OBD2Connection extends EventEmitter {
  constructor(options) {
    super()
    this.port = null
    this.portPath = options.port
    this.baudRate = options.baudRate
    this.engineProfile = options.engineProfile
    this.enabledPids = options.enabledPids || []
    this.currentPidIndex = 0
    this.initialized = false
    this.buffer = ''
    this.logger = new Logger(options.logging || {})
    this.lastCommand = null
    this.batchMode = options.batchMode !== false // Default to true
    this.maxBatchSize = options.maxBatchSize || 6 // Most adapters support 6 PIDs per request
    this.awaitingResponse = false
    this.responseTimeout = null
    this.continuousMode = options.continuousMode !== false // Default to true
  }

  connect() {
    try {
      this.logger.info('Attempting to connect to OBD2 adapter', {
        port: this.portPath,
        baudRate: this.baudRate
      })
      
      this.port = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate
      })

      this.port.on('open', () => {
        this.logger.info('Serial port opened successfully')
        this.emit('connected')
        this.initializeOBD()
      })

      this.port.on('data', (data) => {
        this.logger.debug('Raw data received', { 
          data: data.toString(), 
          hex: data.toString('hex') 
        })
        this.handleData(data)
      })

      this.port.on('error', (err) => {
        this.logger.error('Serial port error', { 
          error: err.message,
          port: this.portPath 
        })
        this.emit('error', err)
      })

      this.port.on('close', () => {
        this.logger.info('Serial port closed')
        this.emit('disconnected')
        this.initialized = false
      })
    } catch (error) {
      this.logger.error('Failed to create serial port', { 
        error: error.message,
        port: this.portPath 
      })
      this.emit('error', error)
    }
  }

  disconnect() {
    this.clearResponseTimeout()
    if (this.port && this.port.isOpen) {
      this.port.close()
    }
  }

  initializeOBD() {
    this.logger.info('Starting OBD2 initialization sequence')
    
    // Send initialization commands
    setTimeout(() => {
      this.logger.info('Sending ATZ (reset)')
      this.sendCommand('ATZ')
    }, 500)
    
    setTimeout(() => {
      this.logger.info('Sending ATE0 (echo off)')
      this.sendCommand('ATE0')
    }, 2000)
    
    setTimeout(() => {
      this.logger.info('Sending ATL0 (linefeeds off)')
      this.sendCommand('ATL0')
    }, 3000)
    
    setTimeout(() => {
      this.logger.info('Sending ATS0 (spaces off)')
      this.sendCommand('ATS0')
    }, 4000)
    
    setTimeout(() => {
      this.logger.info('Sending ATH0 (headers off)')
      this.sendCommand('ATH0')
    }, 5000)
    
    setTimeout(() => {
      this.logger.info('Sending ATSP0 (auto protocol)')
      this.sendCommand('ATSP0')
    }, 6000)
    
    setTimeout(() => {
      this.logger.info('Sending test query 010C (RPM)')
      this.sendCommand('010C')
    }, 7000)
    
    setTimeout(() => {
      this.initialized = true
      this.logger.info('OBD2 initialization complete', {
        enabledPids: this.enabledPids,
        batchMode: this.batchMode,
        maxBatchSize: this.maxBatchSize
      })
      this.emit('initialized')
    }, 8000)
  }

  sendCommand(command) {
    if (this.port && this.port.isOpen) {
      this.lastCommand = command
      this.port.write(command + '\r')
      
      // Log all OBD2 commands at debug level
      this.logger.debug('OBD2 command sent', { command })
    }
  }

  requestNextPid() {
    if (!this.initialized || this.enabledPids.length === 0 || this.awaitingResponse) {
      return
    }

    if (this.batchMode) {
      this.requestPidBatch()
    } else {
      this.requestSinglePid()
    }
  }

  requestSinglePid() {
    const pid = this.enabledPids[this.currentPidIndex]
    const command = '01' + pid
    
    // Log RPM query specifically
    if (pid === '0C') {
      this.logger.info('Requesting RPM data', { pid, command })
    }
    
    this.sendCommand(command)
    this.awaitingResponse = true
    this.setResponseTimeout()
    
    // Move to next PID for next request
    this.currentPidIndex = (this.currentPidIndex + 1) % this.enabledPids.length
  }

  requestPidBatch() {
    // If batch mode has failed before, fall back to single mode
    if (this.batchModeFailed) {
      this.logger.info('Batch mode failed previously, using single PID mode')
      this.batchMode = false
      this.requestSinglePid()
      return
    }
    
    // Calculate how many PIDs we can request in this batch
    const remainingPids = this.enabledPids.length - this.currentPidIndex
    const batchSize = Math.min(this.maxBatchSize, remainingPids)
    
    // Build the batch command
    let command = '01'
    const pidsInBatch = []
    
    for (let i = 0; i < batchSize; i++) {
      const pidIndex = (this.currentPidIndex + i) % this.enabledPids.length
      const pid = this.enabledPids[pidIndex]
      command += pid
      pidsInBatch.push(pid)
    }
    
    this.logger.info('Requesting PID batch', { 
      pids: pidsInBatch, 
      command,
      batchSize 
    })
    
    // Check if RPM is in this batch
    if (pidsInBatch.includes('0C')) {
      this.logger.info('RPM included in batch request', { command })
    }
    
    this.sendCommand(command)
    this.awaitingResponse = true
    this.setResponseTimeout()
    
    // Store batch info for error handling
    this.currentBatch = {
      pids: pidsInBatch,
      command: command
    }
    
    // Move index forward by batch size
    this.currentPidIndex = (this.currentPidIndex + batchSize) % this.enabledPids.length
  }

  setResponseTimeout() {
    // Clear any existing timeout
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout)
    }
    
    // Set a timeout for response
    this.responseTimeout = setTimeout(() => {
      this.logger.warn('Response timeout - no data received', {
        lastCommand: this.lastCommand,
        batchMode: this.batchMode
      })
      
      // If batch mode timed out, try falling back to single mode
      if (this.batchMode && this.currentBatch) {
        this.logger.warn('Batch mode timeout, disabling batch mode')
        this.batchModeFailed = true
        this.batchMode = false
      }
      
      this.awaitingResponse = false
      
      // If in continuous mode, try next request
      if (this.continuousMode) {
        this.requestNextPid()
      }
    }, 1000) // 1 second timeout (increased for batch mode)
  }

  clearResponseTimeout() {
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout)
      this.responseTimeout = null
    }
  }

  handleData(data) {
    this.buffer += data.toString()
    
    this.logger.debug('Buffer state', { 
      buffer: this.buffer,
      hasPrompt: this.buffer.includes('>')
    })
    
    // Look for complete responses ending with '>'
    if (this.buffer.includes('>')) {
      this.clearResponseTimeout()
      this.awaitingResponse = false
      
      const lines = this.buffer.split(/[\r\n]+/)
      const responses = []
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.length > 0 && line !== '>' && !line.startsWith('SEARCHING')) {
          responses.push(line)
        }
      }
      
      this.logger.debug('Parsed responses', { 
        responses,
        count: responses.length 
      })
      
      // Process all responses
      if (responses.length > 0) {
        this.processBatchResponse(responses)
      } else {
        this.logger.warn('No valid responses found in buffer')
      }
      
      // Clear buffer
      this.buffer = ''
      
      // If in continuous mode, immediately request next batch
      if (this.continuousMode && this.initialized) {
        this.logger.debug('Scheduling next PID request')
        setImmediate(() => this.requestNextPid())
      }
    }
  }

  processBatchResponse(responses) {
    this.logger.debug('Processing batch response', { 
      responseCount: responses.length,
      responses 
    })
    
    // Check if this is a multi-line response (batch mode)
    const dataResponses = responses.filter(r => r.startsWith('41'))
    
    if (dataResponses.length === 0) {
      // Handle error responses
      if (responses.some(r => r.includes('NO DATA'))) {
        this.logger.warn('No data received', { responses })
      } else if (responses.some(r => r.includes('UNABLE TO CONNECT'))) {
        this.logger.error('Unable to connect to ECU', { responses })
      } else if (responses.some(r => r.includes('CAN ERROR'))) {
        this.logger.error('CAN bus error', { responses })
      } else if (responses.some(r => r.includes('?'))) {
        this.logger.error('Invalid command', { 
          responses,
          lastCommand: this.lastCommand 
        })
        // If batch mode failed with invalid command, disable it
        if (this.batchMode && this.currentBatch) {
          this.logger.warn('Batch command not supported, disabling batch mode')
          this.batchModeFailed = true
          this.batchMode = false
        }
      } else {
        this.logger.warn('No valid data responses', { responses })
      }
      return
    }
    
    this.logger.info('Found data responses', { 
      count: dataResponses.length,
      dataResponses 
    })
    
    // Process each data line
    dataResponses.forEach(response => {
      this.processResponse(response)
    })
  }

  processResponse(response) {
    try {
      // Skip echo and non-data responses
      if (!response.includes('41') || response.includes('NO DATA')) {
        if (response.includes('NO DATA') && this.lastCommand) {
          const pid = this.lastCommand.substring(2)
          this.logger.warn('No data received for PID', { pid, command: this.lastCommand, response })
          
          // Special logging for RPM queries
          if (pid === '0C') {
            this.logger.logRpmQuery(pid, this.lastCommand, response, null, new Error('NO DATA response'))
          }
        }
        return
      }

      // Parse OBD2 response (format: 41 XX YY ZZ...)
      const parts = response.replace(/\s+/g, ' ').split(' ')
      if (parts.length < 3 || parts[0] !== '41') {
        this.logger.warn('Invalid OBD2 response format', { response, parts })
        return
      }

      const pid = parts[1]
      const valueBytes = parts.slice(2).map(byte => parseInt(byte, 16))
      
      // Get PID definition
      const pidDef = PidDefinitions.getPidDefinition(pid)
      if (!pidDef) {
        this.logger.warn('Unknown PID in response', { pid, response })
        return
      }

      // Convert raw bytes to actual value
      const value = pidDef.convert(valueBytes)
      
      // Check if this engine has custom mapping for this PID
      let finalValue = value
      if (this.engineProfile.customMappings && 
          this.engineProfile.customMappings[pid] && 
          this.engineProfile.customMappings[pid].conversion) {
        finalValue = this.engineProfile.customMappings[pid].conversion(value)
      }

      // Special logging for RPM (PID 0C)
      if (pid === '0C') {
        this.logger.logRpmQuery(pid, this.lastCommand || `01${pid}`, response, finalValue)
      }

      // Log successful data processing at debug level
      this.logger.debug('PID data processed', {
        pid,
        name: pidDef.name,
        value: finalValue,
        unit: pidDef.unit,
        rawBytes: valueBytes
      })

      this.emit('data', {
        pid: pid,
        name: pidDef.name,
        value: finalValue,
        unit: pidDef.unit,
        raw: valueBytes
      })
    } catch (error) {
      this.logger.error('Error processing OBD2 response', {
        response,
        error: {
          message: error.message,
          stack: error.stack
        }
      })
      
      // If this was an RPM query, log it specifically
      if (this.lastCommand && this.lastCommand.substring(2) === '0C') {
        this.logger.logRpmQuery('0C', this.lastCommand, response, null, error)
      }
      
      this.emit('error', error)
    }
  }
}

module.exports = OBD2Connection
