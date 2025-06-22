// Engine profiles aggregator
// This module loads all manufacturer profiles and provides a unified interface

// Try to load discovered profile if it exists
let discoveredProfile = {}
try {
  discoveredProfile = require('./discovered')
} catch (e) {
  // Discovered profile doesn't exist yet, that's ok
}

const profiles = {
  'Generic OBD2': require('./generic').models,
  'Hyundai': require('./hyundai').models,
  'Yanmar': require('./yanmar').models,
  'Volvo Penta': require('./volvo-penta').models,
  'Mercury': require('./mercury').models,
  'Caterpillar': require('./caterpillar').models,
  'Cummins': require('./cummins').models,
  'John Deere': require('./john-deere').models,
  'MAN': require('./man').models,
  'MTU': require('./mtu').models,
  'Unknown': discoveredProfile
}

module.exports = {
  /**
   * Get a specific engine profile
   * @param {string} manufacturer - The engine manufacturer
   * @param {string} model - The engine model (can be in format "manufacturer-model")
   * @returns {Object} The engine profile with manufacturer and model info
   */
  getProfile: function(manufacturer, model) {
    // Handle new flat format (e.g., "hyundai-seasall-s270")
    if (model && model.includes('-')) {
      // Map flat manufacturer prefixes to full names
      const manufacturerMap = {
        'generic': 'Generic OBD2',
        'hyundai': 'Hyundai',
        'yanmar': 'Yanmar',
        'volvo-penta': 'Volvo Penta',
        'mercury': 'Mercury',
        'caterpillar': 'Caterpillar',
        'cummins': 'Cummins',
        'john-deere': 'John Deere',
        'man': 'MAN',
        'mtu': 'MTU',
        'unknown': 'Unknown',
        'discovered': 'Unknown'
      }
      
      // Find which manufacturer prefix matches
      let fullManufacturer = null
      let flatModel = null
      
      for (const [prefix, fullName] of Object.entries(manufacturerMap)) {
        if (model.startsWith(prefix + '-')) {
          fullManufacturer = fullName
          flatModel = model.substring(prefix.length + 1)
          break
        }
      }
      
      if (!fullManufacturer) {
        fullManufacturer = manufacturer
      }
      
      // Try to find the profile with the parsed values
      if (profiles[fullManufacturer] && profiles[fullManufacturer][flatModel]) {
        return {
          manufacturer: fullManufacturer,
          model: profiles[fullManufacturer][flatModel].model,
          supportedPids: profiles[fullManufacturer][flatModel].supportedPids,
          customMappings: profiles[fullManufacturer][flatModel].customMappings || {}
        }
      }
    }
    
    // Original logic for backward compatibility
    if (profiles[manufacturer] && profiles[manufacturer][model]) {
      return {
        manufacturer: manufacturer,
        model: profiles[manufacturer][model].model,
        supportedPids: profiles[manufacturer][model].supportedPids,
        customMappings: profiles[manufacturer][model].customMappings || {}
      }
    }
    // Default to generic if not found
    return {
      manufacturer: 'Generic OBD2',
      model: 'Standard OBD2 PIDs',
      supportedPids: profiles['Generic OBD2']['standard'].supportedPids,
      customMappings: {}
    }
  },
  
  /**
   * Get all models for a specific manufacturer
   * @param {string} manufacturer - The engine manufacturer
   * @returns {Array} Array of model keys
   */
  getModelsForManufacturer: function(manufacturer) {
    if (profiles[manufacturer]) {
      return Object.keys(profiles[manufacturer])
    }
    return []
  },
  
  /**
   * Get all available manufacturers
   * @returns {Array} Array of manufacturer names
   */
  getAllManufacturers: function() {
    return Object.keys(profiles)
  },
  
  /**
   * Get all profiles (for debugging/inspection)
   * @returns {Object} All engine profiles
   */
  getAllProfiles: function() {
    return profiles
  }
}
