// Auto-generated engine profile from PID discovery
// This file will be overwritten by the discover-pids.js tool
// To preserve a discovered profile, rename this file

module.exports = {
  'discovered-sample': {
    manufacturer: 'Unknown',
    model: 'Sample Discovered Profile',
    supportedPids: [
      '04', // Engine Load
      '05', // Coolant Temperature
      '0C', // RPM
      '0D', // Vehicle Speed
      '0F', // Intake Air Temperature
      '11', // Throttle Position
      '1F', // Run Time Since Engine Start
      '2F', // Fuel Level
      '33', // Barometric Pressure
      '42', // Control Module Voltage
      '46', // Ambient Air Temperature
      '5C', // Engine Oil Temperature
    ],
    discoveryMetadata: {
      discoveredAt: '2025-06-22T00:00:00.000Z',
      adapterInfo: 'Sample adapter info',
      totalPidsTested: 256,
      successfulPids: 12,
      discoveryDuration: '120 seconds',
      note: 'This is a sample file. Run discover-pids.js to generate real data.'
    }
  }
}
