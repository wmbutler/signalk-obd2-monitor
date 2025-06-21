// Cummins marine engine profiles
module.exports = {
  manufacturer: 'Cummins',
  models: {
    'qsb6.7': {
      model: 'QSB 6.7',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '42', '5C', '5E'
      ],
      customMappings: {}
    },
    'qsc8.3': {
      model: 'QSC 8.3',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '5C', '5E'
      ],
      customMappings: {}
    },
    'qsl9': {
      model: 'QSL 9',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '46', '5C', '5E'
      ],
      customMappings: {}
    }
  }
}
