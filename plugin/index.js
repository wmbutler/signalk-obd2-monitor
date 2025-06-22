const { SerialPort } = require('serialport')
const EngineProfiles = require('../src/engine-profiles/index')
const OBD2Connection = require('../src/obd2-connection')
const SignalKMapper = require('../src/signalk-mapper')
module.exports = function (app) {
  const plugin = {}
  let obd2Connection = null
  let updateInterval = null
  let fuelConsumptionTracker = null

  plugin.id = 'signalk-obd2-monitor'
  plugin.name = 'OBD2 Engine Monitor'
  plugin.description = 'Monitor marine engines via OBD2 interface with fuel flow and pressure monitoring'

  plugin.schema = require('./schema.json')
  plugin.uiSchema = require('./uiSchema.json')

  plugin.start = function (options) {
    app.debug('Starting OBD2 Engine Monitor plugin with options:', options)
    
    // Validate configuration
    const validationResult = validateConfiguration(options)
    if (!validationResult.valid) {
      app.error('Invalid plugin configuration:', validationResult.errors)
      return
    }
    
    // Get engine profile
    const engineProfile = EngineProfiles.getProfile(
      options.engineManufacturer,
      options.engineModel
    )
    
    if (!engineProfile) {
      app.error('Invalid engine profile selected', {
        manufacturer: options.engineManufacturer,
        model: options.engineModel
      })
      return
    }
    
    app.debug('Engine profile loaded', {
      manufacturer: engineProfile.manufacturer,
      model: engineProfile.model,
      supportedPids: engineProfile.supportedPids
    })

    // Initialize fuel consumption tracking if any fuel flow PID is supported
    const fuelFlowPids = ['5E', '9E', 'A2', '22:0545', '22:0045']
    const supportedFuelPid = fuelFlowPids.find(pid => engineProfile.supportedPids.includes(pid))
    
    if (supportedFuelPid) {
      fuelConsumptionTracker = {
        totalConsumption: 0,
        startTime: Date.now(),
        samples: [],
        fuelPid: supportedFuelPid
      }
      app.debug(`Fuel consumption tracking enabled (PID ${supportedFuelPid} supported)`)
    }

    // Create OBD2 connection
    try {
      obd2Connection = new OBD2Connection({
        app: app,
        port: options.connection.serialPort,
        baudRate: options.connection.baudRate,
        engineProfile: engineProfile,
        enabledPids: getEnabledPids(options, engineProfile),
        batchMode: options.connection.batchMode !== false,
        maxBatchSize: options.connection.maxBatchSize || 6,
        continuousMode: true
      })

      obd2Connection.on('data', (pidData) => {
        app.debug('Received PID data', pidData)
        handleOBD2Data(pidData, options)
      })

      obd2Connection.on('error', (error) => {
        app.error('OBD2 Connection Error', {
          message: error.message,
          stack: error.stack
        })
      })
      
      obd2Connection.on('connected', () => {
        app.debug('OBD2 adapter connected')
        app.setPluginStatus('Connecting to adapter...')
      })
      
      obd2Connection.on('disconnected', () => {
        app.debug('OBD2 adapter disconnected')
        app.setPluginError('Adapter disconnected')
        // Don't send any updates when disconnected - SignalK will retain last values
      })
      
      obd2Connection.on('stateChange', (change) => {
        app.debug('Connection state changed', change)
        reportConnectionStatus(change.newState)
      })
      
      obd2Connection.on('adapterVerified', (info) => {
        app.debug('Adapter verified:', info)
        app.setPluginStatus('Adapter connected - Checking engine...')
      })
      
      obd2Connection.on('adapterError', (error) => {
        app.error('Adapter error:', error)
        app.setPluginError(`Adapter not detected: ${error}`)
      })
      
      obd2Connection.on('engineVerified', () => {
        app.debug('Engine communication verified')
        app.setPluginStatus('Engine online - Initializing...')
      })
      
      obd2Connection.on('engineOff', (message) => {
        app.debug('Engine off:', message)
        app.setPluginStatus('Adapter connected - Engine off')
      })
      
      obd2Connection.on('engineError', (error) => {
        app.error('Engine error:', error)
        app.setPluginError(`Engine communication error: ${error}`)
      })

      obd2Connection.connect()

      // Start continuous querying after initialization
      obd2Connection.on('initialized', () => {
        app.debug('OBD2 initialized, starting continuous queries')
        obd2Connection.requestNextPid()
      })

    } catch (error) {
      app.error(`Failed to initialize OBD2 connection: ${error.message}`)
      return
    }
  }

  plugin.stop = function () {
    app.debug('Stopping OBD2 Engine Monitor plugin')

    if (obd2Connection) {
      obd2Connection.disconnect()
      obd2Connection = null
    }

  }

  function getEnabledPids(options, engineProfile) {
    // Simply return all PIDs supported by the engine profile
    app.debug('Using engine profile PIDs', {
      engineProfile: `${engineProfile.manufacturer} ${engineProfile.model}`,
      pids: engineProfile.supportedPids
    })
    
    return engineProfile.supportedPids
  }

  function handleOBD2Data(pidData, options) {
    const { pid, value, unit } = pidData
    
    // Map to SignalK path
    const signalkData = SignalKMapper.mapToSignalK(
      pid, 
      value, 
      options.engineInstance || 'port'
    )
    
    if (!signalkData) {
      app.debug(`No SignalK mapping for PID ${pid}`)
      return
    }
    
    app.debug('Sending SignalK delta', {
      pid,
      path: signalkData.path,
      value: signalkData.value,
      unit: signalkData.unit
    })

    // Send delta to SignalK
    app.handleMessage(plugin.id, {
      updates: [{
        values: [{
          path: signalkData.path,
          value: signalkData.value,
          meta: {
            units: signalkData.unit
          }
        }]
      }]
    })

    // Track fuel consumption automatically if it's a fuel flow PID
    if (fuelConsumptionTracker && (pid === '5E' || pid === '9E' || pid === 'A2' || pid === '22:0545' || pid === '22:0045')) {
      updateFuelConsumption(signalkData.value, pid)
    }

    // Calculate fuel efficiency automatically if we have the needed data
    calculateFuelEfficiency(pid, signalkData)
  }
  
  function validateConfiguration(options) {
    const errors = []
    
    // Check for required fields
    if (!options.connection) {
      errors.push('Missing required field: connection')
    } else {
      if (!options.connection.serialPort) {
        errors.push('Missing required field: connection.serialPort')
      }
      
      // Check for deprecated fields
      if (options.connection.updateInterval !== undefined) {
        app.debug('Ignoring deprecated updateInterval setting - plugin now uses continuous mode')
      }
    }
    
    if (!options.engineManufacturer) {
      errors.push('Missing required field: engineManufacturer')
    }
    
    if (!options.engineModel) {
      errors.push('Missing required field: engineModel')
    }
    
    // Validate engine profile exists
    if (options.engineManufacturer && options.engineModel) {
      const profile = EngineProfiles.getProfile(options.engineManufacturer, options.engineModel)
      if (!profile) {
        errors.push(`Invalid engine profile: ${options.engineManufacturer} - ${options.engineModel}`)
      }
    }
    
    // Check for unknown fields in connection
    if (options.connection) {
      const validConnectionFields = ['serialPort', 'baudRate', 'batchMode', 'maxBatchSize']
      Object.keys(options.connection).forEach(field => {
        if (!validConnectionFields.includes(field) && field !== 'updateInterval') {
          app.debug(`Unknown connection field ignored: ${field}`)
        }
      })
    }
    
    // Validate batch size if specified
    if (options.connection && options.connection.maxBatchSize) {
      if (options.connection.maxBatchSize < 1 || options.connection.maxBatchSize > 6) {
        errors.push('maxBatchSize must be between 1 and 6')
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
  
  function reportConnectionStatus(state) {
    // Report connection status to SignalK
    const statusPath = 'obd2.connection.state'
    const status = obd2Connection.getConnectionStatus()
    
    app.handleMessage(plugin.id, {
      updates: [{
        values: [
          {
            path: statusPath,
            value: state
          },
          {
            path: 'obd2.connection.lastDataTime',
            value: status.lastSuccessfulData ? status.lastSuccessfulData.toISOString() : null
          },
          {
            path: 'obd2.connection.consecutiveFailures',
            value: status.consecutiveFailures
          }
        ]
      }]
    })
    
    // Update plugin status based on state
    switch (state) {
      case 'disconnected':
        app.setPluginError('Adapter not detected - Check serial port connection')
        app.handleMessage(plugin.id, {
          updates: [{
            values: [{
              path: 'notifications.obd2.disconnected',
              value: {
                state: 'alert',
                method: ['visual', 'sound'],
                message: 'OBD2 adapter disconnected - check connection'
              }
            }]
          }]
        })
        break
        
      case 'connecting':
        app.setPluginStatus('Connecting to adapter...')
        break
        
      case 'adapter_check':
        app.setPluginStatus('Verifying adapter...')
        break
        
      case 'engine_check':
        app.setPluginStatus('Checking engine communication...')
        break
        
      case 'initializing':
        app.setPluginStatus('Initializing OBD2 connection...')
        break
        
      case 'active':
        app.setPluginStatus('Engine online - Monitoring active')
        // Clear notifications
        app.handleMessage(plugin.id, {
          updates: [{
            values: [
              {
                path: 'notifications.obd2.engineOff',
                value: null
              },
              {
                path: 'notifications.obd2.disconnected',
                value: null
              }
            ]
          }]
        })
        break
        
      case 'probing':
        app.setPluginStatus('Adapter connected - Engine off (probing)')
        app.handleMessage(plugin.id, {
          updates: [{
            values: [{
              path: 'notifications.obd2.engineOff',
              value: {
                state: 'normal',
                method: ['visual'],
                message: 'Engine appears to be off - OBD2 adapter is connected but not receiving engine data'
              }
            }]
          }]
        })
        break
        
      case 'engine_off':
        app.setPluginStatus('Adapter connected - Engine off')
        app.handleMessage(plugin.id, {
          updates: [{
            values: [{
              path: 'notifications.obd2.engineOff',
              value: {
                state: 'normal',
                method: ['visual'],
                message: 'Engine is off - Start engine to begin monitoring'
              }
            }]
          }]
        })
        break
    }
  }

  function updateFuelConsumption(fuelRate, pid) {
    if (!fuelConsumptionTracker) return
    
    // Convert cylinder fuel rate (A2) to engine fuel rate if needed
    if (pid === 'A2') {
      // This is mg/stroke - need to convert to L/h
      // This is a rough approximation and may need engine-specific adjustment
      const rpm = 2000 // Would need actual RPM from recent data
      const cylinders = 4 // Would need actual cylinder count
      fuelRate = (fuelRate * rpm * cylinders * 60) / (2 * 1000000) // Convert to L/h
    }
    
    // Mode 22 PIDs already provide L/h, but SignalK expects m³/s
    // The conversion is handled in the SignalK mapper
    
    const now = Date.now()
    fuelConsumptionTracker.samples.push({
      time: now,
      rate: fuelRate
    })
    
    // Keep only last 5 minutes of samples
    const fiveMinutesAgo = now - (5 * 60 * 1000)
    fuelConsumptionTracker.samples = fuelConsumptionTracker.samples.filter(
      sample => sample.time > fiveMinutesAgo
    )
    
    // Calculate average rate
    if (fuelConsumptionTracker.samples.length > 0) {
      const avgRate = fuelConsumptionTracker.samples.reduce(
        (sum, sample) => sum + sample.rate, 0
      ) / fuelConsumptionTracker.samples.length
      
      // Send average consumption
      app.handleMessage(plugin.id, {
        updates: [{
          values: [{
            path: `propulsion.${options.engineInstance || 'port'}.fuel.averageRate`,
            value: avgRate,
            meta: {
              units: 'm3/s'
            }
          }]
        }]
      })
    }
    
    // Update total consumption (integrate over time)
    if (fuelConsumptionTracker.lastUpdate) {
      const timeDelta = (now - fuelConsumptionTracker.lastUpdate) / 1000 // seconds
      fuelConsumptionTracker.totalConsumption += fuelRate * timeDelta
      
      app.handleMessage(plugin.id, {
        updates: [{
          values: [{
            path: `propulsion.${options.engineInstance || 'port'}.fuel.totalConsumption`,
            value: fuelConsumptionTracker.totalConsumption,
            meta: {
              units: 'm3'
            }
          }]
        }]
      })
    }
    
    fuelConsumptionTracker.lastUpdate = now
  }

  function calculateFuelEfficiency(pid, signalkData) {
    // This would calculate fuel efficiency based on speed and fuel rate
    // Implementation depends on having both speed and fuel rate data
    // Left as a framework for future enhancement
  }

  return plugin
}
