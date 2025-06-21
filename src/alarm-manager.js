class AlarmManager {
  constructor(app, alarmConfig) {
    this.app = app
    this.alarmConfig = alarmConfig || {}
    this.alarmStates = {}
  }

  checkValue(path, value, pid) {
    // Determine which alarm to check based on the path
    if (path.includes('coolantTemperature')) {
      this.checkCoolantTemperature(path, value)
    } else if (path.includes('fuel.pressure')) {
      this.checkFuelPressure(path, value, pid)
    } else if (path.includes('oilTemperature')) {
      this.checkOilTemperature(path, value)
    }
  }

  checkCoolantTemperature(path, kelvinValue) {
    const config = this.alarmConfig.coolantTemperature
    if (!config || !config.enabled) return

    // Convert from Kelvin to Celsius for comparison
    const celsiusValue = kelvinValue - 273.15
    const alarmPath = path.replace(/propulsion\.[^.]+\.coolantTemperature/, 'notifications.$1.coolantTemperature')

    let state = 'normal'
    let message = ''

    if (celsiusValue >= config.emergency) {
      state = 'emergency'
      message = `Engine coolant temperature critical: ${celsiusValue.toFixed(1)}°C (limit: ${config.emergency}°C)`
    } else if (celsiusValue >= config.alarm) {
      state = 'alarm'
      message = `Engine coolant temperature high: ${celsiusValue.toFixed(1)}°C (limit: ${config.alarm}°C)`
    } else if (celsiusValue >= config.warning) {
      state = 'warn'
      message = `Engine coolant temperature warning: ${celsiusValue.toFixed(1)}°C (limit: ${config.warning}°C)`
    }

    this.sendNotification(alarmPath, state, message)
  }

  checkFuelPressure(path, pascalValue, pid) {
    const config = this.alarmConfig.fuelPressure
    if (!config || !config.enabled) return

    // Convert from Pascal to kPa for comparison
    const kPaValue = pascalValue / 1000
    const alarmPath = path.replace(/propulsion\.[^.]+\.fuel\.pressure/, 'notifications.$1.fuelPressure')

    let state = 'normal'
    let message = ''

    // Check high pressure alarms
    if (kPaValue >= config.highAlarm) {
      state = 'alarm'
      message = `Fuel pressure too high: ${kPaValue.toFixed(0)} kPa (limit: ${config.highAlarm} kPa)`
    } else if (kPaValue >= config.highWarning) {
      state = 'warn'
      message = `Fuel pressure high warning: ${kPaValue.toFixed(0)} kPa (limit: ${config.highWarning} kPa)`
    }
    // Check low pressure alarms
    else if (kPaValue <= config.lowAlarm) {
      state = 'alarm'
      message = `Fuel pressure too low: ${kPaValue.toFixed(0)} kPa (limit: ${config.lowAlarm} kPa)`
    } else if (kPaValue <= config.lowWarning) {
      state = 'warn'
      message = `Fuel pressure low warning: ${kPaValue.toFixed(0)} kPa (limit: ${config.lowWarning} kPa)`
    }

    this.sendNotification(alarmPath, state, message)
  }

  checkOilTemperature(path, kelvinValue) {
    const config = this.alarmConfig.oilTemperature
    if (!config || !config.enabled) return

    // Convert from Kelvin to Celsius for comparison
    const celsiusValue = kelvinValue - 273.15
    const alarmPath = path.replace(/propulsion\.[^.]+\.oilTemperature/, 'notifications.$1.oilTemperature')

    let state = 'normal'
    let message = ''

    if (celsiusValue >= config.alarm) {
      state = 'alarm'
      message = `Engine oil temperature high: ${celsiusValue.toFixed(1)}°C (limit: ${config.alarm}°C)`
    } else if (celsiusValue >= config.warning) {
      state = 'warn'
      message = `Engine oil temperature warning: ${celsiusValue.toFixed(1)}°C (limit: ${config.warning}°C)`
    }

    this.sendNotification(alarmPath, state, message)
  }

  sendNotification(path, state, message) {
    // Extract the notification path correctly
    const match = path.match(/notifications\.(.+?)\.(.+)/)
    if (!match) return

    const engineInstance = match[1]
    const alarmType = match[2]
    const notificationPath = `notifications.propulsion.${engineInstance}.${alarmType}`

    // Check if state has changed
    const previousState = this.alarmStates[notificationPath]
    if (previousState === state && state === 'normal') {
      // Don't repeatedly send normal state
      return
    }

    this.alarmStates[notificationPath] = state

    if (state === 'normal') {
      // Clear the notification
      this.app.handleMessage('signalk-obd2-monitor', {
        updates: [{
          values: [{
            path: notificationPath,
            value: null
          }]
        }]
      })
    } else {
      // Send the notification
      const notification = {
        state: state,
        method: state === 'emergency' ? ['visual', 'sound'] : ['visual'],
        message: message,
        timestamp: new Date().toISOString()
      }

      this.app.handleMessage('signalk-obd2-monitor', {
        updates: [{
          values: [{
            path: notificationPath,
            value: notification
          }]
        }]
      })

      // Log the alarm
      this.app.debug(`Alarm triggered: ${notificationPath} - ${state} - ${message}`)
    }
  }

  stop() {
    // Clear all active notifications when stopping
    for (const path in this.alarmStates) {
      if (this.alarmStates[path] !== 'normal') {
        this.app.handleMessage('signalk-obd2-monitor', {
          updates: [{
            values: [{
              path: path,
              value: null
            }]
          }]
        })
      }
    }
    this.alarmStates = {}
  }
}

module.exports = AlarmManager
