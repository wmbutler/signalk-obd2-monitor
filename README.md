# SignalK OBD2 Engine Monitor

A comprehensive SignalK plugin for monitoring marine engines via OBD2 interface with support for fuel flow monitoring and rail pressure tracking.

## Features

- **Multi-Engine Support**: Pre-configured profiles for major marine engine manufacturers
- **Profile-Based Monitoring**: Each engine profile defines exactly which parameters to monitor
- **Real-time Monitoring**: Track critical engine parameters via OBD2
- **Automatic Fuel Tracking**: Fuel consumption calculated when engine supports fuel flow
- **SignalK Integration**: Full integration with SignalK paths and notifications
- **Batch Querying**: Request multiple PIDs in a single query for faster updates
- **Continuous Mode**: Automatic continuous querying without delays between values
- **Fault Tolerant**: Continues monitoring even when engine is off, automatically resumes when engine starts
- **Connection State Management**: Distinguishes between engine off and adapter disconnected states

## Supported Engine Manufacturers

- **Generic OBD2** - Standard OBD2 PIDs
- **Hyundai** - SeasAll S270, S250, R200
- **Yanmar** - 4JH, 6LY, 8LV Series
- **Volvo Penta** - D2-75, D4-300, D6-400
- **Mercury** - Verado 350, Diesel TDI 4.2
- **Caterpillar** - C7, C12, C18 Marine
- **Cummins** - QSB 6.7, QSC 8.3, QSL 9
- **John Deere** - PowerTech 4045, 6068, 6090
- **MAN** - i6-730, i6-800, V8-1000
- **MTU** - Series 2000, 4000

## Monitored Parameters

### Engine Performance
- Engine RPM (`propulsion.*.revolutions`)
- Engine Load (`propulsion.*.engineLoad`)
- Throttle Position (`propulsion.*.throttlePosition`)
- Run Time (`propulsion.*.runTime`)

### Temperatures
- Coolant Temperature (`propulsion.*.coolantTemperature`)
- Oil Temperature (`propulsion.*.oilTemperature`)
- Intake Air Temperature (`propulsion.*.intakeTemperature`)
- Ambient Temperature (`environment.outside.temperature`)

### Fuel System
- Fuel Flow Rate (`propulsion.*.fuel.rate`)
- Fuel Rail Pressure (`propulsion.*.fuel.pressure`)
- Fuel Level (`tanks.fuel.*.currentLevel`)
- Total Consumption (`propulsion.*.fuel.totalConsumption`)
- Average Consumption (`propulsion.*.fuel.averageRate`)

### Electrical & Other
- Battery Voltage (`electrical.batteries.engine.voltage`)
- Barometric Pressure (`environment.outside.pressure`)
- Intake Manifold Pressure (`propulsion.*.intakeManifoldPressure`)

## Installation

1. Install the plugin through the SignalK Appstore or manually:
   ```bash
   cd /path/to/signalk-server-node/node_modules
   git clone https://github.com/yourusername/signalk-obd2-monitor.git
   cd signalk-obd2-monitor
   npm install
   ```

2. Restart SignalK server

3. Configure the plugin through the SignalK Plugin Config interface

## Configuration

### Connection Settings
- **Serial Port**: Select your OBD2 adapter port (e.g., `/dev/rfcomm0`, `/dev/ttyUSB0`)
- **Baud Rate**: Usually 9600 for most OBD2 adapters
- **Batch Mode**: Enable to request multiple PIDs at once (recommended)
- **Max Batch Size**: Number of PIDs per batch (1-6, default 6)

### Engine Selection
1. Select your engine manufacturer from the dropdown
2. Select your specific engine model
3. Choose engine instance (port, starboard, main, auxiliary)

The plugin will automatically query all PIDs supported by your selected engine profile. Each engine profile defines which parameters are available for that specific engine model. Fuel consumption tracking is automatically enabled if the engine supports fuel flow rate (PID 5E).

### Debug Logging

The plugin uses SignalK's built-in logging system. To enable debug logging:

1. In the SignalK admin interface, go to Server → Settings
2. Enable "Debug" mode
3. Restart the SignalK server

When debug mode is enabled, the plugin will log:
- All OBD2 commands sent and responses received
- Connection status and initialization steps
- PID data processing and conversions
- Special tracking for RPM queries (PID 0C)
- Error messages and troubleshooting information

Debug logs can be viewed in:
- SignalK Data Browser (Server → Data Browser)
- Server logs (typically in `~/.signalk/logs/`)
- Console output if running SignalK in development mode

## Hardware Requirements

- OBD2 to Bluetooth/USB adapter (ELM327 compatible)
- Marine engine with OBD2 diagnostic port
- SignalK server v1.40.0 or higher

## Supported OBD2 Adapters

