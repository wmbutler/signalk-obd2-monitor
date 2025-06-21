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
    app.debug('Starting OBD2 Engine Monitor plugin with options:', options)
    
    // Initialize alarm manager
    alarmManager = new AlarmManager(app, options.alarms)
    
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
      })
      
      obd2Connection.on('disconnected', () => {
        app.debug('OBD2 adapter disconnected')
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

    if (alarmManager) {
      alarmManager.stop()
      alarmManager = null
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

    // Check alarms - DISABLED
    // if (alarmManager) {
    //   alarmManager.checkValue(signalkData.path, signalkData.value, pid)
    // }

    // Track fuel consumption automatically if it's a fuel flow PID
    if (fuelConsumptionTracker && (pid === '5E' || pid === '9E' || pid === 'A2' || pid === '22:0545' || pid === '22:0045')) {
      updateFuelConsumption(signalkData.value, pid)
    }

    // Calculate fuel efficiency automatically if we have the needed data
    calculateFuelEfficiency(pid, signalkData)
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
