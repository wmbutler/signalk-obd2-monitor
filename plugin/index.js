const { SerialPort } = require('serialport')
const EngineProfiles = require('../src/engine-profiles/index')
const OBD2Connection = require('../src/obd2-connection')
const SignalKMapper = require('../src/signalk-mapper')
const AlarmManager = require('../src/alarm-manager')

module.exports = function (app) {
  const plugin = {}
  let obd2Connection = null
  let updateInterval = null
  let alarmManager = null
  let fuelConsumptionTracker = null

  plugin.id = 'signalk-obd2-monitor'
  plugin.name = 'OBD2 Engine Monitor'
  plugin.description = 'Monitor marine engines via OBD2 interface with fuel flow, pressure monitoring, and alarms'

  plugin.schema = require('./schema.json')
  plugin.uiSchema = require('./uiSchema.json')

  plugin.start = function (options) {
    app.debug('Starting OBD2 Engine Monitor plugin')
    
    // Initialize alarm manager
    alarmManager = new AlarmManager(app, options.alarms)
    
    // Get engine profile
    const engineProfile = EngineProfiles.getProfile(
      options.engineManufacturer,
      options.engineModel
    )
    
    if (!engineProfile) {
      app.error('Invalid engine profile selected')
      return
    }

    // Initialize fuel consumption tracking if enabled
    if (options.monitoring.calculateFuelConsumption) {
      fuelConsumptionTracker = {
        totalConsumption: 0,
        startTime: Date.now(),
        samples: []
      }
    }

    // Create OBD2 connection
    try {
      obd2Connection = new OBD2Connection({
        port: options.connection.serialPort,
        baudRate: options.connection.baudRate,
        engineProfile: engineProfile,
        enabledPids: getEnabledPids(options, engineProfile),
        logging: options.logging || {}
      })

      obd2Connection.on('data', (pidData) => {
        handleOBD2Data(pidData, options)
      })

      obd2Connection.on('error', (error) => {
        app.error(`OBD2 Connection Error: ${error.message}`)
      })

      obd2Connection.connect()

      // Set up polling interval
      updateInterval = setInterval(() => {
        obd2Connection.requestNextPid()
      }, options.connection.updateInterval * 1000)

    } catch (error) {
      app.error(`Failed to initialize OBD2 connection: ${error.message}`)
      return
    }
  }

  plugin.stop = function () {
    app.debug('Stopping OBD2 Engine Monitor plugin')
    
    if (updateInterval) {
      clearInterval(updateInterval)
      updateInterval = null
    }

    if (obd2Connection) {
      obd2Connection.disconnect()
      obd2Connection = null
    }

    if (alarmManager) {
      alarmManager.stop()
      alarmManager = null
    }
  }

  function getEnabledPids(options, engineProfile) {
    const enabledPids = []
    
    // Always include critical PIDs
    enabledPids.push('0C', '05', '42') // RPM, Coolant Temp, Voltage
    
    // Add fuel monitoring PIDs if enabled
    if (options.monitoring.fuelFlowRate) {
      enabledPids.push('5E')
    }
    if (options.monitoring.fuelPressure) {
      enabledPids.push('23', '22')
    }
    
    // Add other monitored PIDs
    enabledPids.push('5C', '04', '0F', '2F') // Oil temp, load, intake temp, fuel level
    
    // Filter by what the engine actually supports
    return enabledPids.filter(pid => 
      engineProfile.supportedPids.includes(pid)
    )
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

    // Send delta to SignalK
    app.handleMessage(plugin.id, {
      updates: [{
        values: [{
          path: signalkData.path,
          value: signalkData.value
        }]
      }]
    })

    // Check alarms
    if (alarmManager) {
      alarmManager.checkValue(signalkData.path, signalkData.value, pid)
    }

    // Track fuel consumption
    if (options.monitoring.calculateFuelConsumption && pid === '5E') {
      updateFuelConsumption(signalkData.value)
    }

    // Calculate fuel efficiency if enabled
    if (options.monitoring.calculateFuelEfficiency) {
      calculateFuelEfficiency(pid, signalkData)
    }
  }

  function updateFuelConsumption(fuelRate) {
    if (!fuelConsumptionTracker) return
    
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
            value: avgRate
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
            value: fuelConsumptionTracker.totalConsumption
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
