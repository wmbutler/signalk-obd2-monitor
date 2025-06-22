const { SerialPort } = require('serialport')
const EventEmitter = require('events')
const PidDefinitions = require('./pid-definitions')
const ConnectionStateManager = require('./connection-state-manager')

class OBD2Connection extends EventEmitter {
  constructor(options) {
    super()
    this.app = options.app // SignalK app object for logging
    this.port = null
    this.portPath = options.port
    this.baudRate = options.baudRate
    this.engineProfile = options.engineProfile
    this.enabledPids = options.enabledPids || []
    this.currentPidIndex = 0
    this.initialized = false
    this.buffer = ''
    this.lastCommand = null
    this.batchMode = options.batchMode !== false // Default to true
    this.maxBatchSize = options.maxBatchSize || 6 // Most adapters support 6 PIDs per request
    this.awaitingResponse = false
    this.responseTimeout = null
    this.continuousMode = options.continuousMode !== false // Default to true
    
    // Connection state management
    this.stateManager = new ConnectionStateManager(this.app)
    this.reconnectTimeout = null
    this.reconnectDelay = 5000 // 5 seconds between reconnect attempts
    
    // Setup state manager event handlers
    this.setupStateManagerHandlers()
  }

  setupStateManagerHandlers() {
    // Handle state changes
    this.stateManager.on('stateChange', (change) => {
      this.emit('stateChange', change)
    })
    
    // Handle probing
    this.stateManager.on('startProbing', () => {
      this.app.debug('Starting probe mode - checking adapter connectivity')
      this.startProbing()
    })
    
    this.stateManager.on('probe', () => {
      this.sendProbeCommand()
    })
    
    this.stateManager.on('resumeNormalPolling', () => {
      this.app.debug('Resuming normal PID polling')
      if (this.initialized && this.continuousMode) {
        this.requestNextPid()
      }
    })
    
    this.stateManager.on('connectionLost', () => {
      this.app.debug('Connection lost - attempting reconnection')
      this.scheduleReconnect()
    })
  }

  connect() {
    try {
      this.app.debug(`Attempting to connect to OBD2 adapter on ${this.portPath} at ${this.baudRate} baud`)
      
      this.port = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate
      })

      this.port.on('open', () => {
        this.app.debug('Serial port opened successfully')
        this.stateManager.onConnected()
        this.emit('connected')
        this.initializeOBD()
      })

      this.port.on('data', (data) => {
        this.app.debug(`Raw data received: ${data.toString()} (hex: ${data.toString('hex')})`)
        this.handleData(data)
      })

      this.port.on('error', (err) => {
        this.app.error(`Serial port error on ${this.portPath}: ${err.message}`)
        this.emit('error', err)
      })

