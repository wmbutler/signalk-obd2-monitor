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
          this.buffer += data.toString()
        })
      } catch (error) {
        reject(new Error(`Failed to open serial port: ${error.message}`))
      }
    })
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
    
    // Reset adapter
    await this.sendCommand('ATZ', 3000)
    
    // Get adapter info
    const response = await this.sendCommand('ATI')
    
    if (response.includes('ELM327') || response.includes('STN') || response.includes('OBD')) {
      this.adapterInfo = response.trim().replace(/[\r\n>]/g, ' ').trim()
      this.log(`✓ Adapter detected: ${this.adapterInfo}`, colors.green)
      
      // Configure adapter
      await this.sendCommand('ATE0') // Echo off
      await this.sendCommand('ATH0') // Headers off
      await this.sendCommand('ATSP0') // Auto protocol
      
      return true
    } else {
      throw new Error('No valid OBD2 adapter response')
    }
  }

  async checkEngine() {
    this.log('\nChecking engine status...', colors.cyan)
    
    const response = await this.sendCommand('0100')
    
    if (response.includes('41 00') || response.includes('4100')) {
      this.log('✓ Engine is running and responding', colors.green)
      return true
    } else if (response.includes('NO DATA')) {
      throw new Error('Engine is not running or not responding')
    } else {
      throw new Error(`Unexpected engine response: ${response}`)
    }
  }

  parseResponse(response, pid) {
    // Clean up response
    let cleaned = response.trim().replace(/[\r\n>]/g, ' ').trim()
    
    // Check for valid data response
    if (cleaned.includes('NO DATA') || cleaned.includes('?') || cleaned.includes('UNABLE')) {
      return null
    }
    
    // Handle vLinker FS format with byte count prefix and line numbers
    // Example: "009\r\n0: 41 23 00 47 33 65\r\n1: 42 31 C4 AA AA AA AA"
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
    
    // Look for Mode 01 response (41 XX ...)
    const mode01Match = cleaned.match(/41\s*([0-9A-Fa-f]{2})\s*([0-9A-Fa-f\s]+)/)
    if (mode01Match && mode01Match[1].toUpperCase() === pid) {
      // Extract data bytes
      const dataBytes = mode01Match[2].trim().split(/\s+/)
      return {
        pid: pid,
        dataBytes: dataBytes.length
      }
    }
    
    // Also check without spaces (some adapters return 41XX...)
    const compactMatch = cleaned.match(/41([0-9A-Fa-f]{2})([0-9A-Fa-f]+)/)
    if (compactMatch && compactMatch[1].toUpperCase() === pid) {
      // Count bytes (2 hex chars per byte)
      const dataLength = compactMatch[2].length / 2
      return {
        pid: pid,
        dataBytes: Math.floor(dataLength)
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

  async testPid(pid) {
    const command = '01' + pid
    const response = await this.sendCommand(command, 500) // Shorter timeout for individual PIDs
    
    const result = this.parseResponse(response, pid)
    if (result) {
      const pidDef = PidDefinitions.getPidDefinition(pid)
      const name = pidDef ? pidDef.name : 'Unknown'
      
      this.discoveredPids.push({
        pid: pid,
        name: name,
        dataBytes: result.dataBytes
      })
      
      // Show discovered PID below progress bar
      process.stdout.write('\n')
      this.log(`✓ ${pid} ${name}`, colors.green)
      
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
    
    // Also test some common Mode 22 PIDs if time permits
    this.log('Testing common Mode 22 PIDs...', colors.cyan)
    const commonMode22Pids = ['0545', '0045', '0405', '0445']
    
    for (const pid of commonMode22Pids) {
      const command = '22' + pid
      const response = await this.sendCommand(command, 500)
      
      if (!response.includes('NO DATA') && !response.includes('?')) {
        const fullPid = '22:' + pid
        const pidDef = PidDefinitions.getPidDefinition(fullPid)
        const name = pidDef ? pidDef.name : 'Mode 22 PID'
        
        this.discoveredPids.push({
          pid: fullPid,
          name: name,
          dataBytes: 0 // Mode 22 byte count varies
        })
        
        this.log(`✓ ${fullPid} ${name}`, colors.green)
      }
    }
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
    
    // Check if file exists
    if (fs.existsSync(outputPath)) {
      this.log(`\nFile ${outputPath} already exists.`, colors.yellow)
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      })
      
      readline.question('Overwrite? (y/N): ', (answer) => {
        readline.close()
        if (answer.toLowerCase() === 'y') {
          fs.writeFileSync(outputPath, content)
          this.log(`✓ Profile saved to ${outputPath}`, colors.green)
        } else {
          this.log('Profile not saved.', colors.yellow)
        }
        this.showSummary()
      })
    } else {
      fs.writeFileSync(outputPath, content)
      this.log(`\n✓ Profile saved to ${outputPath}`, colors.green)
      this.showSummary()
    }
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
    this.log('2. Update src/engine-profiles/index.js to include the discovered profile')
    this.log('3. Restart SignalK and select "Unknown > Discovered Profile" in plugin settings')
  }

  async run() {
    try {
      this.log('\nOBD2 PID Discovery Tool', colors.bright + colors.cyan)
      this.log('======================\n', colors.bright + colors.cyan)
      
      await this.connect()
      await this.checkAdapter()
      await this.checkEngine()
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
