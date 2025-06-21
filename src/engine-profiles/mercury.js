// Mercury marine engine profiles
module.exports = {
  manufacturer: 'Mercury',
  models: {
    'verado-350': {
      model: 'Verado 350',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '46', '5C', '5E'
      ],
      customMappings: {}
    },
    'diesel-tdi-4.2': {
      model: 'Diesel TDI 4.2',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '42', '5C', '5E'
      ],
      customMappings: {}
    }
  }
}
