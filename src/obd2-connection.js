const { SerialPort } = require('serialport')
const EventEmitter = require('events')
const PidDefinitions = require('./pid-definitions')

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
  }

  connect() {
    try {
      this.port = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate
      })

      this.port.on('open', () => {
        this.emit('connected')
        this.initializeOBD()
      })

      this.port.on('data', (data) => {
        this.handleData(data)
      })

      this.port.on('error', (err) => {
        this.emit('error', err)
      })

      this.port.on('close', () => {
        this.emit('disconnected')
        this.initialized = false
      })
    } catch (error) {
      this.emit('error', error)
    }
  }

  disconnect() {
    if (this.port && this.port.isOpen) {
      this.port.close()
    }
  }

  initializeOBD() {
    // Send initialization commands
    setTimeout(() => this.sendCommand('ATZ'), 500)      // Reset
    setTimeout(() => this.sendCommand('ATE0'), 2000)    // Echo off
    setTimeout(() => this.sendCommand('ATL0'), 3000)    // Linefeeds off
    setTimeout(() => this.sendCommand('ATS0'), 4000)    // Spaces off
    setTimeout(() => this.sendCommand('ATH0'), 5000)    // Headers off
    setTimeout(() => this.sendCommand('ATSP0'), 6000)   // Auto protocol
    setTimeout(() => {
      this.initialized = true
      this.emit('initialized')
    }, 7000)
  }

  sendCommand(command) {
    if (this.port && this.port.isOpen) {
      this.port.write(command + '\r')
    }
  }

  requestNextPid() {
    if (!this.initialized || this.enabledPids.length === 0) {
      return
    }

    const pid = this.enabledPids[this.currentPidIndex]
    this.sendCommand('01' + pid)
    
    // Move to next PID for next request
    this.currentPidIndex = (this.currentPidIndex + 1) % this.enabledPids.length
  }

  handleData(data) {
    this.buffer += data.toString()
    
    // Look for complete responses ending with '>'
    const lines = this.buffer.split(/[\r\n]+/)
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim()
      if (line.length > 0 && line !== '>') {
        this.processResponse(line)
      }
    }
    
    // Keep the last incomplete line in the buffer
    if (this.buffer.includes('>')) {
      this.buffer = ''
    } else {
      this.buffer = lines[lines.length - 1]
    }
  }

  processResponse(response) {
    // Skip echo and non-data responses
    if (!response.includes('41') || response.includes('NO DATA')) {
      return
    }

    // Parse OBD2 response (format: 41 XX YY ZZ...)
    const parts = response.replace(/\s+/g, ' ').split(' ')
    if (parts.length < 3 || parts[0] !== '41') {
      return
    }

    const pid = parts[1]
    const valueBytes = parts.slice(2).map(byte => parseInt(byte, 16))
    
    // Get PID definition
    const pidDef = PidDefinitions.getPidDefinition(pid)
    if (!pidDef) {
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

    this.emit('data', {
      pid: pid,
      name: pidDef.name,
      value: finalValue,
      unit: pidDef.unit,
      raw: valueBytes
    })
  }
}

module.exports = OBD2Connection