- ELM327 Bluetooth adapters
- ELM327 USB adapters
- OBDLink MX+ (recommended for reliability)
- Veepeak OBDCheck BLE+

## Connection States

The plugin monitors and reports the connection state through SignalK paths:

### Connection States
- **`disconnected`** - No communication with OBD2 adapter
  - Serial port closed or errored
  - Adapter unplugged or powered off
  - Wrong serial port selected
  
- **`connecting`** - Serial port opened, initializing connection
  
- **`initializing`** - Sending OBD2 initialization commands
  
- **`active`** - Normal operation, receiving engine data
  - Engine is running
  - All PIDs responding normally
  
- **`probing`** - Engine appears to be off
  - Adapter is connected and responding
  - Engine PIDs return "NO DATA"
  - Polls every 2 seconds for quick recovery
  - Automatically resumes when engine starts

### SignalK Paths
- `obd2.connection.state` - Current connection state
- `obd2.connection.lastDataTime` - Timestamp of last successful data
- `obd2.connection.consecutiveFailures` - Number of failed requests

### Notifications
- `notifications.obd2.engineOff` - Engine appears to be off (normal state)
- `notifications.obd2.disconnected` - Adapter disconnected (alert state)

## Troubleshooting

### Connection Issues
1. Ensure OBD2 adapter is properly connected to engine
2. Check serial port permissions: `sudo chmod 666 /dev/ttyUSB0`
3. Verify baud rate matches your adapter (usually 9600)

### No Data Received
1. Check if engine supports standard OBD2 PIDs
2. Try the Generic OBD2 profile first
3. Enable debug mode in SignalK to see raw OBD2 responses
4. Check the SignalK Data Browser for:
   - Connection state at `obd2.connection.state`
   - Error messages in notifications
   - Last successful data timestamp

### Bluetooth Connection (Linux)
```bash
# Pair your OBD2 adapter
bluetoothctl
> scan on
> pair XX:XX:XX:XX:XX:XX
> trust XX:XX:XX:XX:XX:XX

# Create serial port
sudo rfcomm bind 0 XX:XX:XX:XX:XX:XX
```

## Development

### Adding Custom Engine Profiles

Edit `src/engine-profiles.js` to add new engine profiles:

```javascript
'YourManufacturer': {
  'your-model': {
    manufacturer: 'YourManufacturer',
    model: 'Your Model',
    supportedPids: ['04', '05', '0C', ...],
    customMappings: {
      // Optional custom PID conversions
    }
  }
}
```

### Custom PID Mappings

Add custom PIDs in `src/pid-definitions.js`:

```javascript
'XX': {
  name: 'Custom Parameter',
  bytes: 2,
  unit: 'unit',
  convert: (bytes) => /* conversion formula */
}
```

## Contributing

Contributions are welcome! Please submit pull requests with:
- New engine profiles
- Additional PID definitions
- Bug fixes and improvements

## License

MIT License - see LICENSE file for details

## Support

- Create an issue on [GitHub](https://github.com/yourusername/signalk-obd2-monitor/issues)
- SignalK Slack channel: #obd2-monitor

## Changelog

### v1.4.0
- Added fault-tolerant connection management
- Implemented two-stage verification (adapter check, then engine check)
- Added new connection states: adapter_check, engine_check, engine_off
- Improved status reporting with color-coded plugin status in SignalK dashboard
- Distinguished between "engine off" and "adapter disconnected" states
- Added probe mode that checks adapter connectivity every 2 seconds
- Added connection status reporting via SignalK paths
- Added notifications for engine off and adapter disconnected states
- Improved error handling and automatic reconnection
- Better initialization timing to prevent timeouts
- Removed deprecated `updateInterval` configuration option
- Added configuration validation with debug messages for invalid schemas
- Backward compatible with existing configurations containing deprecated fields
- **Fixed**: Plugin stops sending updates when disconnected (SignalK retains last values)
- **Fixed**: Automatic reconnection when serial port closes (e.g., Bluetooth adapter powered off)
- **Fixed**: Continuous reconnection attempts every 5 seconds when adapter is unavailable

### v1.3.0
- Removed monitoring options - now uses only PIDs defined in engine profiles
- Simplified configuration by removing PID discovery
- Each engine profile now has complete control over monitored parameters
- Automatic fuel consumption tracking when PID 5E is supported

### v1.2.0
- Added batch querying for multiple PIDs in single request
- Implemented continuous mode for zero-delay updates
- Removed interval-based polling in favor of continuous querying
- Significantly improved data update speed
- Switched to SignalK's built-in logging system
- Enhanced debug output for troubleshooting

### v1.1.0
- Added comprehensive logging system with automatic rotation
- Special logging for RPM queries with error tracking
- Configurable log levels and raw data inclusion

### v1.0.0
- Initial release
- Support for 10 major engine manufacturers
- Fuel flow and pressure monitoring
- Full SignalK integration
