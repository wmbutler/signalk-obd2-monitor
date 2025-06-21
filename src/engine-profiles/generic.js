// Generic OBD2 engine profile
module.exports = {
  manufacturer: 'Generic OBD2',
  models: {
    'standard': {
      model: 'Standard OBD2 PIDs',
      supportedPids: [
        '04', // Calculated engine load
        '05', // Engine coolant temperature
        '0C', // Engine RPM
        '0F', // Intake air temperature
        '10', // MAF air flow rate
        '11', // Throttle position
        '1F', // Run time since engine start
        '2F', // Fuel Tank Level Input
        '33', // Absolute Barometric Pressure
        '42', // Control module voltage
        '46', // Ambient air temperature
        '5C', // Engine oil temperature
        '5E'  // Engine fuel rate
      ],
      customMappings: {}
    }
  }
}
