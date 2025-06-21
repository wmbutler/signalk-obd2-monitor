const { SerialPort } = require('serialport');

// Open serial connection
const port = new SerialPort({
    path: '/dev/rfcomm0',
    baudRate: 9600
});

let initialized = false;

// PID discovery commands
const discoveryPids = [
    { pid: '01 00', range: '01-20', description: 'PIDs supported [01-20]' },
    { pid: '01 20', range: '21-40', description: 'PIDs supported [21-40]' },
    { pid: '01 40', range: '41-60', description: 'PIDs supported [41-60]' },
    { pid: '01 60', range: '61-80', description: 'PIDs supported [61-80]' },
    { pid: '01 80', range: '81-A0', description: 'PIDs supported [81-A0]' },
    { pid: '01 A0', range: 'A1-C0', description: 'PIDs supported [A1-C0]' }
];

// Common PID names for reference
const pidNames = {
    '01': 'Monitor status since DTCs cleared',
    '02': 'Freeze frame DTC',
    '03': 'Fuel system status',
    '04': 'Calculated engine load',
    '05': 'Engine coolant temperature',
    '06': 'Short term fuel trim—Bank 1',
    '07': 'Long term fuel trim—Bank 1',
    '08': 'Short term fuel trim—Bank 2',
    '09': 'Long term fuel trim—Bank 2',
    '0A': 'Fuel pressure (gauge pressure)',
    '0B': 'Intake manifold absolute pressure',
    '0C': 'Engine speed',
    '0D': 'Vehicle speed (N/A for marine)',
    '0E': 'Timing advance',
    '0F': 'Intake air temperature',
    '10': 'Mass air flow rate',
    '11': 'Throttle position',
    '12': 'Commanded secondary air status',
    '13': 'Oxygen sensors present',
    '14': 'Oxygen sensor 1',
    '15': 'Oxygen sensor 2',
    '16': 'Oxygen sensor 3',
    '17': 'Oxygen sensor 4',
    '18': 'Oxygen sensor 5',
    '19': 'Oxygen sensor 6',
    '1A': 'Oxygen sensor 7',
    '1B': 'Oxygen sensor 8',
    '1C': 'OBD standards this vehicle conforms to',
    '1D': 'Oxygen sensors present',
    '1E': 'Auxiliary input status',
    '1F': 'Run time since engine start',
    '21': 'Distance traveled with malfunction indicator lamp (MIL) on',
    '22': 'Fuel Rail Pressure (relative to manifold vacuum)',
    '23': 'Fuel Rail Gauge Pressure',
    '24': 'Oxygen sensor 1 (wide range)',
    '25': 'Oxygen sensor 2 (wide range)',
    '26': 'Oxygen sensor 3 (wide range)',
    '27': 'Oxygen sensor 4 (wide range)',
    '28': 'Oxygen sensor 5 (wide range)',
    '29': 'Oxygen sensor 6 (wide range)',
    '2A': 'Oxygen sensor 7 (wide range)',
    '2B': 'Oxygen sensor 8 (wide range)',
    '2C': 'Commanded EGR',
    '2D': 'EGR Error',
    '2E': 'Commanded evaporative purge',
    '2F': 'Fuel Tank Level Input',
    '30': 'Warm-ups since codes cleared',
    '31': 'Distance traveled since codes cleared',
    '32': 'Evap. System Vapor Pressure',
    '33': 'Absolute Barometric Pressure',
    '34': 'Oxygen sensor 1 (wide range)',
    '35': 'Oxygen sensor 2 (wide range)',
    '36': 'Oxygen sensor 3 (wide range)',
    '37': 'Oxygen sensor 4 (wide range)',
    '38': 'Oxygen sensor 5 (wide range)',
    '39': 'Oxygen sensor 6 (wide range)',
    '3A': 'Oxygen sensor 7 (wide range)',
    '3B': 'Oxygen sensor 8 (wide range)',
    '3C': 'Catalyst Temperature: Bank 1, Sensor 1',
    '3D': 'Catalyst Temperature: Bank 2, Sensor 1',
    '3E': 'Catalyst Temperature: Bank 1, Sensor 2',
    '3F': 'Catalyst Temperature: Bank 2, Sensor 2',
    '42': 'Control module voltage',
    '43': 'Absolute load value',
    '44': 'Commanded Air-Fuel Equivalence Ratio',
    '45': 'Relative throttle position',
    '46': 'Ambient air temperature',
    '47': 'Absolute throttle position B',
    '48': 'Absolute throttle position C',
    '49': 'Accelerator pedal position D',
    '4A': 'Accelerator pedal position E',
    '4B': 'Accelerator pedal position F',
    '4C': 'Commanded throttle actuator',
    '4D': 'Time run with MIL on',
    '4E': 'Time since trouble codes cleared',
    '5C': 'Engine oil temperature',
    '5E': 'Engine fuel rate'
};

let currentDiscoveryIndex = 0;
const supportedPids = new Set<string>();

