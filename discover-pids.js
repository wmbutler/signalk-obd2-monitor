#!/usr/bin/env node

const { SerialPort } = require('serialport')
const fs = require('fs')
const path = require('path')
const { program } = require('commander')
const PidDefinitions = require('./src/pid-definitions')

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

class PidDiscovery {
  constructor(options) {
    this.port = null
    this.portPath = options.port
    this.baudRate = options.baud
    this.buffer = ''
    this.discoveredPids = []
    this.testedPids = 0
    this.totalPids = 256 // Standard Mode 01 PIDs
    this.adapterInfo = ''
    this.startTime = Date.now()
    this.initStage = null
  }

  log(message, color = '') {
    console.log(color + message + colors.reset)
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.log(`\nConnecting to ${this.portPath} at ${this.baudRate} baud...`, colors.cyan)
      
      try {
        this.port = new SerialPort({
          path: this.portPath,
          baudRate: this.baudRate
        })

        this.port.on('open', () => {
          this.log('✓ Serial port opened', colors.green)
          resolve()
        })

        this.port.on('error', (err) => {
          reject(new Error(`Serial port error: ${err.message}`))
        })

        this.port.on('data', (data) => {
          this.handleData(data)
        })
      } catch (error) {
        reject(new Error(`Failed to open serial port: ${error.message}`))
      }
    })
  }

  handleData(data) {
    this.buffer += data.toString()
    
    // Look for complete responses ending with '>'
    if (this.buffer.includes('>')) {
      const lines = this.buffer.split(/[\r\n]+/)
      const responses = []
      
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim()
        if (line.length > 0 && line !== '>' && !line.startsWith('SEARCHING')) {
          // Check if this is a byte count prefix (3 hex digits at start of multiline response)
          if (/^[0-9A-Fa-f]{3}$/.test(line) && i < lines.length - 1) {
            continue // Skip byte count lines
          }
          
          // Check if line has a line number prefix (e.g., "0: 41 23 00")
          const lineNumberMatch = line.match(/^(\d+):\s*(.+)$/)
          if (lineNumberMatch) {
            line = lineNumberMatch[2] // Extract the actual data part
          }
          
          responses.push(line)
        }
      }
      
      // Process responses based on init stage
      if (this.initStage === 'adapter_check') {
        this.handleAdapterCheckResponse(responses)
      } else if (this.initStage === 'engine_check') {
        this.handleEngineCheckResponse(responses)
      }
      
      // Clear buffer
      this.buffer = ''
    }
  }

  async sendCommand(command, timeout = 2000) {
    return new Promise((resolve) => {
      this.buffer = ''
      this.port.write(command + '\r')
      
      setTimeout(() => {
        resolve(this.buffer)
      }, timeout)
    })
  }

  async checkAdapter() {
    this.log('\nChecking adapter connectivity...', colors.cyan)
    this.initStage = 'adapter_check'
    
    // Send ATI command and wait for response
    await new Promise((resolve, reject) => {
      this.adapterCheckResolve = resolve
      this.adapterCheckReject = reject
      
      this.port.write('ATI\r')
      
      // Set timeout for adapter check
      setTimeout(() => {
        if (this.initStage === 'adapter_check') {
          reject(new Error('Adapter check timeout - no response to ATI command'))
        }
      }, 3000)
    })
  }

  handleAdapterCheckResponse(responses) {
    const response = responses.join(' ')
    
    // Check if we got a valid adapter response
    if (response.includes('ELM327') || response.includes('STN') || response.includes('OBD')) {
      this.adapterInfo = response
      this.log(`✓ Adapter detected: ${this.adapterInfo}`, colors.green)
      this.initStage = null
      
      if (this.adapterCheckResolve) {
        this.adapterCheckResolve()
      }
    } else {
      if (this.adapterCheckReject) {
        this.adapterCheckReject(new Error(`Invalid adapter response: ${response}`))
      }
    }
  }

  async checkEngine() {
    this.log('\nChecking engine status...', colors.cyan)
    this.initStage = 'engine_check'
    
    // Send 0100 command and wait for response
    await new Promise((resolve, reject) => {
      this.engineCheckResolve = resolve
      this.engineCheckReject = reject
      
      this.port.write('0100\r')
      
      // Set timeout for engine check
      setTimeout(() => {
        if (this.initStage === 'engine_check') {
          reject(new Error('Engine not responding - may be off'))
        }
      }, 3000)
    })
  }

  handleEngineCheckResponse(responses) {
    const response = responses.join(' ')
    
    // Check if we got a valid response to 0100
    if (response.includes('41 00') || response.includes('4100')) {
      this.log('✓ Engine is running and responding', colors.green)
      this.initStage = null
      
      if (this.engineCheckResolve) {
        this.engineCheckResolve()
      }
    } else if (response.includes('NO DATA')) {
      if (this.engineCheckReject) {
        this.engineCheckReject(new Error('Engine not responding - may be off'))
      }
    } else {
      if (this.engineCheckReject) {
        this.engineCheckReject(new Error(`Unexpected engine response: ${response}`))
      }
    }
  }

  async initializeAdapter() {
    this.log('\nInitializing adapter...', colors.cyan)
    
    // Send initialization commands with proper timing
    const initCommands = [
      { cmd: 'ATZ', desc: 'Reset adapter', delay: 2000 },
      { cmd: 'ATE0', desc: 'Echo off', delay: 1000 },
      { cmd: 'ATH0', desc: 'Headers off', delay: 1000 },
      { cmd: 'ATSP0', desc: 'Auto protocol', delay: 1000 }
    ]
    
    for (const { cmd, desc, delay } of initCommands) {
      this.log(`  ${cmd} (${desc})`)
      await this.sendCommand(cmd, delay)
    }
    
    this.log('✓ Adapter initialized', colors.green)
  }

  parseResponse(response, pid, mode = '01') {
    // Clean up response
    let cleaned = response.trim().replace(/[\r\n>]/g, ' ').trim()
    
    // Check for valid data response
    if (cleaned.includes('NO DATA') || cleaned.includes('?') || cleaned.includes('UNABLE')) {
      return null
    }
    
    // Handle vLinker FS format with byte count prefix and line numbers
    const lines = response.split(/[\r\n]+/)
    const processedLines = []
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim()
      
      // Skip byte count lines (3 hex digits)
      if (/^[0-9A-Fa-f]{3}$/.test(line)) {
        continue
      }
      
      // Remove line number prefix (e.g., "0: ", "1: ")
      const lineNumberMatch = line.match(/^(\d+):\s*(.+)$/)
      if (lineNumberMatch) {
        line = lineNumberMatch[2]
      }
      
      if (line.length > 0 && line !== '>') {
        processedLines.push(line)
      }
    }
    
    // Rejoin cleaned lines
    cleaned = processedLines.join(' ')
    
    // Determine response mode based on request mode
    let responseMode = ''
    if (mode === '01') responseMode = '41'
    else if (mode === '22') responseMode = '62'
    
    // Look for mode response with spaces
    const modeMatch = cleaned.match(new RegExp(`${responseMode}\\s*([0-9A-Fa-f]+)\\s*([0-9A-Fa-f\\s]*)`))
    if (modeMatch) {
      const responsePid = mode === '22' ? modeMatch[1].substring(0, 4) : modeMatch[1].substring(0, 2)
      if (responsePid.toUpperCase() === pid.toUpperCase()) {
        // Extract data bytes
        const dataStart = mode === '22' ? 4 : 2
        const dataBytes = modeMatch[1].substring(dataStart) + (modeMatch[2] || '')
        const byteCount = dataBytes.trim().split(/\s+/).filter(b => b.length > 0).length
        return {
          pid: pid,
          dataBytes: byteCount || 1
        }
      }
    }
    
    // Also check without spaces
    const compactMatch = cleaned.match(new RegExp(`${responseMode}([0-9A-Fa-f]+)`))
    if (compactMatch) {
      const responsePid = mode === '22' ? compactMatch[1].substring(0, 4) : compactMatch[1].substring(0, 2)
      if (responsePid.toUpperCase() === pid.toUpperCase()) {
        // Count remaining bytes
        const dataStart = mode === '22' ? 4 : 2
        const dataLength = (compactMatch[1].length - dataStart) / 2
        return {
          pid: pid,
          dataBytes: Math.floor(dataLength) || 1
        }
      }
    }
    
    return null
  }

  updateProgress() {
    const percentage = Math.floor((this.testedPids / this.totalPids) * 100)
    const barLength = 40
    const filled = Math.floor((percentage / 100) * barLength)
    const empty = barLength - filled
    
    const progressBar = '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']'
    const status = `${progressBar} ${percentage}% (${this.testedPids}/${this.totalPids})`
    
    process.stdout.write('\r' + status)
  }

  async testPid(pid, mode = '01') {
    const command = mode + pid
    const response = await this.sendCommand(command, 500) // Shorter timeout for individual PIDs
    
    const result = this.parseResponse(response, pid, mode)
    if (result) {
      const fullPid = mode === '22' ? '22:' + pid : pid
      const pidDef = PidDefinitions.getPidDefinition(fullPid)
      const name = pidDef ? pidDef.name : (mode === '22' ? 'Manufacturer Specific' : 'Unknown')
      
      this.discoveredPids.push({
        pid: fullPid,
        name: name,
        dataBytes: result.dataBytes
      })
      
      // Show discovered PID below progress bar
      process.stdout.write('\n')
      this.log(`✓ ${fullPid} ${name}`, colors.green)
      
      return true
    }
    
    return false
  }

  async discoverPids() {
    this.log('\n\nDiscovering supported PIDs...', colors.bright)
    this.log('Testing Mode 01 PIDs (00-FF):\n')
    
    // First, try to get supported PIDs from the ECU
    const supportedRanges = []
    const supportChecks = ['00', '20', '40', '60', '80', 'A0', 'C0', 'E0']
    
    for (const checkPid of supportChecks) {
      const response = await this.sendCommand('01' + checkPid)
      const result = this.parseResponse(response, checkPid)
      if (result) {
        supportedRanges.push(checkPid)
      }
    }
    
    this.log(`\nSupported PID ranges: ${supportedRanges.join(', ')}\n`)
    
    // Test all PIDs from 00 to FF
    for (let i = 0; i <= 255; i++) {
      const pid = i.toString(16).toUpperCase().padStart(2, '0')
      
      this.testedPids++
      this.updateProgress()
      
      // Skip PIDs used for supported PID checks (they don't return actual data)
      if (supportChecks.includes(pid)) {
        continue
      }
      
      await this.testPid(pid)
      
      // Small delay to avoid overwhelming the adapter
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    process.stdout.write('\n\n')
    
    // Test Mode 22 PIDs (manufacturer specific)
    this.log('Testing Mode 22 PIDs (manufacturer specific)...', colors.cyan)
    this.log('This may take a few minutes...\n')
    
    // Common Mode 22 PID ranges for marine engines
    const mode22Ranges = [
      { start: 0x0000, end: 0x00FF, desc: 'Basic parameters' },
      { start: 0x0400, end: 0x04FF, desc: 'Fuel/consumption' },
      { start: 0x0500, end: 0x05FF, desc: 'Temperature/pressure' }
    ]
    
    let mode22Tested = 0
    let mode22Found = 0
    
    for (const range of mode22Ranges) {
      this.log(`\nTesting ${range.desc} (${range.start.toString(16).padStart(4, '0').toUpperCase()}-${range.end.toString(16).padStart(4, '0').toUpperCase()})...`)
      
      // Test every 16th PID in the range for efficiency
      for (let i = range.start; i <= range.end; i += 16) {
        const pid = i.toString(16).toUpperCase().padStart(4, '0')
        mode22Tested++
        
        // Update progress
        const rangeProgress = Math.floor(((i - range.start) / (range.end - range.start)) * 100)
        process.stdout.write(`\rTesting ${pid}... [${rangeProgress}%]`)
        
        const found = await this.testPid(pid, '22')
        if (found) {
          mode22Found++
          
          // If we found a PID, test nearby PIDs too
          for (let j = 1; j <= 15; j++) {
            if (i + j <= range.end) {
              const nearbyPid = (i + j).toString(16).toUpperCase().padStart(4, '0')
              mode22Tested++
              await this.testPid(nearbyPid, '22')
              await new Promise(resolve => setTimeout(resolve, 50))
            }
          }
        }
        
        // Small delay to avoid overwhelming the adapter
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      process.stdout.write('\r' + ' '.repeat(50) + '\r') // Clear progress line
    }
    
    // Also test specific known PIDs
    const knownMode22Pids = [
      '0545', '0045', '0405', '0445', // Hyundai
      '0100', '0101', '0102', '0103', // Common engine data
      '0200', '0201', '0202', '0203', // Common fuel data
      '0300', '0301', '0302', '0303', // Common temperature data
    ]
    
    this.log('\nTesting known manufacturer PIDs...')
    for (const pid of knownMode22Pids) {
      mode22Tested++
      await this.testPid(pid, '22')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    this.log(`\nMode 22 discovery complete: ${mode22Found} PIDs found (tested ${mode22Tested})`, colors.green)
    
    // Update total tested count
    this.testedPids += mode22Tested
  }

  generateProfile() {
    const profileName = 'discovered-' + new Date().toISOString().slice(0, 10)
    const supportedPids = this.discoveredPids.map(p => p.pid).sort()
    
    const profile = {
      [profileName]: {
        manufacturer: 'Unknown',
        model: 'Discovered Profile',
        supportedPids: supportedPids,
        discoveryMetadata: {
          discoveredAt: new Date().toISOString(),
          adapterInfo: this.adapterInfo,
          totalPidsTested: this.testedPids,
          successfulPids: this.discoveredPids.length,
          discoveryDuration: Math.floor((Date.now() - this.startTime) / 1000) + ' seconds',
          pidDetails: this.discoveredPids
        }
      }
    }
    
    const outputPath = path.join(__dirname, 'src', 'engine-profiles', 'discovered.js')
    const content = `// Auto-generated engine profile from PID discovery
// Generated: ${new Date().toISOString()}
// Adapter: ${this.adapterInfo}

module.exports = ${JSON.stringify(profile, null, 2)}
`
    
    // Always overwrite the file
    fs.writeFileSync(outputPath, content)
    this.log(`\n✓ Profile saved to ${outputPath}`, colors.green)
    this.showSummary()
  }

  showSummary() {
    const duration = Math.floor((Date.now() - this.startTime) / 1000)
    
    this.log('\n' + '='.repeat(50), colors.bright)
    this.log('Discovery Summary', colors.bright)
    this.log('='.repeat(50), colors.bright)
    this.log(`Total PIDs tested: ${this.testedPids}`)
    this.log(`Successful PIDs: ${this.discoveredPids.length}`, colors.green)
    this.log(`Discovery time: ${duration} seconds`)
    this.log(`\nDiscovered PIDs:`, colors.cyan)
    
    this.discoveredPids.forEach(p => {
      this.log(`  ${p.pid} - ${p.name}`)
    })
    
    this.log('\nTo use this profile:', colors.yellow)
    this.log('1. The profile has been saved to src/engine-profiles/discovered.js')
    this.log('2. Restart SignalK and select "Unknown > Discovered Profile" in plugin settings')
  }

  async run() {
    try {
      this.log('\nOBD2 PID Discovery Tool', colors.bright + colors.cyan)
      this.log('======================\n', colors.bright + colors.cyan)
      
      await this.connect()
      await this.checkAdapter()
      await this.checkEngine()
      await this.initializeAdapter()
      await this.discoverPids()
      
      this.generateProfile()
      
      if (this.port && this.port.isOpen) {
        this.port.close()
      }
      
      process.exit(0)
    } catch (error) {
      this.log(`\n✗ Error: ${error.message}`, colors.red)
      
      if (this.port && this.port.isOpen) {
        this.port.close()
      }
      
      process.exit(1)
    }
  }
}

// Try to load SignalK config
function loadSignalKConfig() {
  try {
    // Common SignalK config locations
    const configPaths = [
      path.join(process.env.HOME, '.signalk/plugin-config-data/signalk-obd2-monitor.json'),
      path.join(process.env.HOME, '.signalk/defaults.json'),
      '/home/pi/.signalk/plugin-config-data/signalk-obd2-monitor.json'
    ]
    
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        
        // Look for OBD2 plugin config
        if (config.configuration) {
          return {
            port: config.configuration.connection?.serialPort,
            baud: config.configuration.connection?.baudRate || 9600
          }
        }
      }
    }
  } catch (error) {
    // Ignore config loading errors
  }
  
  return null
}

// Command line interface
program
  .name('discover-pids')
  .description('Discover supported OBD2 PIDs from your engine')
  .version('1.0.0')
  .option('-p, --port <port>', 'Serial port path')
  .option('-b, --baud <rate>', 'Baud rate', '9600')
  .parse(process.argv)

const options = program.opts()

// Try to load from SignalK config if port not specified
if (!options.port) {
  const signalkConfig = loadSignalKConfig()
  if (signalkConfig && signalkConfig.port) {
    options.port = signalkConfig.port
    options.baud = signalkConfig.baud
    console.log(`Using SignalK config: ${options.port} @ ${options.baud} baud`)
  } else {
    console.error('Error: Serial port not specified and could not load from SignalK config')
    console.log('Usage: node discover-pids.js --port /dev/ttyUSB0 [--baud 9600]')
    process.exit(1)
  }
}

// Create and run discovery
const discovery = new PidDiscovery({
  port: options.port,
  baud: parseInt(options.baud)
})

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nDiscovery interrupted by user')
  if (discovery.port && discovery.port.isOpen) {
    discovery.port.close()
  }
  process.exit(0)
})

discovery.run()
