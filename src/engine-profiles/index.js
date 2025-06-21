// Engine profiles aggregator
// This module loads all manufacturer profiles and provides a unified interface

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
  'MTU': require('./mtu').models
}

module.exports = {
  /**
   * Get a specific engine profile
   * @param {string} manufacturer - The engine manufacturer
   * @param {string} model - The engine model
   * @returns {Object} The engine profile with manufacturer and model info
   */
  getProfile: function(manufacturer, model) {
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
