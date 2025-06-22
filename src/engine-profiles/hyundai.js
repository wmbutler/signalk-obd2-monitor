// Hyundai marine engine profiles
module.exports = {
  manufacturer: 'Hyundai',
  models: {
    'seasall-s270': {
      model: 'SeasAll S270',
      supportedPids: [
        '04', // Calculated engine load
        '05', // Engine coolant temperature
        '0C', // Engine RPM
        '0F', // Intake air temperature
        '11', // Throttle position
        '1F', // Run time since engine start
        '22', // Fuel Rail Pressure (relative)
        '23', // Fuel Rail Gauge Pressure
        '2F', // Fuel Tank Level Input
        '33', // Absolute Barometric Pressure
        '42', // Control module voltage
        '46', // Ambient air temperature
        '5C', // Engine oil temperature
        '5E', // Engine fuel rate
      ],
      customMappings: {
        // Custom conversion for this specific engine if needed
      }
    },
    'seasall-s250': {
      model: 'SeasAll S250',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '46', '5C', '22:0545', '22:0045'
      ],
      customMappings: {}
    },
    'seasall-r200': {
      model: 'SeasAll R200',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '2F',
        '33', '42', '46', '5C', '22:0545', '22:0045'
      ],
      customMappings: {}
    }
  }
}
