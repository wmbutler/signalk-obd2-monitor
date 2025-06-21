// OBD2 PID definitions with conversion formulas
const pidDefinitions = {
  '04': {
    name: 'Calculated engine load',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '05': {
    name: 'Engine coolant temperature',
    bytes: 1,
    unit: '°C',
    convert: (bytes) => bytes[0] - 40
  },
  '0A': {
    name: 'Fuel pressure',
    bytes: 1,
    unit: 'kPa',
    convert: (bytes) => bytes[0] * 3
  },
  '0B': {
    name: 'Intake manifold absolute pressure',
    bytes: 1,
    unit: 'kPa',
    convert: (bytes) => bytes[0]
  },
  '0C': {
    name: 'Engine speed',
    bytes: 2,
    unit: 'rpm',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 4
  },
  '0E': {
    name: 'Timing advance',
    bytes: 1,
    unit: '°',
    convert: (bytes) => (bytes[0] - 128) / 2
  },
  '0F': {
    name: 'Intake air temperature',
    bytes: 1,
    unit: '°C',
    convert: (bytes) => bytes[0] - 40
  },
  '10': {
    name: 'Mass air flow rate',
    bytes: 2,
    unit: 'g/s',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 100
  },
  '11': {
    name: 'Throttle position',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '1F': {
    name: 'Run time since engine start',
    bytes: 2,
    unit: 'seconds',
    convert: (bytes) => (bytes[0] * 256) + bytes[1]
  },
  '21': {
    name: 'Distance traveled with MIL on',
    bytes: 2,
    unit: 'km',
    convert: (bytes) => (bytes[0] * 256) + bytes[1]
  },
  '22': {
    name: 'Fuel Rail Pressure (relative to manifold vacuum)',
    bytes: 2,
    unit: 'kPa',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) * 0.079
  },
  '23': {
    name: 'Fuel Rail Gauge Pressure',
    bytes: 2,
    unit: 'kPa',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) * 10
  },
  '2C': {
    name: 'Commanded EGR',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '2D': {
    name: 'EGR Error',
    bytes: 1,
    unit: '%',
    convert: (bytes) => (bytes[0] - 128) * 100 / 128
  },
  '2E': {
    name: 'Commanded evaporative purge',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '2F': {
    name: 'Fuel Tank Level Input',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '30': {
    name: 'Warm-ups since codes cleared',
    bytes: 1,
    unit: 'count',
    convert: (bytes) => bytes[0]
  },
  '31': {
    name: 'Distance traveled since codes cleared',
    bytes: 2,
    unit: 'km',
    convert: (bytes) => (bytes[0] * 256) + bytes[1]
  },
  '32': {
    name: 'Evap. System Vapor Pressure',
    bytes: 2,
    unit: 'Pa',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 4
  },
  '33': {
    name: 'Absolute Barometric Pressure',
    bytes: 1,
    unit: 'kPa',
    convert: (bytes) => bytes[0]
  },
  '3C': {
    name: 'Catalyst Temperature: Bank 1, Sensor 1',
    bytes: 2,
    unit: '°C',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 10 - 40
  },
  '3D': {
    name: 'Catalyst Temperature: Bank 2, Sensor 1',
    bytes: 2,
    unit: '°C',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 10 - 40
  },
  '3E': {
    name: 'Catalyst Temperature: Bank 1, Sensor 2',
    bytes: 2,
    unit: '°C',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 10 - 40
  },
  '3F': {
    name: 'Catalyst Temperature: Bank 2, Sensor 2',
    bytes: 2,
    unit: '°C',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 10 - 40
  },
  '42': {
    name: 'Control module voltage',
    bytes: 2,
    unit: 'V',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 1000
  },
  '43': {
    name: 'Absolute load value',
    bytes: 2,
    unit: '%',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) * 100 / 255
  },
  '44': {
    name: 'Commanded Air-Fuel Equivalence Ratio',
    bytes: 2,
    unit: 'ratio',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 32768
  },
  '45': {
    name: 'Relative throttle position',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '46': {
    name: 'Ambient air temperature',
    bytes: 1,
    unit: '°C',
    convert: (bytes) => bytes[0] - 40
  },
  '47': {
    name: 'Absolute throttle position B',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '48': {
    name: 'Absolute throttle position C',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '49': {
    name: 'Accelerator pedal position D',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '4A': {
    name: 'Accelerator pedal position E',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '4B': {
    name: 'Accelerator pedal position F',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '4C': {
    name: 'Commanded throttle actuator',
    bytes: 1,
    unit: '%',
    convert: (bytes) => bytes[0] * 100 / 255
  },
  '4D': {
    name: 'Time run with MIL on',
    bytes: 2,
    unit: 'minutes',
    convert: (bytes) => (bytes[0] * 256) + bytes[1]
  },
  '4E': {
    name: 'Time since trouble codes cleared',
    bytes: 2,
    unit: 'minutes',
    convert: (bytes) => (bytes[0] * 256) + bytes[1]
  },
  '5C': {
    name: 'Engine oil temperature',
    bytes: 1,
    unit: '°C',
    convert: (bytes) => bytes[0] - 40
  },
  '5E': {
    name: 'Engine fuel rate',
    bytes: 2,
    unit: 'L/h',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 20
  },
  '66': {
    name: 'Mass air flow sensor (alternative)',
    bytes: 2,
    unit: 'g/s',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 100
  },
  '9E': {
    name: 'Engine fuel rate (alternative)',
    bytes: 2,
    unit: 'L/h',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 20
  },
  'A2': {
    name: 'Cylinder fuel rate',
    bytes: 2,
    unit: 'mg/stroke',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) / 32
  },
  // Mode 22 PIDs (Manufacturer specific - Hyundai)
  '22:0545': {
    name: 'Fuel consumption (Hyundai)',
    bytes: 2,
    unit: 'L/h',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) * 0.01
  },
  '22:0045': {
    name: 'Fuel consumption (Hyundai alt)',
    bytes: 2,
    unit: 'L/h',
    convert: (bytes) => ((bytes[0] * 256) + bytes[1]) * 0.01
  }
}

module.exports = {
  getPidDefinition: function(pid) {
    return pidDefinitions[pid.toUpperCase()]
  },
  
  getAllPids: function() {
    return Object.keys(pidDefinitions)
  },
  
  getPidsByName: function(searchTerm) {
    const results = []
    for (const [pid, def] of Object.entries(pidDefinitions)) {
      if (def.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        results.push({ pid, ...def })
      }
    }
    return results
  }
}
