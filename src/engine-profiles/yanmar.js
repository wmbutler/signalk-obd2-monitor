// Yanmar marine engine profiles
module.exports = {
  manufacturer: 'Yanmar',
  models: {
    '4jh': {
      model: '4JH Series',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '2F',
        '42', '5C', '5E'
      ],
      customMappings: {}
    },
    '6ly': {
      model: '6LY Series',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '42', '5C', '5E'
      ],
      customMappings: {}
    },
    '8lv': {
      model: '8LV Series',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '46', '5C', '5E'
      ],
      customMappings: {}
    }
  }
}