port.on('open', () => {
    console.log('🔌 OBD port opened');
    console.log('🔍 Discovering supported PIDs on Hyundai SeasAll S270...');
    console.log('═'.repeat(60));
    
    // Initialize OBD
    setTimeout(() => port.write('ATZ\r'), 1000);
    setTimeout(() => port.write('ATE0\r'), 3000);
    setTimeout(() => port.write('ATL0\r'), 4000);
    setTimeout(() => { 
        initialized = true;
        console.log('✅ OBD initialized, starting PID discovery...\n');
        discoverNextRange();
    }, 5000);
});

port.on('data', (data) => {
    const response = data.toString().trim();
    
    if (!initialized) {
        console.log('Init response:', response);
        return;
    }
    
    // Skip empty responses and prompts
    if (response === '>' || response === '') return;
    
    console.log(`📡 Raw: ${response}`);
    
    // Check if this is a PID support response
    if (response.includes('41 ')) {
        const currentDiscovery = discoveryPids[currentDiscoveryIndex];
        const expectedResponse = currentDiscovery.pid.replace('01', '41');
        
        if (response.includes(expectedResponse)) {
            // Parse the bitmask
            const hex = response.replace(/\s+/g, '').replace('>', '');
            const bitmaskStart = hex.indexOf(expectedResponse.replace(' ', '')) + 4;
            
            if (bitmaskStart > 3) {
                const bitmaskHex = hex.substring(bitmaskStart, bitmaskStart + 8);
                console.log(`✅ ${currentDiscovery.description}`);
                console.log(`   Bitmask: ${bitmaskHex}`);
                
                // Parse the bitmask to find supported PIDs
                const supportedInRange = parseBitmask(bitmaskHex, currentDiscovery.range);
                supportedInRange.forEach(pid => supportedPids.add(pid));
                console.log(`   Found ${supportedInRange.length} supported PIDs in this range\n`);
            }
        }
    } else if (response.includes('NO DATA') || response.includes('?')) {
        const currentDiscovery = discoveryPids[currentDiscoveryIndex];
        console.log(`❌ ${currentDiscovery.description}: NOT SUPPORTED\n`);
    }
    
    // Move to next discovery range
    setTimeout(() => {
        currentDiscoveryIndex++;
        discoverNextRange();
    }, 1500);
});

function discoverNextRange() {
    if (currentDiscoveryIndex >= discoveryPids.length) {
        // Discovery complete - show all supported PIDs
        showDiscoveryResults();
        return;
    }
    
    const discovery = discoveryPids[currentDiscoveryIndex];
    console.log(`🔍 Checking: ${discovery.description}`);
    port.write(discovery.pid + '\r');
}

function parseBitmask(bitmaskHex: string, range: string): string[] {
    const supported: string[] = [];
    
    if (bitmaskHex.length !== 8) return supported;
    
    // Convert hex to binary
    const bitmask = parseInt(bitmaskHex, 16);
    
    // Determine the starting PID number based on range
    let startPid;
    if (range === '01-20') startPid = 1;
    else if (range === '21-40') startPid = 0x21;
    else if (range === '41-60') startPid = 0x41;
    else if (range === '61-80') startPid = 0x61;
    else if (range === '81-A0') startPid = 0x81;
    else if (range === 'A1-C0') startPid = 0xA1;
    else return supported;
    
    // Check each bit (32 bits total, but we only check relevant range)
    for (let i = 0; i < 32; i++) {
        if (bitmask & (1 << (31 - i))) {
            const pidNum = startPid + i;
            const pidHex = pidNum.toString(16).toUpperCase().padStart(2, '0');
            supported.push(pidHex);
        }
    }
    
    return supported;
}

function showDiscoveryResults() {
    console.log('═'.repeat(60));
    console.log('📊 PID DISCOVERY COMPLETE - HYUNDAI SEASALL S270');
    console.log('═'.repeat(60));
    
    const sortedPids = Array.from(supportedPids).sort();
    
    console.log(`\n✅ TOTAL SUPPORTED PIDS: ${sortedPids.length}`);
    console.log('\n📋 DETAILED LIST:');
    
    sortedPids.forEach(pidHex => {
        const pidName = pidNames[pidHex] || 'Unknown PID';
        console.log(`   • PID ${pidHex}: ${pidName}`);
    });
    
    console.log('\n🎯 MARINE ENGINE RELEVANT PIDs:');
    const marineRelevant = sortedPids.filter(pid => {
        const name = pidNames[pid] || '';
        return name.includes('engine') || 
               name.includes('coolant') || 
               name.includes('oil') || 
               name.includes('fuel') || 
               name.includes('load') || 
               name.includes('pressure') || 
               name.includes('temperature') ||
               pid === '0C' || // RPM
               pid === '42' || // Voltage
               pid === '5E';   // Fuel rate
    });
    
    marineRelevant.forEach(pidHex => {
        const pidName = pidNames[pidHex] || 'Unknown PID';
        console.log(`   🚢 PID ${pidHex}: ${pidName}`);
    });
    
    console.log(`\n💡 Use these PIDs for your marine monitoring system!`);
}

port.on('error', (err) => {
    console.log('❌ Error:', err);
});