      this.port.on('close', () => {
        this.app.debug('Serial port closed')
        this.stateManager.onDisconnected()
        this.emit('disconnected')
        this.initialized = false
        this.port = null
        
        // Schedule reconnection attempt
        this.scheduleReconnect()
      })
    } catch (error) {
      this.app.error(`Failed to create serial port ${this.portPath}: ${error.message}`)
      this.emit('error', error)
    }
  }

  disconnect() {
    this.clearResponseTimeout()
    
    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    
    // Clear any probe timeouts
    if (this.probeTimeout) {
      clearTimeout(this.probeTimeout)
      this.probeTimeout = null
    }
    
    // Clear init stage timeouts
    if (this.adapterCheckTimeout) {
      clearTimeout(this.adapterCheckTimeout)
      this.adapterCheckTimeout = null
    }
    
    if (this.engineCheckTimeout) {
      clearTimeout(this.engineCheckTimeout)
      this.engineCheckTimeout = null
    }
    
    if (this.port && this.port.isOpen) {
      this.port.close()
    }
  }

  initializeOBD() {
    this.app.debug('Starting OBD2 initialization sequence')
    
    // Stage 1: Check adapter connectivity
    this.stateManager.onAdapterCheck()
    this.checkAdapterConnectivity()
  }
  
  checkAdapterConnectivity() {
    this.app.debug('Stage 1: Checking adapter connectivity with ATI command')
    this.initStage = 'adapter_check'
    this.sendCommand('ATI')
    
    // Set timeout for adapter check
    this.adapterCheckTimeout = setTimeout(() => {
      this.app.error('Adapter check timeout - no response to ATI command')
      this.emit('adapterError', 'No response from OBD2 adapter')
    }, 3000)
  }
  
  checkEngineConnectivity() {
    this.app.debug('Stage 2: Checking engine connectivity with 0100 command')
    this.stateManager.onEngineCheck()
    this.initStage = 'engine_check'
    this.sendCommand('0100')
    
    // Set timeout for engine check
    this.engineCheckTimeout = setTimeout(() => {
      this.app.debug('Engine check timeout - engine may be off')
      this.stateManager.onEngineOff()
      this.emit('engineOff', 'Engine not responding - may be off')
      // Start probing mode
      this.startProbing()
    }, 3000)
  }
  
  completeInitialization() {
    this.app.debug('Both adapter and engine verified - completing initialization')
    this.stateManager.onInitializing()
    
    // Send essential initialization commands with better timing
    const initCommands = [
      { cmd: 'ATZ', desc: 'Reset adapter', delay: 0 },
      { cmd: 'ATE0', desc: 'Echo off', delay: 2000 },
      { cmd: 'ATH0', desc: 'Headers off', delay: 1000 },
      { cmd: 'ATSP0', desc: 'Auto protocol', delay: 1000 }
    ]
    
    let totalDelay = 0
    initCommands.forEach(({ cmd, desc, delay }) => {
      totalDelay += delay
      setTimeout(() => {
        this.app.debug(`Sending ${cmd} (${desc})`)
        this.sendCommand(cmd)
      }, totalDelay)
    })
    
    // Mark as initialized after all commands
    setTimeout(() => {
      this.initialized = true
      this.initStage = null // Clear init stage
      this.app.debug(`OBD2 initialization complete - PIDs: ${this.enabledPids.join(',')}, Batch: ${this.batchMode}, MaxBatch: ${this.maxBatchSize}`)
      this.stateManager.onInitialized()
      this.emit('initialized')
    }, totalDelay + 2000)
  }

  sendCommand(command) {
    if (this.port && this.port.isOpen) {
      this.lastCommand = command
      this.port.write(command + '\r')
      
      // Log all OBD2 commands at debug level
      this.app.debug(`OBD2 command sent: ${command}`)
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
    
    // Check if this is a Mode 22 PID (starts with 22:)
    let command
    if (pid.startsWith('22:')) {
      // Mode 22 format: 22:XXXX
      const mode22Pid = pid.substring(3)
      command = '22' + mode22Pid
    } else {
      // Standard Mode 01
      command = '01' + pid
    }
    
    // Log RPM query specifically
    if (pid === '0C') {
      this.app.debug(`Requesting RPM data - PID: ${pid}, Command: ${command}`)
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
      this.app.debug('Batch mode failed previously, using single PID mode')
      this.batchMode = false
      this.requestSinglePid()
      return
    }
    
    // Check if any PIDs in the current batch are Mode 22
    let hasMode22 = false
    for (let i = 0; i < this.maxBatchSize && (this.currentPidIndex + i) < this.enabledPids.length; i++) {
      const pidIndex = (this.currentPidIndex + i) % this.enabledPids.length
      if (this.enabledPids[pidIndex].startsWith('22:')) {
        hasMode22 = true
        break
      }
    }
    
    // Mode 22 PIDs cannot be batched with Mode 01 PIDs
    if (hasMode22) {
      this.app.debug('Mode 22 PID detected, using single PID mode for this request')
      this.batchMode = false
      this.requestSinglePid()
      this.batchMode = true // Re-enable for next iteration
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
    
    this.app.debug(`Requesting PID batch: ${pidsInBatch.join(',')} - Command: ${command}`)
    
    // Check if RPM is in this batch
    if (pidsInBatch.includes('0C')) {
      this.app.debug(`RPM included in batch request: ${command}`)
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
      this.app.debug(`Response timeout - no data received for command: ${this.lastCommand}`)
      
      // If batch mode timed out, try falling back to single mode
      if (this.batchMode && this.currentBatch) {
        this.app.debug('Batch mode timeout, disabling batch mode')
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
    
    this.app.debug(`Buffer state: ${this.buffer.length} bytes, has prompt: ${this.buffer.includes('>')}`)
    
    // Look for complete responses ending with '>'
    if (this.buffer.includes('>')) {
      this.clearResponseTimeout()
      this.awaitingResponse = false
      
      const lines = this.buffer.split(/[\r\n]+/)
      const responses = []
      
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim()
        if (line.length > 0 && line !== '>' && !line.startsWith('SEARCHING')) {
          // Check if this is a byte count prefix (3 hex digits at start of multiline response)
          if (/^[0-9A-Fa-f]{3}$/.test(line) && i < lines.length - 1) {
            this.app.debug(`Detected byte count prefix: ${line}`)
            continue // Skip byte count lines
          }
          
          // Check if line has a line number prefix (e.g., "0: 41 23 00")
          const lineNumberMatch = line.match(/^(\d+):\s*(.+)$/)
          if (lineNumberMatch) {
            line = lineNumberMatch[2] // Extract the actual data part
            this.app.debug(`Stripped line number prefix, cleaned line: ${line}`)
          }
          
          responses.push(line)
        }
      }
      
      this.app.debug(`Parsed ${responses.length} responses: ${responses.join(', ')}`)
      
      // Process all responses
      if (responses.length > 0) {
        // Handle initialization stage responses
        if (this.initStage === 'adapter_check') {
          this.handleAdapterCheckResponse(responses)
        } else if (this.initStage === 'engine_check') {
          this.handleEngineCheckResponse(responses)
        } else if (this.isProbing && this.lastCommand === '0100') {
          // Check if this is a probe response
          this.handleProbeResponse(responses.join(' '))
        } else {
          this.processBatchResponse(responses)
        }
      } else {
        this.app.debug('No valid responses found in buffer')
      }
      
      // Clear buffer
      this.buffer = ''
      
      // If in continuous mode, immediately request next batch
      if (this.continuousMode && this.initialized) {
        this.app.debug('Scheduling next PID request')
        setImmediate(() => this.requestNextPid())
      }
    }
  }

  processBatchResponse(responses) {
    this.app.debug(`Processing batch response with ${responses.length} lines`)
    
    // Check if this is a multi-line response (batch mode)
    const dataResponses = responses.filter(r => {
      // Check if line starts with mode indicator
      if (r.startsWith('41') || r.startsWith('62')) {
        return true
      }
      // Also check if it contains mode indicator after potential formatting
      if (r.includes('41 ') || r.includes('62 ')) {
        return true
      }
      return false
    })
    
    if (dataResponses.length === 0) {
      // Handle error responses
      if (responses.some(r => r.includes('NO DATA'))) {
        this.app.debug(`No data received: ${responses.join(', ')}`)
        this.stateManager.onNoData()
      } else if (responses.some(r => r.includes('UNABLE TO CONNECT'))) {
        this.app.error(`Unable to connect to ECU: ${responses.join(', ')}`)
      } else if (responses.some(r => r.includes('CAN ERROR'))) {
        this.app.error(`CAN bus error: ${responses.join(', ')}`)
      } else if (responses.some(r => r.includes('?'))) {
        this.app.error(`Invalid command '${this.lastCommand}': ${responses.join(', ')}`)
        // If batch mode failed with invalid command, disable it
        if (this.batchMode && this.currentBatch) {
          this.app.debug('Batch command not supported, disabling batch mode')
          this.batchModeFailed = true
          this.batchMode = false
        }
      } else {
        this.app.debug(`No valid data responses: ${responses.join(', ')}`)
      }
      return
    }
    
    this.app.debug(`Found ${dataResponses.length} data responses`)
    
    // For batch mode responses without spaces, we need to split them
    if (dataResponses.length === 1 && this.batchMode && this.currentBatch) {
      const response = dataResponses[0]
      // Check if this looks like a concatenated batch response (no spaces, very long)
      if (!response.includes(' ') && response.length > 10) {
        this.app.debug(`Detected concatenated batch response, attempting to split`)
        // Try to split the batch response into individual PID responses
        this.processBatchResponseWithoutSpaces(response)
        return
      }
    }
    
    // Process each data line normally
    dataResponses.forEach(response => {
      this.processResponse(response)
    })
  }

  processBatchResponseWithoutSpaces(response) {
    try {
      // Remove the initial '41' mode indicator
      if (!response.startsWith('41')) {
        this.app.debug(`Batch response doesn't start with 41: ${response}`)
        return
      }
      
      let remaining = response.substring(2)
      const processedPids = []
      
      // Process each PID in the batch
      for (const pid of this.currentBatch.pids) {
        if (remaining.length < 2) break
        
        // Check if the next part matches the expected PID
        const responsePid = remaining.substring(0, 2)
        if (responsePid !== pid) {
          this.app.debug(`Expected PID ${pid} but found ${responsePid} in batch response`)
          continue
        }
        
        // Get PID definition to know how many data bytes to expect
        const pidDef = PidDefinitions.getPidDefinition(pid)
        if (!pidDef) {
          this.app.debug(`Unknown PID ${pid} in batch response`)
          remaining = remaining.substring(2) // Skip this PID
          continue
        }
        
        // Extract the data bytes for this PID
        const dataLength = pidDef.bytes * 2 // Each byte is 2 hex chars
        if (remaining.length < 2 + dataLength) {
          this.app.debug(`Insufficient data for PID ${pid} in batch response`)
          break
        }
        
        // Construct individual response and process it
        const individualResponse = '41' + remaining.substring(0, 2 + dataLength)
        this.app.debug(`Extracted PID ${pid} from batch: ${individualResponse}`)
        this.processResponse(individualResponse)
        processedPids.push(pid)
        
        // Move to next PID in the response
        remaining = remaining.substring(2 + dataLength)
      }
      
      this.app.debug(`Processed ${processedPids.length} PIDs from batch response: ${processedPids.join(', ')}`)
      
    } catch (error) {
      this.app.error(`Error processing batch response without spaces: ${error.message}`)
      // Fall back to single PID mode
      this.batchModeFailed = true
      this.batchMode = false
    }
  }

  processResponse(response) {
    try {
      // Skip echo and non-data responses
      if ((!response.includes('41') && !response.includes('62')) || response.includes('NO DATA')) {
        if (response.includes('NO DATA') && this.lastCommand) {
          const mode = this.lastCommand.substring(0, 2)
          const pid = this.lastCommand.substring(2)
          this.app.debug(`No data received for Mode ${mode} PID ${pid} - Command: ${this.lastCommand}, Response: ${response}`)
          
          // Special logging for RPM queries
          if (pid === '0C') {
            this.app.debug(`RPM query failed with NO DATA response`)
          }
        }
        return
      }

      // Parse OBD2 response - handle both formats (with and without spaces)
      let parts = []
      
      // Check if response has spaces
      if (response.includes(' ')) {
        // Format: "41 XX YY ZZ..." or "62 XX XX YY ZZ..."
        parts = response.trim().split(/\s+/)
      } else {
        // Format: "41XXYYZZ..." or "62XXXXYYZZ..." - parse as continuous hex string
        const cleanResponse = response.trim()
        const isMode22 = cleanResponse.startsWith('62')
        const minLength = isMode22 ? 8 : 6 // Mode 22 has 4-digit PIDs
        
        if (cleanResponse.length < minLength || (!cleanResponse.startsWith('41') && !cleanResponse.startsWith('62'))) {
          this.app.debug(`Invalid OBD2 response format: ${response}`)
          return
        }
        
        // Extract parts: 41 (mode), XX (PID), YY ZZ... (data bytes)
        parts = []
        for (let i = 0; i < cleanResponse.length; i += 2) {
          parts.push(cleanResponse.substr(i, 2))
        }
      }
      
      const responseMode = parts[0]
      if (parts.length < 3 || (responseMode !== '41' && responseMode !== '62')) {
        this.app.debug(`Invalid OBD2 response format: ${response} (parsed parts: ${parts.join(', ')})`)
        return
      }

      let pid, valueBytes
      if (responseMode === '62') {
        // Mode 22 response: 62 XX XX YY ZZ...
        if (parts.length < 4) {
          this.app.debug(`Invalid Mode 22 response format: ${response}`)
          return
        }
        pid = '22:' + parts[1] + parts[2] // Reconstruct Mode 22 PID format
        valueBytes = parts.slice(3).map(byte => parseInt(byte, 16))
      } else {
        // Mode 01 response: 41 XX YY ZZ...
        pid = parts[1]
        valueBytes = parts.slice(2).map(byte => parseInt(byte, 16))
      }
      
      // Get PID definition
      const pidDef = PidDefinitions.getPidDefinition(pid)
      if (!pidDef) {
        this.app.debug(`Unknown PID in response: ${pid}`)
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
        this.app.debug(`RPM query successful - PID: ${pid}, Value: ${finalValue} ${pidDef.unit}, Response: ${response}`)
      }

      // Log successful data processing at debug level
      this.app.debug(`PID ${pid} (${pidDef.name}): ${finalValue} ${pidDef.unit}`)

      // Notify state manager of successful data
      this.stateManager.onDataReceived({
        pid: pid,
        value: finalValue
      })
      
      this.emit('data', {
        pid: pid,
        name: pidDef.name,
        value: finalValue,
        unit: pidDef.unit,
        raw: valueBytes
      })
    } catch (error) {
      this.app.error(`Error processing OBD2 response '${response}': ${error.message}`)
      
      // If this was an RPM query, log it specifically
      if (this.lastCommand && this.lastCommand.substring(2) === '0C') {
        this.app.error(`RPM query error: ${error.message}`)
      }
      
      this.emit('error', error)
    }
  }

  // Probe mode methods
  startProbing() {
    this.app.debug('Entering probe mode - will check adapter connectivity every 2 seconds')
    this.continuousMode = false // Stop normal polling
    this.sendProbeCommand()
  }
  
  sendProbeCommand() {
    if (!this.port || !this.port.isOpen) {
      this.app.debug('Cannot send probe - port not open')
      return
    }
    
    this.app.debug('Sending probe command 0100 (supported PIDs)')
    this.lastCommand = '0100'
    this.isProbing = true
    this.sendCommand('0100')
    
    // Set timeout for probe response
    this.probeTimeout = setTimeout(() => {
      this.app.debug('Probe timeout - no response')
      this.stateManager.onProbeResponse(false, 'TIMEOUT')
      this.stateManager.scheduleNextProbe()
    }, 2000)
  }
  
  handleProbeResponse(response) {
    if (this.probeTimeout) {
      clearTimeout(this.probeTimeout)
      this.probeTimeout = null
    }
    
    // Check if we got a valid response to 0100
    if (response.includes('4100') || response.includes('41 00')) {
      this.app.debug('Probe successful - adapter is responding')
      this.stateManager.onProbeResponse(true, response)
      this.continuousMode = true // Re-enable continuous mode
      this.isProbing = false
    } else if (response.includes('NO DATA')) {
      this.app.debug('Probe returned NO DATA - engine may be off but adapter is connected')
      this.stateManager.onProbeResponse(true, 'NO DATA')
      this.stateManager.scheduleNextProbe()
    } else {
      this.app.debug(`Unexpected probe response: ${response}`)
      this.stateManager.onProbeResponse(false, response)
      this.stateManager.scheduleNextProbe()
    }
  }
  
  scheduleReconnect() {
    // Don't schedule if we're already trying to reconnect
    if (this.reconnectTimeout) {
      return
    }
    
    this.app.debug(`Scheduling reconnection attempt in ${this.reconnectDelay}ms`)
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      this.app.debug('Attempting to reconnect...')
      
      // Reset state before reconnecting
      this.initialized = false
      this.initStage = null
      this.isProbing = false
      this.buffer = ''
      this.awaitingResponse = false
      
      this.connect()
    }, this.reconnectDelay)
  }
  
  getConnectionStatus() {
    return this.stateManager.getStatus()
  }
  
  handleAdapterCheckResponse(responses) {
    // Clear timeout
    if (this.adapterCheckTimeout) {
      clearTimeout(this.adapterCheckTimeout)
      this.adapterCheckTimeout = null
    }
    
    const response = responses.join(' ')
    this.app.debug(`Adapter check response: ${response}`)
    
    // Check if we got a valid adapter response
    if (response.includes('ELM327') || response.includes('STN') || response.includes('OBD')) {
      this.app.debug('Adapter verified successfully')
      this.stateManager.setAdapterInfo(response)
      this.emit('adapterVerified', response)
      
      // Proceed to engine check
      setTimeout(() => {
        this.checkEngineConnectivity()
      }, 500)
    } else {
      this.app.error(`Invalid adapter response: ${response}`)
      this.emit('adapterError', `Invalid adapter response: ${response}`)
    }
  }
  
  handleEngineCheckResponse(responses) {
    // Clear timeout
    if (this.engineCheckTimeout) {
      clearTimeout(this.engineCheckTimeout)
      this.engineCheckTimeout = null
    }
    
    const response = responses.join(' ')
    this.app.debug(`Engine check response: ${response}`)
    
    // Check if we got a valid response to 0100
    if (response.includes('41 00') || response.includes('4100')) {
      this.app.debug('Engine communication verified')
      this.emit('engineVerified')
      
      // Complete initialization
      setTimeout(() => {
        this.completeInitialization()
      }, 500)
    } else if (response.includes('NO DATA')) {
      this.app.debug('Engine not responding - may be off')
      this.stateManager.onEngineOff()
      this.emit('engineOff', 'Engine not responding - may be off')
      
      // Start probing mode
      this.initialized = true // Mark as initialized to allow probing
      this.initStage = null // Clear init stage
      this.startProbing()
    } else {
      this.app.error(`Unexpected engine check response: ${response}`)
      this.emit('engineError', `Unexpected response: ${response}`)
    }
  }
}

module.exports = OBD2Connection
