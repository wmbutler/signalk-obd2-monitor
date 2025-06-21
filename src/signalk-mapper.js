// Maps OBD2 PIDs to SignalK paths and converts units
const pidToSignalKMap = {
  '04': {
    path: 'propulsion.{instance}.engineLoad',
    unit: 'ratio',
    convert: (value) => value / 100 // Convert % to ratio
  },
  '05': {
    path: 'propulsion.{instance}.coolantTemperature',
    unit: 'K',
    convert: (value) => value + 273.15 // Convert °C to Kelvin
  },
  '0A': {
    path: 'propulsion.{instance}.fuel.pressure',
    unit: 'Pa',
    convert: (value) => value * 1000 // Convert kPa to Pa
  },
  '0B': {
    path: 'propulsion.{instance}.intakeManifoldPressure',
    unit: 'Pa',
    convert: (value) => value * 1000 // Convert kPa to Pa
  },
  '0C': {
    path: 'propulsion.{instance}.revolutions',
    unit: 'Hz',
    convert: (value) => value / 60 // Convert RPM to Hz
  },
  '0E': {
    path: 'propulsion.{instance}.timingAdvance',
    unit: 'rad',
    convert: (value) => value * Math.PI / 180 // Convert degrees to radians
  },
  '0F': {
    path: 'propulsion.{instance}.intakeTemperature',
    unit: 'K',
    convert: (value) => value + 273.15 // Convert °C to Kelvin
  },
  '10': {
    path: 'propulsion.{instance}.massAirFlow',
    unit: 'kg/s',
    convert: (value) => value / 1000 // Convert g/s to kg/s
  },
  '11': {
    path: 'propulsion.{instance}.throttlePosition',
    unit: 'ratio',
    convert: (value) => value / 100 // Convert % to ratio
  },
  '1F': {
    path: 'propulsion.{instance}.runTime',
    unit: 's',
    convert: (value) => value // Already in seconds
  },
  '22': {
    path: 'propulsion.{instance}.fuel.pressureRelative',
    unit: 'Pa',
    convert: (value) => value * 1000 // Convert kPa to Pa
  },
  '23': {
    path: 'propulsion.{instance}.fuel.pressure',
    unit: 'Pa',
    convert: (value) => value * 1000 // Convert kPa to Pa
  },
  '2F': {
    path: 'tanks.fuel.0.currentLevel',
    unit: 'ratio',
    convert: (value) => value / 100 // Convert % to ratio
  },
  '33': {
    path: 'environment.outside.pressure',
    unit: 'Pa',
    convert: (value) => value * 1000 // Convert kPa to Pa
  },
  '42': {
    path: 'electrical.batteries.engine.voltage',
    unit: 'V',
    convert: (value) => value // Already in Volts
  },
  '46': {
    path: 'environment.outside.temperature',
    unit: 'K',
    convert: (value) => value + 273.15 // Convert °C to Kelvin
  },
  '5C': {
    path: 'propulsion.{instance}.oilTemperature',
    unit: 'K',
    convert: (value) => value + 273.15 // Convert °C to Kelvin
  },
  '5E': {
    path: 'propulsion.{instance}.fuel.rate',
    unit: 'm3/s',
    convert: (value) => value * 0.001 / 3600 // Convert L/h to m³/s
  },
  '66': {
    path: 'propulsion.{instance}.massAirFlowAlternative',
    unit: 'kg/s',
    convert: (value) => value / 1000 // Convert g/s to kg/s
  },
  '9E': {
    path: 'propulsion.{instance}.fuel.rate',
    unit: 'm3/s',
    convert: (value) => value * 0.001 / 3600 // Convert L/h to m³/s
  },
  'A2': {
    path: 'propulsion.{instance}.fuel.cylinderRate',
    unit: 'kg/s',
    convert: (value) => value * 0.000001 // Convert mg/stroke to kg/s (approximate)
  },
  // Mode 22 PIDs (Hyundai specific)
  '22:0545': {
    path: 'propulsion.{instance}.fuel.rate',
    unit: 'm3/s',
    convert: (value) => value * 0.001 / 3600 // Convert L/h to m³/s
  },
  '22:0045': {
    path: 'propulsion.{instance}.fuel.rate',
    unit: 'm3/s',
    convert: (value) => value * 0.001 / 3600 // Convert L/h to m³/s
  }
}

module.exports = {
  mapToSignalK: function(pid, value, engineInstance = 'port') {
    const mapping = pidToSignalKMap[pid.toUpperCase()]
    if (!mapping) {
      return null
    }

    // Replace instance placeholder with actual instance
    const path = mapping.path.replace('{instance}', engineInstance)
    
    // Convert value to SignalK units
    const convertedValue = mapping.convert(value)
    
    return {
      path: path,
      value: convertedValue,
      unit: mapping.unit
    }
  },
  
  getSignalKPath: function(pid, engineInstance = 'port') {
    const mapping = pidToSignalKMap[pid.toUpperCase()]
    if (!mapping) {
      return null
    }
    return mapping.path.replace('{instance}', engineInstance)
  },
  
  getAllMappings: function() {
    return pidToSignalKMap
  }
}
