# SignalK OBD2 Engine Monitor

A comprehensive SignalK plugin for monitoring marine engines via OBD2 interface with support for fuel flow monitoring, rail pressure tracking, and configurable alarms.

## Features

- **Multi-Engine Support**: Pre-configured profiles for major marine engine manufacturers
- **Real-time Monitoring**: Track critical engine parameters via OBD2
- **Fuel Management**: Monitor fuel flow rate, pressure, and calculate consumption
- **Smart Alarms**: Configurable multi-level alarms for temperature and pressure
- **SignalK Integration**: Full integration with SignalK paths and notifications
- **Auto-Discovery**: Automatic PID discovery for supported engines

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
- **Update Interval**: How often to poll for data (0.5-10 seconds)

### Engine Selection
1. Select your engine manufacturer from the dropdown
2. Select your specific engine model
3. Choose engine instance (port, starboard, main, auxiliary)

### Monitoring Options
- ✅ **Monitor Fuel Flow Rate** - Track real-time fuel consumption
- ✅ **Monitor Fuel Rail Pressure** - Monitor fuel system pressure
- ✅ **Calculate Fuel Consumption** - Track total and average consumption
- ✅ **Calculate Fuel Efficiency** - Calculate fuel per distance metrics

### Alarm Configuration

#### Coolant Temperature
- **Warning**: 85°C (default)
- **Alarm**: 95°C (default)
- **Emergency**: 105°C (default)

#### Fuel Pressure
- **Low Warning**: 300 kPa
- **Low Alarm**: 250 kPa
- **High Warning**: 600 kPa
- **High Alarm**: 700 kPa

#### Oil Temperature
- **Warning**: 110°C
- **Alarm**: 120°C

## Hardware Requirements

- OBD2 to Bluetooth/USB adapter (ELM327 compatible)
- Marine engine with OBD2 diagnostic port
- SignalK server v1.40.0 or higher

## Supported OBD2 Adapters

- ELM327 Bluetooth adapters
- ELM327 USB adapters
- OBDLink MX+ (recommended for reliability)
- Veepeak OBDCheck BLE+

## Troubleshooting

### Connection Issues
1. Ensure OBD2 adapter is properly connected to engine
2. Check serial port permissions: `sudo chmod 666 /dev/ttyUSB0`
3. Verify baud rate matches your adapter (usually 9600)

### No Data Received
1. Check if engine supports standard OBD2 PIDs
2. Try the Generic OBD2 profile first
3. Enable debug logging in SignalK to see raw OBD2 responses

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

### v1.0.0
- Initial release
- Support for 10 major engine manufacturers
- Fuel flow and pressure monitoring
- Configurable alarms for temperature and pressure
- Full SignalK integration
